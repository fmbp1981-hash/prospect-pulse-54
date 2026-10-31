-- Teste de banco: matriz de privilégios das funções do schema public (Task 5, Sprint 1).
--
-- Retorna UMA LINHA POR VIOLAÇÃO (colunas: grupo, funcao, motivo).
-- Esperado ANTES da migration 20261030120000_harden_security_definer_functions:
--   >= 21 linhas (estimativa com os grants padrão do Supabase: ~58).
-- Esperado DEPOIS: 0 linhas.
-- Com a matriz atualizada pela Task 6b (guard_user_settings_privileged_columns
-- no grupo A, is_platform_admin no grupo B): se a migration
-- 20261030130000_guard_user_settings_privileges ainda NÃO foi aplicada, estas
-- duas entradas aparecem como "função da matriz não encontrada"; depois dela,
-- 0 linhas.
-- Idem para is_org_member_user (grupo B, rodada final do Sprint 1): até a
-- migration 20261030160000_restrict_row_owner_writes ser aplicada, aparece
-- como "função da matriz não encontrada".
-- Idem para set_connection_webhook_key (grupo A, Sprint 2b): até a migration
-- 20261031100000_organization_connections ser aplicada.
--
-- Matriz (fonte: task-5-brief.md):
--   A  só trigger            anon ✗  authenticated ✗  service_role ✓
--   B  helper de RLS         anon ✗  authenticated ✓  service_role ✓
--   C  só servidor           anon ✗  authenticated ✗  service_role ✓
--   D  legado                anon ✗  authenticated ✗  service_role ✓
--   T  trigger invoker       (sem checagem de privilégio; só search_path)
--
-- Regras adicionais:
--   * toda função SECURITY DEFINER do schema public precisa estar classificada
--     na matriz (função nova não classificada = violação);
--   * toda função do schema public que não pertence a extensão precisa de
--     search_path fixo em proconfig (advisor function_search_path_mutable);
--   * funções da matriz precisam de search_path exatamente "public, pg_temp".
--
-- A checagem é por nome: TODAS as sobrecargas de um nome da matriz são
-- verificadas contra o grupo do nome (sobrecarga nova também é coberta).
-- Somente leitura; pode rodar como postgres/service_role via execute_sql.

with matriz(grupo, nome) as (
  values
    ('A', 'set_organization_id_from_member'),
    ('A', 'set_user_id_on_insert'),
    ('A', 'set_tenant_and_origem_on_insert'),
    ('A', 'set_conversation_user_id'),
    ('A', 'handle_new_user_webhook'),
    ('A', 'leads_enqueue_trigger_function'),
    ('A', 'guard_user_settings_privileged_columns'),  -- 20261030130000 (Task 6b)
    ('A', 'set_connection_webhook_key'),              -- 20261031100000 (Sprint 2b, Task 2)
    ('B', 'is_admin'),
    ('B', 'is_platform_admin'),                       -- 20261030130000 (Task 6b)
    ('B', 'is_org_member_user'),                      -- 20261030160000 (MT-01)
    ('B', 'can_write'),
    ('B', 'is_org_admin'),
    ('B', 'is_org_member'),
    ('B', 'is_org_writer'),
    ('B', 'get_my_organization_id'),
    ('B', 'get_user_tenant_id'),
    ('C', 'find_lead_by_phone_digits'),
    ('C', 'get_user_by_evolution_instance'),
    ('C', 'match_document_chunks'),
    ('C', 'purge_expired_raw_payloads'),
    ('C', 'generate_user_webhook_url'),
    ('C', 'get_user_by_webhook_url'),
    ('C', 'claim_due_follow_ups'),
    ('D', 'criar_lead_organico'),
    ('D', 'atualizar_lead_por_whatsapp'),
    ('T', 'handle_updated_at'),
    ('T', 'set_updated_at'),
    ('T', 'update_updated_at_column'),
    ('T', 'update_user_settings_updated_at')
),
-- funções do public que não são membros de extensão (ex.: pgvector vive em public)
funcs as (
  select
    p.oid,
    p.proname,
    p.oid::regprocedure::text as assinatura,
    p.prosecdef,
    coalesce(p.proconfig, '{}'::text[]) as proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_proc'::regclass
        and d.objid = p.oid
        and d.deptype = 'e'
    )
),
classificadas as (
  select m.grupo, f.*
  from funcs f
  join matriz m on m.nome = f.proname
),
violacoes as (
  -- 1. função da matriz inexistente (assinatura renomeada/removida sem atualizar a matriz)
  select m.grupo, m.nome as funcao, 'função da matriz não encontrada no schema public' as motivo
  from matriz m
  where not exists (select 1 from funcs f where f.proname = m.nome)

  union all
  -- 2. anon nunca executa (grupos A, B, C, D)
  select c.grupo, c.assinatura, 'anon tem EXECUTE (esperado: sem acesso)'
  from classificadas c
  where c.grupo in ('A', 'B', 'C', 'D')
    and has_function_privilege('anon', c.oid, 'EXECUTE')

  union all
  -- 3. authenticated só executa helpers de RLS (grupo B)
  select c.grupo, c.assinatura, 'authenticated tem EXECUTE (esperado: sem acesso)'
  from classificadas c
  where c.grupo in ('A', 'C', 'D')
    and has_function_privilege('authenticated', c.oid, 'EXECUTE')

  union all
  select c.grupo, c.assinatura, 'authenticated sem EXECUTE em helper de RLS (policies vão falhar)'
  from classificadas c
  where c.grupo = 'B'
    and not has_function_privilege('authenticated', c.oid, 'EXECUTE')

  union all
  -- 4. service_role sempre executa
  select c.grupo, c.assinatura, 'service_role sem EXECUTE'
  from classificadas c
  where c.grupo in ('A', 'B', 'C', 'D')
    and not has_function_privilege('service_role', c.oid, 'EXECUTE')

  union all
  -- 5. SECURITY DEFINER não classificado
  select '?' as grupo, f.assinatura,
         'SECURITY DEFINER fora da matriz de privilégios (classificar em A/B/C/D)'
  from funcs f
  where f.prosecdef
    and not exists (select 1 from matriz m where m.nome = f.proname)

  union all
  -- 6. search_path mutável (qualquer função não-extensão do public)
  select coalesce(m.grupo, '-') as grupo, f.assinatura,
         case when f.prosecdef
              then 'SECURITY DEFINER sem search_path fixo'
              else 'função sem search_path fixo (function_search_path_mutable)'
         end
  from funcs f
  left join matriz m on m.nome = f.proname
  where not exists (
    select 1 from unnest(f.proconfig) cfg where cfg like 'search_path=%'
  )

  union all
  -- 7. função da matriz com search_path fixo mas diferente do padrão
  select c.grupo, c.assinatura,
         'search_path diferente de "public, pg_temp": '
           || (select string_agg(cfg, ',') from unnest(c.proconfig) cfg where cfg like 'search_path=%')
  from classificadas c
  where exists (select 1 from unnest(c.proconfig) cfg where cfg like 'search_path=%')
    and not ('search_path=public, pg_temp' = any (c.proconfig))
)
select grupo, funcao, motivo
from violacoes
order by grupo, funcao, motivo;
