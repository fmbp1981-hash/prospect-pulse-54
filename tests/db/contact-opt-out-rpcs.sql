-- Teste de banco: funções de registro e revogação da oposição (TASK-002 do opt-out).
--
-- Retorna UMA LINHA POR CENÁRIO (colunas: cenario, ok, detalhe).
--   ok = true   comportamento esperado DEPOIS de 20261105120000_contact_opt_out_rpcs
--   ok = false  falha
--   ok = null   usuário/organização de teste não encontrado (ver detalhe)
-- Antes da migration as funções não existem: os cenários que as chamam vêm
-- com ok = false e detalhe 42883 (function ... does not exist).
--
-- Usuários e organizações de teste (mesma escolha de tests/db/contact-opt-outs.sql):
--   teste.adm    admin de uma organização A, que NÃO é admin da plataforma
--   teste.org_a  organização do teste.adm
--   teste.org_b  outra organização qualquer (≠ A) da qual o teste.adm não é membro
--
-- Papel e organização do teste.adm são trocados só dentro da subtransação de
-- cada tentativa (operador, visualizador, admin de B) e desfeitos com ela.
--
-- Fixtures (gravadas como postgres e desfeitas no rollback final): um lead
-- sintético em A e outro em B e quatro oposições em A (revogada, ativa só com
-- telefone, e um par revogado telefone/e-mail em linhas separadas) e uma em B.
-- Telefones e e-mails são sintéticos (+55119999901xx, *@teste.invalid).
--
-- Concorrência (AC-011) não é reproduzível numa sessão só: a garantia vem do
-- índice único (organização, telefone/e-mail) + releitura em unique_violation
-- dentro da função. Prova manual: duas abas do SQL Editor com begin; select
-- register_contact_opt_out(...) para o mesmo telefone novo; commit na primeira;
-- a segunda devolve changed = false e fica 1 linha e 1 evento.
--
-- Isolamento: tudo dentro de begin; ... rollback;. Cada tentativa roda num
-- sub-bloco encerrado pela exceção sentinela 'teste_desfaz', que desfaz a
-- escrita e o SET ROLE / request.jwt.claims locais.
--
-- Rodar como postgres (SQL editor / execute_sql). Não deixa nenhuma alteração.

begin;

select set_config('teste.adm', coalesce((
  select om.user_id::text from public.organization_members om
  where om.role = 'admin'
    and not exists (select 1 from public.platform_admins pa where pa.user_id = om.user_id)
  order by om.created_at limit 1), ''), true);
select set_config('teste.org_a', coalesce((
  select organization_id::text from public.organization_members
  where user_id::text = current_setting('teste.adm') and role = 'admin'
  order by created_at limit 1), ''), true);
select set_config('teste.org_b', coalesce((
  select id::text from public.organizations
  where id::text <> current_setting('teste.org_a')
    and not exists (select 1 from public.organization_members om
                    where om.organization_id = organizations.id
                      and om.user_id::text = current_setting('teste.adm'))
  order by created_at limit 1), ''), true);

-- Roda p_pre como postgres, depois os comandos como p_role ('authenticated'
-- com sub = p_uid, 'anon', 'service_role' ou 'postgres' = sem trocar de role),
-- e desfaz tudo. Devolve 'aceito' ou 'SQLSTATE mensagem' do primeiro erro.
create function pg_temp.tentar(p_uid uuid, p_role text, p_sqls text[], p_pre text[] default '{}')
returns text
language plpgsql
as $$
declare
  v_res text;
  v_sql text;
begin
  begin
    begin
      foreach v_sql in array p_pre loop
        execute v_sql;
      end loop;
      if p_role <> 'postgres' then
        perform set_config('request.jwt.claims',
          json_build_object('sub', p_uid, 'role', p_role)::text, true);
        perform set_config('role', p_role, true);
      end if;
      foreach v_sql in array p_sqls loop
        execute v_sql;
      end loop;
      v_res := 'aceito';
    exception when others then
      if sqlerrm = 'teste_desfaz' then raise; end if;
      v_res := sqlstate || ' ' || sqlerrm;
    end;
    raise exception 'teste_desfaz';
  exception when others then
    if sqlerrm <> 'teste_desfaz' then v_res := 'erro ' || sqlstate || ' ' || sqlerrm; end if;
  end;
  return v_res;
end $$;

do $$
declare
  v_adm uuid := nullif(current_setting('teste.adm'), '')::uuid;
  v_org_a uuid := nullif(current_setting('teste.org_a'), '')::uuid;
  v_org_b uuid := nullif(current_setting('teste.org_b'), '')::uuid;
  v_rev uuid := gen_random_uuid();     -- A, revogada, +5511999990111
  v_ph uuid := gen_random_uuid();      -- A, ativa, só telefone +5511999990112
  v_sep_p uuid := gen_random_uuid();   -- A, revogada, só telefone +5511999990113
  v_sep_e uuid := gen_random_uuid();   -- A, revogada, só e-mail sep@teste.invalid
  v_ob uuid := gen_random_uuid();      -- B, ativa, +5511999990114
  v_lead text := 'teste-optout-rpc-' || replace(gen_random_uuid()::text, '-', '');
  v_lead_b text := 'teste-optout-rpc-b-' || replace(gen_random_uuid()::text, '-', '');
  v_res text;
  v_n int;
  -- register(organização, telefone, e-mail, origem, autor, id do autor, lead, id da mensagem)
  c_reg constant text :=
    'public.register_contact_opt_out(p_organization_id => %L, p_phone_e164 => %L, '
    'p_email_normalized => %L, p_source => %L, p_actor_type => %L, p_actor_user_id => %L, '
    'p_lead_id => %L, p_evidence_message_id => %L)';
  -- revoke(organização, oposição, motivo, autor)
  c_rev constant text :=
    'public.revoke_contact_opt_out(%L, %L, %L, %L)';
  -- 'aceito' só se a expressão for verdadeira (senão 22012 divisão por zero)
  c_sim constant text := 'select 1 / (case when (%s) then 1 else 0 end)';
  c_pre_b text[];
begin
  if v_adm is null or v_org_a is null or v_org_b is null then
    for v_n in 1..22 loop
      perform set_config('teste.c' || v_n || '_ok', '', true);
      perform set_config('teste.c' || v_n || '_det',
        'sem admin de org (fora de platform_admins) e uma segunda organização', true);
    end loop;
    return;
  end if;

  c_pre_b := array[format(
    'update public.organization_members set organization_id = %L where user_id = %L', v_org_b, v_adm)];

  -- Fixtures (postgres)
  insert into public.leads_prospeccao (id, lead, empresa, organization_id)
  values (v_lead, v_lead, 'Empresa Teste Opt-out RPC', v_org_a),
         (v_lead_b, v_lead_b, 'Empresa Teste Opt-out RPC B', v_org_b);
  insert into public.contact_opt_outs
    (id, organization_id, phone_e164, email_normalized, status, source, revoked_at)
  values (v_rev, v_org_a, '+5511999990111', null, 'revoked', 'usuario', now()),
         (v_ph, v_org_a, '+5511999990112', null, 'active', 'usuario', null),
         (v_sep_p, v_org_a, '+5511999990113', null, 'revoked', 'usuario', now()),
         (v_sep_e, v_org_a, null, 'sep@teste.invalid', 'revoked', 'usuario', now()),
         (v_ob, v_org_b, '+5511999990114', null, 'active', 'link_email', null);
  insert into public.contact_opt_out_events (organization_id, opt_out_id, event_type, source, actor_type)
  values (v_org_a, v_rev, 'opt_out', 'usuario', 'usuario'),
         (v_org_a, v_ph, 'opt_out', 'usuario', 'usuario'),
         (v_org_b, v_ob, 'opt_out', 'link_email', 'titular');

  -- 1. pessoa nova: oposição ativa + 1 evento opt_out na mesma chamada (AC-001)
  v_res := pg_temp.tentar(null, 'service_role', array[
    format(c_sim, format('(select changed from %s)',
      format(c_reg, v_org_a, '+5511999990120', 'nova@teste.invalid', 'link_email', 'titular', null, v_lead, 'wamid.ABC123'))),
    format(c_sim, format(
      'select count(*) = 1 from public.contact_opt_outs where organization_id = %L and phone_e164 = %L '
      'and email_normalized = %L and status = ''active'' and lead_id = %L', v_org_a, '+5511999990120', 'nova@teste.invalid', v_lead)),
    format(c_sim, format(
      'select count(*) = 1 from public.contact_opt_out_events e join public.contact_opt_outs o on o.id = e.opt_out_id '
      'where o.phone_e164 = %L and e.event_type = ''opt_out'' and e.actor_type = ''titular'' '
      'and e.evidence_message_id = ''wamid.ABC123''', '+5511999990120'))]);
  perform set_config('teste.c1_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c1_det', case when v_res = 'aceito' then '1 linha ativa, 1 evento' else v_res end, true);

  -- 2. pedido repetido (telefone de novo, depois só o e-mail): nada muda (AC-002)
  v_res := pg_temp.tentar(null, 'service_role', array[
    format('select * from %s', format(c_reg, v_org_a, '+5511999990121', 'repetida@teste.invalid', 'link_email', 'titular', null, null, null)),
    format(c_sim, format('(select not changed from %s)',
      format(c_reg, v_org_a, '+5511999990121', null, 'whatsapp_titular', 'titular', null, null, null))),
    format(c_sim, format('(select not changed from %s)',
      format(c_reg, v_org_a, null, 'repetida@teste.invalid', 'link_email', 'sistema', null, null, null))),
    format(c_sim, format(
      'select count(*) = 1 from public.contact_opt_outs where organization_id = %L '
      'and (phone_e164 = %L or email_normalized = %L)', v_org_a, '+5511999990121', 'repetida@teste.invalid')),
    format(c_sim, format(
      'select count(*) = 1 from public.contact_opt_out_events e join public.contact_opt_outs o on o.id = e.opt_out_id '
      'where o.phone_e164 = %L', '+5511999990121'))]);
  perform set_config('teste.c2_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c2_det', case when v_res = 'aceito' then '1 linha, 1 evento, changed=false' else v_res end, true);

  -- 3. revogada volta a ativa na mesma linha, com evento opt_out novo (AC-006)
  v_res := pg_temp.tentar(null, 'service_role', array[
    format(c_sim, format('(select opt_out_id = %L and changed from %s)', v_rev,
      format(c_reg, v_org_a, '+5511999990111', null, 'agente_ia', 'agente_ia', null, null, null))),
    format(c_sim, format(
      'select status = ''active'' and revoked_at is null and source = ''agente_ia'' '
      'from public.contact_opt_outs where id = %L', v_rev)),
    format(c_sim, format(
      'select count(*) = 1 from public.contact_opt_outs where organization_id = %L and phone_e164 = %L',
      v_org_a, '+5511999990111')),
    format(c_sim, format(
      'select count(*) = 2 from public.contact_opt_out_events where opt_out_id = %L and event_type = ''opt_out''', v_rev))]);
  perform set_config('teste.c3_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c3_det', case when v_res = 'aceito' then 'mesma linha ativa, 2 eventos opt_out' else v_res end, true);

  -- 4. ativa só com telefone: pedido com e-mail novo preenche o e-mail, sem evento
  v_res := pg_temp.tentar(null, 'service_role', array[
    format(c_sim, format('(select opt_out_id = %L and not changed from %s)', v_ph,
      format(c_reg, v_org_a, '+5511999990112', 'preenche@teste.invalid', 'link_email', 'titular', null, v_lead, null))),
    format(c_sim, format(
      'select email_normalized = ''preenche@teste.invalid'' and lead_id = %L from public.contact_opt_outs where id = %L',
      v_lead, v_ph)),
    format(c_sim, format('select count(*) = 1 from public.contact_opt_out_events where opt_out_id = %L', v_ph))]);
  perform set_config('teste.c4_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c4_det', case when v_res = 'aceito' then 'e-mail e lead preenchidos, 0 evento novo' else v_res end, true);

  -- 5. telefone e e-mail em linhas separadas, ambas revogadas: as duas voltam,
  --    1 evento cada, devolve a linha do telefone; nenhuma ganha o identificador da outra
  v_res := pg_temp.tentar(null, 'service_role', array[
    format(c_sim, format('(select opt_out_id = %L and changed from %s)', v_sep_p,
      format(c_reg, v_org_a, '+5511999990113', 'sep@teste.invalid', 'link_email', 'titular', null, null, null))),
    format(c_sim, format(
      'select count(*) = 2 from public.contact_opt_outs where id in (%L, %L) and status = ''active''', v_sep_p, v_sep_e)),
    format(c_sim, format(
      'select email_normalized is null from public.contact_opt_outs where id = %L', v_sep_p)),
    format(c_sim, format(
      'select phone_e164 is null from public.contact_opt_outs where id = %L', v_sep_e)),
    format(c_sim, format(
      'select count(*) = 2 from public.contact_opt_out_events where opt_out_id in (%L, %L)', v_sep_p, v_sep_e))]);
  perform set_config('teste.c5_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c5_det', case when v_res = 'aceito' then '2 linhas ativas, 2 eventos' else v_res end, true);

  -- 6. admin revoga: situação revogada + evento revoke com motivo e autor
  v_res := pg_temp.tentar(null, 'service_role', array[
    format(c_sim, format('(select opt_out_id = %L and changed from %s)', v_ph,
      format(c_rev, v_org_a, v_ph, 'novo consentimento do titular', v_adm))),
    format(c_sim, format(
      'select status = ''revoked'' and revoked_at is not null from public.contact_opt_outs where id = %L', v_ph)),
    format(c_sim, format(
      'select count(*) = 1 from public.contact_opt_out_events where opt_out_id = %L and event_type = ''revoke'' '
      'and reason = ''novo consentimento do titular'' and actor_user_id = %L and actor_type = ''usuario''', v_ph, v_adm))]);
  perform set_config('teste.c6_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c6_det', case when v_res = 'aceito' then 'revogada, 1 evento revoke' else v_res end, true);

  -- 7. revogar o que já está revogado: changed = false, sem evento
  v_res := pg_temp.tentar(null, 'service_role', array[
    format(c_sim, format('(select not changed from %s)',
      format(c_rev, v_org_a, v_rev, 'registro feito por engano', v_adm))),
    format(c_sim, format('select count(*) = 0 from public.contact_opt_out_events where opt_out_id = %L and event_type = ''revoke''', v_rev))]);
  perform set_config('teste.c7_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c7_det', case when v_res = 'aceito' then 'changed=false, 0 evento' else v_res end, true);

  -- 8. revogar oposição de A informando B (autor admin de B) → P0002 (AC-007)
  v_res := pg_temp.tentar(null, 'service_role', array[
    format('select * from %s', format(c_rev, v_org_b, v_ph, 'tentativa entre organizações', v_adm))], c_pre_b);
  perform set_config('teste.c8_ok', (v_res like 'P0002%')::text, true);
  perform set_config('teste.c8_det', v_res, true);

  -- 9. registrar em B o telefone de A: linha nova em B, A intacta (AC-007)
  v_res := pg_temp.tentar(null, 'service_role', array[
    format(c_sim, format('(select opt_out_id <> %L and changed from %s)', v_ph,
      format(c_reg, v_org_b, '+5511999990112', null, 'link_email', 'titular', null, null, null))),
    format(c_sim, format(
      'select count(*) = 1 from public.contact_opt_outs where organization_id = %L and phone_e164 = %L',
      v_org_b, '+5511999990112')),
    format(c_sim, format(
      'select status = ''active'' and email_normalized is null from public.contact_opt_outs where id = %L', v_ph)),
    format(c_sim, format('select count(*) = 1 from public.contact_opt_out_events where opt_out_id = %L', v_ph))]);
  perform set_config('teste.c9_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c9_det', case when v_res = 'aceito' then 'B com linha própria, A sem mudança' else v_res end, true);

  -- 10. evento recusado desfaz a linha nova (id de mensagem inválido) (AC-008)
  v_res := pg_temp.tentar(null, 'service_role', array[format(
    'do $t$ begin '
      'begin perform %s; raise exception ''nao_recusou''; '
      'exception when check_violation then null; end; '
      'if exists (select 1 from public.contact_opt_outs where phone_e164 = %L) then '
        'raise exception ''linha_ficou''; end if; '
    'end $t$',
    format(c_reg, v_org_a, '+5511999990130', null, 'whatsapp_titular', 'titular', null, null, 'texto da mensagem'),
    '+5511999990130')]);
  perform set_config('teste.c10_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c10_det', case when v_res = 'aceito' then '23514 e nenhuma linha' else v_res end, true);

  -- 11. evento recusado desfaz a reativação (revogada continua revogada) (AC-008)
  v_res := pg_temp.tentar(null, 'service_role', array[format(
    'do $t$ begin '
      'begin perform %s; raise exception ''nao_recusou''; '
      'exception when check_violation then null; end; '
      'if not exists (select 1 from public.contact_opt_outs where id = %L and status = ''revoked'') then '
        'raise exception ''situacao_mudou''; end if; '
    'end $t$',
    format(c_reg, v_org_a, '+5511999990111', null, 'whatsapp_titular', 'titular', null, null, 'texto da mensagem'),
    v_rev)]);
  perform set_config('teste.c11_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c11_det', case when v_res = 'aceito' then '23514 e continua revogada' else v_res end, true);

  -- 12. revogação sem motivo, só espaços ou > 500 caracteres → 23514 e continua ativa (AC-004)
  v_res := pg_temp.tentar(null, 'service_role', array[format(
    'do $t$ begin '
      'begin perform %s; raise exception ''nao_recusou_nulo''; exception when check_violation then null; end; '
      'begin perform %s; raise exception ''nao_recusou_espacos''; exception when check_violation then null; end; '
      'begin perform %s; raise exception ''nao_recusou_longo''; exception when check_violation then null; end; '
      'if not exists (select 1 from public.contact_opt_outs where id = %L and status = ''active'') then '
        'raise exception ''situacao_mudou''; end if; '
    'end $t$',
    format(c_rev, v_org_a, v_ph, null, v_adm),
    format(c_rev, v_org_a, v_ph, E'   \t ', v_adm),
    format(c_rev, v_org_a, v_ph, repeat('x', 501), v_adm),
    v_ph)]);
  perform set_config('teste.c12_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c12_det', case when v_res = 'aceito' then '3 recusas 23514, continua ativa' else v_res end, true);

  -- 13. anon não executa as funções → 42501 (AC-009)
  v_res := pg_temp.tentar(null, 'anon', array[
    format('select * from %s', format(c_reg, v_org_a, '+5511999990140', null, 'link_email', 'titular', null, null, null))]);
  if v_res like '42501%' then
    v_res := pg_temp.tentar(null, 'anon', array[
      format('select * from %s', format(c_rev, v_org_a, v_ph, 'motivo valido', v_adm))]);
  end if;
  perform set_config('teste.c13_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c13_det', v_res, true);

  -- 14. authenticated (admin da org) não executa as funções → 42501 (AC-009)
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[
    format('select * from %s', format(c_reg, v_org_a, '+5511999990141', null, 'usuario', 'usuario', v_adm, null, null))]);
  if v_res like '42501%' then
    v_res := pg_temp.tentar(v_adm, 'authenticated', array[
      format('select * from %s', format(c_rev, v_org_a, v_ph, 'motivo valido', v_adm))]);
  end if;
  perform set_config('teste.c14_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c14_det', v_res, true);

  -- 15. autor operador não revoga → 42501 (AC-003, no banco)
  v_res := pg_temp.tentar(null, 'service_role', array[
    format('select * from %s', format(c_rev, v_org_a, v_ph, 'motivo valido', v_adm))],
    array[format('update public.organization_members set role = ''operador'' where user_id = %L', v_adm)]);
  perform set_config('teste.c15_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c15_det', v_res, true);

  -- 16. autor visualizador não registra → 42501; operador registra
  v_res := pg_temp.tentar(null, 'service_role', array[
    format('select * from %s', format(c_reg, v_org_a, '+5511999990150', null, 'usuario', 'usuario', v_adm, null, null))],
    array[format('update public.organization_members set role = ''visualizador'' where user_id = %L', v_adm)]);
  if v_res like '42501%' then
    v_res := pg_temp.tentar(null, 'service_role', array[
      format(c_sim, format('(select changed from %s)',
        format(c_reg, v_org_a, '+5511999990150', null, 'usuario', 'usuario', v_adm, null, null)))],
      array[format('update public.organization_members set role = ''operador'' where user_id = %L', v_adm)]);
    perform set_config('teste.c16_ok', (v_res = 'aceito')::text, true);
  else
    perform set_config('teste.c16_ok', 'false', true);
  end if;
  perform set_config('teste.c16_det', v_res, true);

  -- 17. autor usuario de outra organização não registra em A → 42501
  v_res := pg_temp.tentar(null, 'service_role', array[
    format('select * from %s', format(c_reg, v_org_a, '+5511999990151', null, 'usuario', 'usuario', v_adm, null, null))],
    c_pre_b);
  perform set_config('teste.c17_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c17_det', v_res, true);

  -- 18. lead de B numa oposição de A → 23503 e nada gravado
  v_res := pg_temp.tentar(null, 'service_role', array[format(
    'do $t$ begin '
      'begin perform %s; raise exception ''nao_recusou''; '
      'exception when foreign_key_violation then null; end; '
      'if exists (select 1 from public.contact_opt_outs where phone_e164 = %L) then '
        'raise exception ''linha_ficou''; end if; '
    'end $t$',
    format(c_reg, v_org_a, '+5511999990160', null, 'usuario', 'usuario', v_adm, v_lead_b, null),
    '+5511999990160')]);
  perform set_config('teste.c18_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c18_det', case when v_res = 'aceito' then '23503 e nenhuma linha' else v_res end, true);

  -- 19. parâmetros inválidos → 22023 (sem identificador; autor usuario sem id)
  v_res := pg_temp.tentar(null, 'service_role', array[
    format('select * from %s', format(c_reg, v_org_a, null, null, 'link_email', 'titular', null, null, null))]);
  if v_res like '22023%' then
    v_res := pg_temp.tentar(null, 'service_role', array[
      format('select * from %s', format(c_reg, v_org_a, '+5511999990170', null, 'usuario', 'usuario', null, null, null))]);
  end if;
  perform set_config('teste.c19_ok', (v_res like '22023%')::text, true);
  perform set_config('teste.c19_det', v_res, true);

  -- 20. revogar id inexistente → P0002
  v_res := pg_temp.tentar(null, 'service_role', array[
    format('select * from %s', format(c_rev, v_org_a, gen_random_uuid(), 'motivo valido', v_adm))]);
  perform set_config('teste.c20_ok', (v_res like 'P0002%')::text, true);
  perform set_config('teste.c20_det', v_res, true);

  -- 21. funções SECURITY INVOKER com search_path = public, pg_temp
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('register_contact_opt_out', 'revoke_contact_opt_out')
     and not p.prosecdef
     and 'search_path=public, pg_temp' = any (coalesce(p.proconfig, '{}'::text[]));
  perform set_config('teste.c21_ok', (v_n = 2)::text, true);
  perform set_config('teste.c21_det', v_n || ' de 2 funções conformes', true);

  -- 22. data da prova é a do banco: evento novo com created_at = now() da transação
  v_res := pg_temp.tentar(null, 'service_role', array[
    format('select * from %s', format(c_reg, v_org_a, '+5511999990180', null, 'link_email', 'titular', null, null, null)),
    format(c_sim, format(
      'select count(*) = 1 from public.contact_opt_out_events e join public.contact_opt_outs o on o.id = e.opt_out_id '
      'where o.phone_e164 = %L and e.created_at = now()', '+5511999990180'))]);
  perform set_config('teste.c22_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c22_det', case when v_res = 'aceito' then 'created_at = now()' else v_res end, true);
end $$;

select c.cenario,
       nullif(current_setting('teste.c' || c.n || '_ok', true), '')::boolean as ok,
       current_setting('teste.c' || c.n || '_det', true) as detalhe
from (values
  (1, '1. pessoa nova: oposição ativa + evento opt_out (AC-001)'),
  (2, '2. pedido repetido não grava linha nem evento (AC-002)'),
  (3, '3. revogada volta a ativa na mesma linha + evento (AC-006)'),
  (4, '4. ativa sem e-mail: preenche e-mail e lead, sem evento'),
  (5, '5. telefone e e-mail em linhas separadas: ambas ativas'),
  (6, '6. admin revoga: revogada + evento revoke com motivo'),
  (7, '7. revogar já revogada: sem mudança e sem evento'),
  (8, '8. revogar oposição de A informando B → P0002 (AC-007)'),
  (9, '9. registrar em B o telefone de A: A intacta (AC-007)'),
  (10, '10. evento recusado desfaz a linha nova (AC-008)'),
  (11, '11. evento recusado desfaz a reativação (AC-008)'),
  (12, '12. motivo nulo/espaços/> 500 → 23514, continua ativa (AC-004)'),
  (13, '13. anon não executa as funções → 42501 (AC-009)'),
  (14, '14. authenticated não executa as funções → 42501 (AC-009)'),
  (15, '15. autor operador não revoga → 42501 (AC-003)'),
  (16, '16. visualizador não registra (42501); operador registra'),
  (17, '17. autor de outra organização não registra → 42501'),
  (18, '18. lead de outra organização → 23503, nada gravado'),
  (19, '19. parâmetros inválidos → 22023'),
  (20, '20. revogar id inexistente → P0002'),
  (21, '21. SECURITY INVOKER e search_path fixo'),
  (22, '22. created_at do evento é o do banco')
) as c(n, cenario)
order by c.n;

rollback;
