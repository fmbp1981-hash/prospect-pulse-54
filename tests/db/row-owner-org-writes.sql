-- Teste de banco: dono da linha precisa pertencer à organização da linha (MT-01),
-- agente/RAG/ICP só pelo admin da organização (MT-03) e sem TRUNCATE/TRIGGER/
-- REFERENCES para anon/authenticated (DB F-01). Sprint 1, rodada final.
--
-- Retorna UMA LINHA POR CENÁRIO (colunas: cenario, ok, detalhe).
--   ok = true   comportamento esperado DEPOIS de 20261030160000_restrict_row_owner_writes
--   ok = false  falha (antes da migration, os cenários 1, 2, 3, 7, 8, 9, 10 e 11 dão false)
--   ok = null   usuário de teste não encontrado (ver detalhe)
--
-- Usuários de teste (de public.organization_members, o vínculo mais antigo de cada perfil):
--   teste.adm    admin de uma organização A (writer e admin da org)
--   teste.colega outro membro da mesma organização A
--   teste.outro  membro de OUTRA organização B
--   teste.op     operador (writer, não admin) de alguma organização
--
-- "Aceito pela RLS" = nenhum erro 42501. Erros de constraint/FK que o banco
-- de produção possa ter (ex.: lead_id inexistente, check de scenario) só
-- acontecem DEPOIS da checagem de RLS e aparecem no detalhe como aceitos.
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
    and exists (select 1 from public.organization_members o2
                where o2.organization_id = om.organization_id and o2.user_id <> om.user_id)
  order by om.created_at limit 1), ''), true);
select set_config('teste.org_a', coalesce((
  select organization_id::text from public.organization_members
  where user_id::text = current_setting('teste.adm') limit 1), ''), true);
select set_config('teste.colega', coalesce((
  select user_id::text from public.organization_members
  where organization_id::text = current_setting('teste.org_a')
    and user_id::text <> current_setting('teste.adm')
  order by created_at limit 1), ''), true);
select set_config('teste.outro', coalesce((
  select user_id::text from public.organization_members
  where organization_id::text <> current_setting('teste.org_a')
  order by created_at limit 1), ''), true);
select set_config('teste.op', coalesce((
  select user_id::text from public.organization_members
  where role = 'operador'
  order by created_at limit 1), ''), true);
select set_config('teste.org_op', coalesce((
  select organization_id::text from public.organization_members
  where user_id::text = current_setting('teste.op') limit 1), ''), true);
select set_config('teste.lead_a', coalesce((
  select id::text from public.leads_prospeccao
  where organization_id::text = current_setting('teste.org_a')
  limit 1), gen_random_uuid()::text), true);

-- Executa os comandos como o usuário p_uid (authenticated) e desfaz tudo.
-- Devolve 'aceito' ou 'SQLSTATE mensagem' do primeiro erro.
create function pg_temp.tentar(p_uid uuid, p_sqls text[])
returns text
language plpgsql
as $$
declare
  v_res text;
  v_sql text;
begin
  begin
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
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
  v_org uuid := nullif(current_setting('teste.org_a'), '')::uuid;
  v_colega uuid := nullif(current_setting('teste.colega'), '')::uuid;
  v_outro uuid := nullif(current_setting('teste.outro'), '')::uuid;
  v_op uuid := nullif(current_setting('teste.op'), '')::uuid;
  v_org_op uuid := nullif(current_setting('teste.org_op'), '')::uuid;
  v_lead text := current_setting('teste.lead_a');
  v_id uuid := gen_random_uuid();
  v_res text;
  v_n int;

  -- SQL de insert por tabela (dono = p_dono, org = p_org)
  c_wk constant text := 'insert into public.webhook_keys (id, name, key_hash, user_id, organization_id) values (%L, %L, %L, %L, %L)';
  c_ac constant text := 'insert into public.agent_configs (system_prompt, user_id, organization_id) values (%L, %L, %L)';
  c_fs constant text := 'insert into public.followup_schedules (lead_id, due_at, scenario, user_id, organization_id) values (%L, now(), %L, %L, %L)';
  c_rd constant text := 'insert into public.rag_documents (filename, user_id, organization_id) values (%L, %L, %L)';
begin
  if v_adm is null or v_outro is null or v_colega is null then
    for v_n in 1..8 loop
      perform set_config('teste.e' || v_n || '_ok', '', true);
      perform set_config('teste.e' || v_n || '_det', 'sem admin de org com colega e membro de outra org', true);
    end loop;
  else
    -- 1. writer da Org A insere webhook_keys com user_id de usuário da Org B → 42501
    v_res := pg_temp.tentar(v_adm, array[format(c_wk, gen_random_uuid(), 'teste-mt01', md5(random()::text), v_outro, v_org)]);
    perform set_config('teste.e1_ok', (v_res like '42501%')::text, true);
    perform set_config('teste.e1_det', v_res, true);

    -- 2. idem em agent_configs → 42501
    v_res := pg_temp.tentar(v_adm, array[format(c_ac, 'teste-mt01', v_outro, v_org)]);
    perform set_config('teste.e2_ok', (v_res like '42501%')::text, true);
    perform set_config('teste.e2_det', v_res, true);

    -- 3. idem em followup_schedules → 42501
    v_res := pg_temp.tentar(v_adm, array[format(c_fs, v_lead, 'teste-mt01', v_outro, v_org)]);
    perform set_config('teste.e3_ok', (v_res like '42501%')::text, true);
    perform set_config('teste.e3_det', v_res, true);

    -- 4. controle: com o próprio user_id → aceito (webhook_keys)
    v_res := pg_temp.tentar(v_adm, array[format(c_wk, gen_random_uuid(), 'teste-mt01', md5(random()::text), v_adm, v_org)]);
    perform set_config('teste.e4_ok', (v_res not like '42501%' and v_res not like 'erro%')::text, true);
    perform set_config('teste.e4_det', v_res, true);

    -- 5. controle: com o próprio user_id → aceito (agent_configs; admin passa no MT-03)
    v_res := pg_temp.tentar(v_adm, array[format(c_ac, 'teste-mt01', v_adm, v_org)]);
    perform set_config('teste.e5_ok', (v_res not like '42501%' and v_res not like 'erro%')::text, true);
    perform set_config('teste.e5_det', v_res, true);

    -- 6. controle: com o próprio user_id → aceito pela RLS (followup_schedules)
    v_res := pg_temp.tentar(v_adm, array[format(c_fs, v_lead, 'teste-mt01', v_adm, v_org)]);
    perform set_config('teste.e6_ok', (v_res not like '42501%' and v_res not like 'erro%')::text, true);
    perform set_config('teste.e6_det', v_res, true);

    -- 7. UPDATE trocando user_id da própria linha para usuário da Org B → 42501
    v_res := pg_temp.tentar(v_adm, array[
      format(c_wk, v_id, 'teste-mt01', md5(random()::text), v_adm, v_org),
      format('update public.webhook_keys set user_id = %L where id = %L', v_outro, v_id)
    ]);
    perform set_config('teste.e7_ok', (v_res like '42501%')::text, true);
    perform set_config('teste.e7_det', v_res, true);

    -- 8. controle: linha da org com user_id de COLEGA da mesma org → aceito
    v_res := pg_temp.tentar(v_adm, array[format(c_wk, gen_random_uuid(), 'teste-mt01', md5(random()::text), v_colega, v_org)]);
    perform set_config('teste.e8_ok', (v_res not like '42501%' and v_res not like 'erro%')::text, true);
    perform set_config('teste.e8_det', v_res, true);
  end if;

  if v_op is null then
    perform set_config('teste.e9_ok', '', true);
    perform set_config('teste.e9_det', 'sem operador em organization_members', true);
    perform set_config('teste.e10_ok', '', true);
    perform set_config('teste.e10_det', 'sem operador em organization_members', true);
  else
    -- 9. MT-03: operador da org não insere em agent_configs (nem com o próprio user_id) → 42501
    v_res := pg_temp.tentar(v_op, array[format(c_ac, 'teste-mt03', v_op, v_org_op)]);
    perform set_config('teste.e9_ok', (v_res like '42501%')::text, true);
    perform set_config('teste.e9_det', v_res, true);

    -- 10. MT-03: operador da org não insere em rag_documents → 42501
    v_res := pg_temp.tentar(v_op, array[format(c_rd, 'teste-mt03.txt', v_op, v_org_op)]);
    perform set_config('teste.e10_ok', (v_res like '42501%')::text, true);
    perform set_config('teste.e10_det', v_res, true);
  end if;

  -- 11. DB F-01: nenhuma tabela do public concede TRUNCATE/TRIGGER/REFERENCES a anon/authenticated
  select count(*) into v_n
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
    and a.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES');
  perform set_config('teste.e11_ok', (v_n = 0)::text, true);
  perform set_config('teste.e11_det', format('%s privilégios encontrados', v_n), true);

  -- 12. DB F-01: default privileges do postgres no public sem esses privilégios
  select count(*) into v_n
  from pg_default_acl d
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclrole = 'postgres'::regrole
    and d.defaclnamespace = 'public'::regnamespace
    and d.defaclobjtype = 'r'
    and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
    and a.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES');
  perform set_config('teste.e12_ok', (v_n = 0)::text, true);
  perform set_config('teste.e12_det', format('%s privilégios default encontrados', v_n), true);
end $$;

select c.cenario,
       nullif(current_setting('teste.e' || c.n || '_ok', true), '')::boolean as ok,
       current_setting('teste.e' || c.n || '_det', true) as detalhe
from (values
  (1, '1. MT-01: writer da Org A insere webhook_keys com user_id da Org B → 42501'),
  (2, '2. MT-01: idem em agent_configs → 42501'),
  (3, '3. MT-01: idem em followup_schedules → 42501'),
  (4, '4. controle: webhook_keys com o próprio user_id → aceito'),
  (5, '5. controle: agent_configs com o próprio user_id (admin da org) → aceito'),
  (6, '6. controle: followup_schedules com o próprio user_id → aceito pela RLS'),
  (7, '7. MT-01: UPDATE troca user_id para usuário da Org B → 42501'),
  (8, '8. controle: linha da org com user_id de colega da mesma org → aceito'),
  (9, '9. MT-03: operador da org não insere em agent_configs → 42501'),
  (10, '10. MT-03: operador da org não insere em rag_documents → 42501'),
  (11, '11. F-01: sem TRUNCATE/TRIGGER/REFERENCES para anon/authenticated nas tabelas'),
  (12, '12. F-01: default privileges do postgres sem esses privilégios')
) as c(n, cenario)
order by c.n;

rollback;
