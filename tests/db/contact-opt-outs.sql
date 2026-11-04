-- Teste de banco: oposição de contatos por organização (TASK-001 do opt-out).
--
-- Retorna UMA LINHA POR CENÁRIO (colunas: cenario, ok, detalhe).
--   ok = true   comportamento esperado DEPOIS de 20261105100000_contact_opt_outs
--   ok = false  falha
--   ok = null   usuário/organização de teste não encontrado (ver detalhe)
-- Antes da migration as tabelas não existem: o script falha com 42P01.
--
-- Usuários e organizações de teste:
--   teste.adm    admin de uma organização A, que NÃO é admin da plataforma
--   teste.org_a  organização do teste.adm
--   teste.org_b  outra organização qualquer (≠ A) da qual o teste.adm não é membro
--
-- Fixtures (gravadas como postgres e desfeitas no rollback final): um lead
-- sintético em A, uma oposição em A (ligada ao lead) e uma em B, com um evento
-- cada. Telefones e e-mails são sintéticos (+55119999900xx, *@teste.invalid).
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

-- Executa os comandos como p_role ('authenticated' com sub = p_uid, 'anon',
-- 'service_role' ou 'postgres' = sem trocar de role) e desfaz tudo.
-- Devolve 'aceito' ou 'SQLSTATE mensagem' do primeiro erro.
create function pg_temp.tentar(p_uid uuid, p_role text, p_sqls text[])
returns text
language plpgsql
as $$
declare
  v_res text;
  v_sql text;
begin
  begin
    begin
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
  v_opt_a uuid := gen_random_uuid();
  v_opt_b uuid := gen_random_uuid();
  v_lead text := 'teste-optout-' || replace(gen_random_uuid()::text, '-', '');
  v_res text;
  v_n int;
  -- oposição: (organização, telefone, e-mail, origem)
  c_opt constant text :=
    'insert into public.contact_opt_outs (organization_id, phone_e164, email_normalized, source) '
    'values (%L, %L, %L, %L)';
  -- evento: (organização, oposição, tipo, origem, motivo)
  c_evt constant text :=
    'insert into public.contact_opt_out_events (organization_id, opt_out_id, event_type, source, actor_type, reason) '
    'values (%L, %L, %L, ''usuario'', ''usuario'', %L)';
  -- 'aceito' só se a contagem for exatamente 1 (senão 22012 divisão por zero)
  c_um constant text := 'select 1 / (case when (%s) = 1 then 1 else 0 end)';
  -- 'aceito' só se a contagem for exatamente 0
  c_zero constant text := 'select 1 / (case when (%s) = 0 then 1 else 0 end)';
begin
  if v_adm is null or v_org_a is null or v_org_b is null then
    for v_n in 1..22 loop
      perform set_config('teste.c' || v_n || '_ok', '', true);
      perform set_config('teste.c' || v_n || '_det',
        'sem admin de org (fora de platform_admins) e uma segunda organização', true);
    end loop;
    return;
  end if;

  -- Fixtures (postgres)
  insert into public.leads_prospeccao (id, lead, empresa, organization_id)
  values (v_lead, v_lead, 'Empresa Teste Opt-out', v_org_a);
  insert into public.contact_opt_outs (id, organization_id, phone_e164, email_normalized, source, lead_id)
  values (v_opt_a, v_org_a, '+5511999990001', 'titular.a@teste.invalid', 'usuario', v_lead),
         (v_opt_b, v_org_b, '+5511999990002', null, 'link_email', null);
  insert into public.contact_opt_out_events (organization_id, opt_out_id, event_type, source, actor_type)
  values (v_org_a, v_opt_a, 'opt_out', 'usuario', 'usuario'),
         (v_org_b, v_opt_b, 'opt_out', 'link_email', 'titular');

  -- 1. membro lê a oposição da própria organização
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[format(c_um,
    format('select count(*) from public.contact_opt_outs where id = %L', v_opt_a))]);
  perform set_config('teste.c1_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c1_det', case when v_res = 'aceito' then '1 linha' else v_res end, true);

  -- 2. membro não lê a oposição de outra organização
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[format(c_zero,
    format('select count(*) from public.contact_opt_outs where id = %L', v_opt_b))]);
  perform set_config('teste.c2_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c2_det', case when v_res = 'aceito' then '0 linha' else v_res end, true);

  -- 3. membro lê o histórico da própria organização e não o de outra
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[
    format(c_um, format('select count(*) from public.contact_opt_out_events where opt_out_id = %L', v_opt_a)),
    format(c_zero, format('select count(*) from public.contact_opt_out_events where opt_out_id = %L', v_opt_b))]);
  perform set_config('teste.c3_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c3_det', case when v_res = 'aceito' then 'A=1, B=0' else v_res end, true);

  -- 4. anon não lê nenhuma das duas tabelas → 42501
  v_res := pg_temp.tentar(null, 'anon', array['select count(*) from public.contact_opt_outs']);
  if v_res like '42501%' then
    v_res := pg_temp.tentar(null, 'anon', array['select count(*) from public.contact_opt_out_events']);
  end if;
  perform set_config('teste.c4_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c4_det', v_res, true);

  -- 5. admin de organização não insere oposição pela sessão → 42501
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[
    format(c_opt, v_org_a, '+5511999990003', null, 'usuario')]);
  perform set_config('teste.c5_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c5_det', v_res, true);

  -- 6. admin de organização não atualiza oposição pela sessão → 42501
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[
    format('update public.contact_opt_outs set status = ''revoked'' where id = %L', v_opt_a)]);
  perform set_config('teste.c6_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c6_det', v_res, true);

  -- 7. admin de organização não apaga oposição pela sessão → 42501
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[
    format('delete from public.contact_opt_outs where id = %L', v_opt_a)]);
  perform set_config('teste.c7_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c7_det', v_res, true);

  -- 8. admin de organização não insere evento pela sessão → 42501
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[
    format(c_evt, v_org_a, v_opt_a, 'revoke', 'novo consentimento')]);
  perform set_config('teste.c8_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c8_det', v_res, true);

  -- 9. admin de organização não altera nem apaga evento pela sessão → 42501
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[
    format('update public.contact_opt_out_events set reason = ''x'' where opt_out_id = %L', v_opt_a)]);
  if v_res like '42501%' then
    v_res := pg_temp.tentar(v_adm, 'authenticated', array[
      format('delete from public.contact_opt_out_events where opt_out_id = %L', v_opt_a)]);
  end if;
  perform set_config('teste.c9_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c9_det', v_res, true);

  -- 10. servidor (service_role) registra oposição, evento e revogação
  v_res := pg_temp.tentar(null, 'service_role', array[
    format(c_opt, v_org_a, '+5511999990004', 'outro.titular@teste.invalid', 'agente_ia'),
    format(c_evt, v_org_a, v_opt_a, 'revoke', 'novo consentimento do titular'),
    format('update public.contact_opt_outs set status = ''revoked'', revoked_at = now() where id = %L', v_opt_a)]);
  perform set_config('teste.c10_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c10_det', v_res, true);

  -- 11. servidor não altera evento → 42501
  v_res := pg_temp.tentar(null, 'service_role', array[
    format('update public.contact_opt_out_events set reason = ''x'' where opt_out_id = %L', v_opt_a)]);
  perform set_config('teste.c11_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c11_det', v_res, true);

  -- 12. servidor não apaga evento → 42501
  v_res := pg_temp.tentar(null, 'service_role', array[
    format('delete from public.contact_opt_out_events where opt_out_id = %L', v_opt_a)]);
  perform set_config('teste.c12_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c12_det', v_res, true);

  -- 13. servidor não trunca o histórico → 42501
  v_res := pg_temp.tentar(null, 'service_role', array[
    'truncate public.contact_opt_out_events']);
  perform set_config('teste.c13_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c13_det', v_res, true);

  -- 14. servidor não apaga oposição → 42501
  v_res := pg_temp.tentar(null, 'service_role', array[
    format('delete from public.contact_opt_outs where id = %L', v_opt_a)]);
  perform set_config('teste.c14_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c14_det', v_res, true);

  -- 15. lead excluído: lead_id vira null e a oposição continua vigente
  v_res := pg_temp.tentar(null, 'postgres', array[
    format('delete from public.leads_prospeccao where id = %L', v_lead),
    format(c_um, format('select count(*) from public.contact_opt_outs where id = %L '
      'and lead_id is null and status = ''active'' and phone_e164 = ''+5511999990001''', v_opt_a))]);
  perform set_config('teste.c15_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c15_det', case when v_res = 'aceito' then 'lead_id null, active' else v_res end, true);

  -- 16. mesmo telefone em outra organização é aceito; repetido na mesma → 23505
  v_res := pg_temp.tentar(null, 'service_role', array[
    format(c_opt, v_org_b, '+5511999990001', null, 'usuario')]);
  if v_res = 'aceito' then
    v_res := pg_temp.tentar(null, 'service_role', array[
      format(c_opt, v_org_a, '+5511999990001', null, 'usuario')]);
  else
    v_res := 'outra org recusou: ' || v_res;
  end if;
  perform set_config('teste.c16_ok', (v_res like '23505%')::text, true);
  perform set_config('teste.c16_det', v_res, true);

  -- 17. mesmo e-mail repetido na mesma organização → 23505
  v_res := pg_temp.tentar(null, 'service_role', array[
    format(c_opt, v_org_a, null, 'titular.a@teste.invalid', 'usuario')]);
  perform set_config('teste.c17_ok', (v_res like '23505%')::text, true);
  perform set_config('teste.c17_det', v_res, true);

  -- 18. sem telefone e sem e-mail → 23514
  v_res := pg_temp.tentar(null, 'service_role', array[format(c_opt, v_org_a, null, null, 'usuario')]);
  perform set_config('teste.c18_ok', (v_res like '23514%')::text, true);
  perform set_config('teste.c18_det', v_res, true);

  -- 19. telefone fora de E.164 → 23514
  v_res := pg_temp.tentar(null, 'service_role', array[format(c_opt, v_org_a, '11999990005', null, 'usuario')]);
  perform set_config('teste.c19_ok', (v_res like '23514%')::text, true);
  perform set_config('teste.c19_det', v_res, true);

  -- 20. e-mail não normalizado (maiúscula ou espaço) → 23514
  v_res := pg_temp.tentar(null, 'service_role', array[format(c_opt, v_org_a, null, 'Titular.C@teste.invalid', 'usuario')]);
  if v_res like '23514%' then
    v_res := pg_temp.tentar(null, 'service_role', array[format(c_opt, v_org_a, null, ' c@teste.invalid', 'usuario')]);
  end if;
  perform set_config('teste.c20_ok', (v_res like '23514%')::text, true);
  perform set_config('teste.c20_det', v_res, true);

  -- 21. origem fora da lista → 23514
  v_res := pg_temp.tentar(null, 'service_role', array[format(c_opt, v_org_a, '+5511999990006', null, 'planilha')]);
  perform set_config('teste.c21_ok', (v_res like '23514%')::text, true);
  perform set_config('teste.c21_det', v_res, true);

  -- 22. revogação sem motivo (nulo ou em branco) → 23514
  v_res := pg_temp.tentar(null, 'service_role', array[format(c_evt, v_org_a, v_opt_a, 'revoke', null)]);
  if v_res like '23514%' then
    v_res := pg_temp.tentar(null, 'service_role', array[format(c_evt, v_org_a, v_opt_a, 'revoke', '   ')]);
  end if;
  perform set_config('teste.c22_ok', (v_res like '23514%')::text, true);
  perform set_config('teste.c22_det', v_res, true);
end $$;

select c.cenario,
       nullif(current_setting('teste.c' || c.n || '_ok', true), '')::boolean as ok,
       current_setting('teste.c' || c.n || '_det', true) as detalhe
from (values
  (1, '1. membro lê a oposição da própria organização'),
  (2, '2. membro não lê a oposição de outra organização'),
  (3, '3. membro lê o histórico da própria organização e não o de outra'),
  (4, '4. anon não lê oposições nem histórico → 42501'),
  (5, '5. admin de organização não insere oposição pela sessão → 42501'),
  (6, '6. admin de organização não atualiza oposição pela sessão → 42501'),
  (7, '7. admin de organização não apaga oposição pela sessão → 42501'),
  (8, '8. admin de organização não insere evento pela sessão → 42501'),
  (9, '9. admin de organização não altera nem apaga evento → 42501'),
  (10, '10. servidor registra oposição, evento e revogação'),
  (11, '11. servidor não altera evento → 42501'),
  (12, '12. servidor não apaga evento → 42501'),
  (13, '13. servidor não trunca o histórico → 42501'),
  (14, '14. servidor não apaga oposição → 42501'),
  (15, '15. lead excluído: lead_id null e oposição vigente'),
  (16, '16. mesmo telefone: outra org aceita, mesma org → 23505'),
  (17, '17. mesmo e-mail na mesma organização → 23505'),
  (18, '18. sem telefone e sem e-mail → 23514'),
  (19, '19. telefone fora de E.164 → 23514'),
  (20, '20. e-mail não normalizado → 23514'),
  (21, '21. origem fora da lista → 23514'),
  (22, '22. revogação sem motivo → 23514')
) as c(n, cenario)
order by c.n;

rollback;
