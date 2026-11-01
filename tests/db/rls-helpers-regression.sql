-- Regressão funcional da Task 5 (Review Focus 2 e 4): depois de revogar EXECUTE
-- de anon/PUBLIC nas funções SECURITY DEFINER, um usuário autenticado real
-- continua lendo os leads da sua organização (helpers de RLS do grupo B) e o
-- trigger de organização (grupo A) continua preenchendo organization_id.
--
-- PLACEHOLDER: :'user_id' = uuid de um usuário real de organization_members.
--   psql:              psql ... -v user_id=<uuid> -f tests/db/rls-helpers-regression.sql
--   MCP execute_sql:   substituir as 3 ocorrências de :'user_id' por '<uuid>'
--   Para escolher:     select user_id, organization_id from public.organization_members limit 5;
--
-- Roda inteiro dentro de begin/rollback: nada fica gravado.
-- Deve ser executado com um role que possa fazer SET ROLE authenticated
-- (postgres, o padrão do execute_sql).
--
-- Esperado (antes E depois da migration 20261030120000):
--   leads_service_role | leads_authenticated | contagens_iguais | nota_organization_id_preenchido
--   N                  | N                   | true             | true
-- Falha esperada se a migration quebrar algo:
--   ERROR: permission denied for function <helper>   (grupo B sem EXECUTE)
--   ou nota_organization_id_preenchido = false        (trigger do grupo A)
-- Se o usuário não tiver nenhum lead, nota_organization_id_preenchido vem null
-- (não há lead_id para a nota): escolher outro usuário.

begin;

-- 1. Linha de base como service_role/postgres (sem RLS): leads da organização do usuário.
select set_config(
  'regress.org_id',
  (select organization_id::text
     from public.organization_members
    where user_id = :'user_id'::uuid
    limit 1),
  true
);

select set_config(
  'regress.baseline',
  (select count(*)::text
     from public.leads_prospeccao
    where organization_id = current_setting('regress.org_id')::uuid),
  true
);

select set_config(
  'regress.lead_id',
  coalesce((select id::text
              from public.leads_prospeccao
             where organization_id = current_setting('regress.org_id')::uuid
             limit 1), ''),
  true
);

-- 2. Simula o JWT do usuário e troca para o role authenticated.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'user_id', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- 3. Leitura sob RLS + insert disparando o trigger set_organization_id_from_member.
with nota as (
  insert into public.lead_notes (lead_id, content, user_id)
  select current_setting('regress.lead_id'), 'regressao task 5 (rollback)', :'user_id'::uuid
  where current_setting('regress.lead_id') <> ''
  returning organization_id
)
select
  current_setting('regress.baseline')::bigint                     as leads_service_role,
  (select count(*) from public.leads_prospeccao)                  as leads_authenticated,
  (select count(*) from public.leads_prospeccao)
    = current_setting('regress.baseline')::bigint                 as contagens_iguais,
  (select organization_id = current_setting('regress.org_id')::uuid from nota)
                                                                  as nota_organization_id_preenchido;

rollback;

-- ---------------------------------------------------------------------------
-- Bloco OPCIONAL (rodar separado): efeito sobre o role anon.
-- Depois da migration, uma consulta anônima a tabela cuja policy chama um
-- helper do grupo B deixa de devolver 0 linhas e passa a falhar com
--   ERROR: permission denied for function is_org_member (42501)
-- Isso é aceitável (nenhum dado vaza); confirmar que o app não faz leitura
-- anônima dessas tabelas.
--
-- begin;
-- set local role anon;
-- select count(*) from public.leads_prospeccao;
-- rollback;
