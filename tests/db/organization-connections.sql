-- Teste de banco: conexões por organização, credenciais da plataforma e
-- consumo (Sprint 2b, Task 2).
--
-- Retorna UMA LINHA POR CENÁRIO (colunas: cenario, ok, detalhe).
--   ok = true   comportamento esperado DEPOIS de 20261031100000_organization_connections
--   ok = false  falha
--   ok = null   usuário/organização de teste não encontrado (ver detalhe)
-- Antes da migration as tabelas não existem: rodar só depois.
--
-- Usuários e organizações de teste:
--   teste.adm    admin de uma organização A, que NÃO é admin da plataforma
--   teste.org_a  organização do teste.adm
--   teste.org_b  outra organização qualquer (≠ A)
--   teste.padm   admin da plataforma (public.platform_admins), o mais antigo
--
-- Fixtures (gravadas como postgres e desfeitas no rollback final): as conexões
-- já existentes das orgs A e B são apagadas dentro da transação; depois são
-- criadas uma conexão llm/openai em A e em B, um usage_event em A e em B e uma
-- credencial da plataforma (se ainda não houver para openai).
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
select set_config('teste.padm', coalesce((
  select user_id::text from public.platform_admins
  order by created_at limit 1), ''), true);

-- Executa os comandos como p_role ('authenticated' com sub = p_uid, 'anon' ou
-- 'postgres' = sem trocar de role) e desfaz tudo.
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
  v_padm uuid := nullif(current_setting('teste.padm'), '')::uuid;
  v_conn_a uuid := gen_random_uuid();
  v_conn_b uuid := gen_random_uuid();
  v_res text;
  v_n int;
  c_ins constant text :=
    'insert into public.organization_connections (id, organization_id, category, provider, credential_source) '
    'values (%L, %L, %L, %L, %L)';
  -- conexão whatsapp/evolution com config.instanceName = %L
  c_evo constant text :=
    'insert into public.organization_connections (organization_id, category, provider, credential_source, config) '
    'values (%L, ''whatsapp'', ''evolution'', ''own'', jsonb_build_object(''instanceName'', %L::text))';
  -- 'aceito' só se a contagem for exatamente 1 (senão 22012 divisão por zero)
  c_um constant text := 'select 1 / (case when (%s) = 1 then 1 else 0 end)';
  -- 'aceito' só se a contagem for exatamente 0
  c_zero constant text := 'select 1 / (case when (%s) = 0 then 1 else 0 end)';
begin
  if v_adm is null or v_org_a is null or v_org_b is null then
    for v_n in 1..24 loop
      perform set_config('teste.c' || v_n || '_ok', '', true);
      perform set_config('teste.c' || v_n || '_det',
        'sem admin de org (fora de platform_admins) e uma segunda organização', true);
    end loop;
    return;
  end if;

  -- Fixtures (postgres)
  delete from public.organization_connections where organization_id in (v_org_a, v_org_b);
  insert into public.organization_connections (id, organization_id, category, provider, credential_source)
  values (v_conn_a, v_org_a, 'llm', 'openai', 'platform'),
         (v_conn_b, v_org_b, 'llm', 'openai', 'platform');
  insert into public.usage_events (organization_id, category, provider, operation, quantity, unit, connection_id)
  values (v_org_a, 'llm', 'openai', 'teste-completion', 10, 'tokens', v_conn_a),
         (v_org_b, 'llm', 'openai', 'teste-completion', 20, 'tokens', v_conn_b);
  insert into public.platform_credentials (provider, secret)
  values ('openai', '{"v":"v1","iv":"dGVzdGU=","ct":"dGVzdGU="}'::jsonb)
  on conflict (provider) do nothing;

  -- 1. membro lê a conexão da própria organização
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[format(c_um,
    format('select count(*) from public.organization_connections where id = %L', v_conn_a))]);
  perform set_config('teste.c1_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c1_det', case when v_res = 'aceito' then '1 linha' else v_res end, true);

  -- 2. membro não lê a conexão de outra organização
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[format(c_zero,
    format('select count(*) from public.organization_connections where id = %L', v_conn_b))]);
  perform set_config('teste.c2_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c2_det', case when v_res = 'aceito' then '0 linha' else v_res end, true);

  -- 3. membro não lê secret → 42501
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[
    format('select secret from public.organization_connections where id = %L', v_conn_a)]);
  perform set_config('teste.c3_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c3_det', v_res, true);

  -- 4. membro não lê webhook_key → 42501
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[
    format('select webhook_key from public.organization_connections where id = %L', v_conn_a)]);
  perform set_config('teste.c4_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c4_det', v_res, true);

  -- 5. admin de organização não insere conexão na própria org → 42501
  --    (sem a coluna id, que não tem grant de INSERT: o 42501 tem de vir da RLS)
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[
    format('insert into public.organization_connections (organization_id, category, provider, credential_source) '
           'values (%L, %L, %L, %L)', v_org_a, 'email', 'resend', 'platform')]);
  perform set_config('teste.c5_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c5_det', v_res, true);

  -- 6. admin de organização não atualiza a conexão da própria org (0 linhas)
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[
    format('update public.organization_connections set status = %L where id = %L', 'active', v_conn_a),
    format(c_zero, format('select count(*) from public.organization_connections where id = %L and status = %L',
                          v_conn_a, 'active'))]);
  perform set_config('teste.c6_ok', (v_res = 'aceito' or v_res like '42501%')::text, true);
  perform set_config('teste.c6_det', case when v_res = 'aceito' then '0 linha alterada' else v_res end, true);

  -- 7. admin de organização não apaga a conexão da própria org (0 linhas)
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[
    format('delete from public.organization_connections where id = %L', v_conn_a),
    format(c_um, format('select count(*) from public.organization_connections where id = %L', v_conn_a))]);
  perform set_config('teste.c7_ok', (v_res = 'aceito' or v_res like '42501%')::text, true);
  perform set_config('teste.c7_det', case when v_res = 'aceito' then '0 linha apagada' else v_res end, true);

  -- 8. admin da plataforma insere conexão whatsapp (org B) e o webhook_key é gerado (64 hex)
  if v_padm is null then
    perform set_config('teste.c8_ok', '', true);
    perform set_config('teste.c8_det', 'sem admin da plataforma', true);
    perform set_config('teste.c9_ok', '', true);
    perform set_config('teste.c9_det', 'sem admin da plataforma', true);
    perform set_config('teste.c10_ok', '', true);
    perform set_config('teste.c10_det', 'sem admin da plataforma', true);
    perform set_config('teste.c11_ok', '', true);
    perform set_config('teste.c11_det', 'sem admin da plataforma', true);
  else
    --    (sem id: a coluna não tem grant de INSERT; a org B não tinha conexões)
    v_res := pg_temp.tentar(v_padm, 'authenticated', array[
      format('insert into public.organization_connections (organization_id, category, provider, credential_source, config, secret, configured_by) '
             'values (%L, %L, %L, %L, %L::jsonb, %L::jsonb, %L)',
             v_org_b, 'whatsapp', 'meta_cloud', 'own', '{"phoneNumberId":"teste"}',
             '{"v":"v1","iv":"dGVzdGU=","ct":"dGVzdGU="}', v_padm),
      'set local role postgres',
      format(c_um, format('select count(*) from public.organization_connections '
                          'where organization_id = %L and category = %L and webhook_key ~ %L',
                          v_org_b, 'whatsapp', '^[0-9a-f]{64}$'))]);
    perform set_config('teste.c8_ok', (v_res = 'aceito')::text, true);
    perform set_config('teste.c8_det', case when v_res = 'aceito' then 'inserida, webhook_key gerado' else v_res end, true);

    -- 9. admin da plataforma não define webhook_key → 42501 (coluna fora do grant)
    v_res := pg_temp.tentar(v_padm, 'authenticated', array[
      format('insert into public.organization_connections (organization_id, category, provider, credential_source, webhook_key) '
             'values (%L, %L, %L, %L, %L)', v_org_b, 'whatsapp', 'evolution', 'own', repeat('ab', 32))]);
    perform set_config('teste.c9_ok', (v_res like '42501%')::text, true);
    perform set_config('teste.c9_det', v_res, true);

    -- 10. admin da plataforma lê a conexão de qualquer organização
    v_res := pg_temp.tentar(v_padm, 'authenticated', array[format(c_um,
      format('select count(*) from public.organization_connections where id = %L', v_conn_b))]);
    perform set_config('teste.c10_ok', (v_res = 'aceito')::text, true);
    perform set_config('teste.c10_det', case when v_res = 'aceito' then '1 linha' else v_res end, true);

    -- 11. platform_credentials ilegível também para o admin da plataforma pela sessão → 42501
    v_res := pg_temp.tentar(v_padm, 'authenticated', array['select count(*) from public.platform_credentials']);
    perform set_config('teste.c11_ok', (v_res like '42501%')::text, true);
    perform set_config('teste.c11_det', v_res, true);
  end if;

  -- 12. segunda conexão whatsapp na mesma organização → 23505
  v_res := pg_temp.tentar(null, 'postgres', array[
    format(c_ins, gen_random_uuid(), v_org_a, 'whatsapp', 'meta_cloud', 'own'),
    format(c_evo, v_org_a, 'teste-inst-c12')]);
  perform set_config('teste.c12_ok', (v_res like '23505%')::text, true);
  perform set_config('teste.c12_det', v_res, true);

  -- 13. whatsapp com credential_source = 'platform' → 23514
  v_res := pg_temp.tentar(null, 'postgres', array[
    format(c_ins, gen_random_uuid(), v_org_a, 'whatsapp', 'meta_cloud', 'platform')]);
  perform set_config('teste.c13_ok', (v_res like '23514%')::text, true);
  perform set_config('teste.c13_det', v_res, true);

  -- 14. categoria incoerente com o provedor (email + openai) → 23514
  v_res := pg_temp.tentar(null, 'postgres', array[
    format(c_ins, gen_random_uuid(), v_org_a, 'email', 'openai', 'platform')]);
  perform set_config('teste.c14_ok', (v_res like '23514%')::text, true);
  perform set_config('teste.c14_det', v_res, true);

  -- 15. status 'not_configured' não existe (não configurado = sem linha) → 23514
  v_res := pg_temp.tentar(null, 'postgres', array[
    format('update public.organization_connections set status = %L where id = %L', 'not_configured', v_conn_a)]);
  perform set_config('teste.c15_ok', (v_res like '23514%')::text, true);
  perform set_config('teste.c15_det', v_res, true);

  -- 16. webhook_key não é gerado fora de whatsapp
  select count(*) into v_n from public.organization_connections where id = v_conn_a and webhook_key is null;
  perform set_config('teste.c16_ok', (v_n = 1)::text, true);
  perform set_config('teste.c16_det', format('%s conexão llm sem webhook_key', v_n), true);

  -- 17. platform_credentials ilegível por membro (authenticated) → 42501
  v_res := pg_temp.tentar(v_adm, 'authenticated', array['select count(*) from public.platform_credentials']);
  perform set_config('teste.c17_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c17_det', v_res, true);

  -- 18. usage_events: membro vê o da própria org e não vê o de outra
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[
    format(c_um, format('select count(*) from public.usage_events where organization_id = %L and operation = %L',
                        v_org_a, 'teste-completion')),
    format(c_zero, format('select count(*) from public.usage_events where organization_id = %L', v_org_b))]);
  perform set_config('teste.c18_ok', (v_res = 'aceito')::text, true);
  perform set_config('teste.c18_det', case when v_res = 'aceito' then 'própria: 1, outra: 0' else v_res end, true);

  -- 19. usage_events: authenticated não grava → 42501
  v_res := pg_temp.tentar(v_adm, 'authenticated', array[
    format('insert into public.usage_events (organization_id, category, provider, operation, quantity, unit) '
           'values (%L, %L, %L, %L, 1, %L)', v_org_a, 'llm', 'openai', 'teste', 'tokens')]);
  perform set_config('teste.c19_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c19_det', v_res, true);

  -- 20. anon não lê organization_connections → 42501
  v_res := pg_temp.tentar(null, 'anon', array['select count(*) from public.organization_connections']);
  perform set_config('teste.c20_ok', (v_res like '42501%')::text, true);
  perform set_config('teste.c20_det', v_res, true);

  -- 21. mesma instância Evolution em org A e org B → 23505
  v_res := pg_temp.tentar(null, 'postgres', array[
    format(c_evo, v_org_a, 'teste-inst-c21'),
    format(c_evo, v_org_b, 'teste-inst-c21')]);
  perform set_config('teste.c21_ok', (v_res like '23505%')::text, true);
  perform set_config('teste.c21_det', v_res, true);

  -- 22. mesmo nome com espaços em volta (btrim) → 23505
  v_res := pg_temp.tentar(null, 'postgres', array[
    format(c_evo, v_org_a, 'teste-inst-c22'),
    format(c_evo, v_org_b, '  teste-inst-c22 ')]);
  perform set_config('teste.c22_ok', (v_res like '23505%')::text, true);
  perform set_config('teste.c22_det', v_res, true);

  -- 23. evolution com instanceName vazio/só espaços → 23514
  v_res := pg_temp.tentar(null, 'postgres', array[format(c_evo, v_org_a, '   ')]);
  perform set_config('teste.c23_ok', (v_res like '23514%')::text, true);
  perform set_config('teste.c23_det', v_res, true);

  -- 24. evolution sem instanceName → 23514
  v_res := pg_temp.tentar(null, 'postgres', array[
    format(c_ins, gen_random_uuid(), v_org_a, 'whatsapp', 'evolution', 'own')]);
  perform set_config('teste.c24_ok', (v_res like '23514%')::text, true);
  perform set_config('teste.c24_det', v_res, true);
end $$;

select c.cenario,
       nullif(current_setting('teste.c' || c.n || '_ok', true), '')::boolean as ok,
       current_setting('teste.c' || c.n || '_det', true) as detalhe
from (values
  (1, '1. membro lê a conexão da própria organização'),
  (2, '2. membro não lê a conexão de outra organização'),
  (3, '3. membro não lê secret → 42501'),
  (4, '4. membro não lê webhook_key → 42501'),
  (5, '5. admin de organização não insere conexão → 42501'),
  (6, '6. admin de organização não atualiza conexão → 0 linha'),
  (7, '7. admin de organização não apaga conexão → 0 linha'),
  (8, '8. admin da plataforma insere whatsapp; webhook_key gerado (64 hex)'),
  (9, '9. admin da plataforma não define webhook_key → 42501'),
  (10, '10. admin da plataforma lê conexão de qualquer organização'),
  (11, '11. platform_credentials ilegível para admin da plataforma pela sessão → 42501'),
  (12, '12. segunda conexão whatsapp na mesma organização → 23505'),
  (13, '13. whatsapp com credential_source = platform → 23514'),
  (14, '14. categoria incoerente com o provedor → 23514'),
  (15, '15. status not_configured rejeitado → 23514'),
  (16, '16. webhook_key não gerado fora de whatsapp'),
  (17, '17. platform_credentials ilegível por membro → 42501'),
  (18, '18. usage_events: própria org visível, outra org invisível'),
  (19, '19. usage_events: authenticated não grava → 42501'),
  (20, '20. anon não lê organization_connections → 42501'),
  (21, '21. mesma instância Evolution em duas organizações → 23505'),
  (22, '22. mesma instância Evolution com espaços em volta → 23505'),
  (23, '23. Evolution com instanceName vazio → 23514'),
  (24, '24. Evolution sem instanceName → 23514')
) as c(n, cenario)
order by c.n;

rollback;
