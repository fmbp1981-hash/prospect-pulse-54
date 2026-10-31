-- 20261030120000_harden_security_definer_functions.sql
-- Sprint 1 (segurança), Task 5: endurece as funções SECURITY DEFINER do schema
-- public (privilégio de EXECUTE + search_path fixo) e fixa o search_path das
-- funções de trigger invoker apontadas pelo advisor function_search_path_mutable.
--
-- Depende de 20261030110000_follow_up_claim (claim_due_follow_ups).
-- Rollback: supabase/migrations/rollback/20261030120000_harden_security_definer_functions.down.sql
-- Teste:    tests/db/function-privileges.sql (0 linhas depois desta migration)
--
-- Matriz de privilégios:
--   A  só trigger      anon ✗  authenticated ✗  service_role ✓
--   B  helper de RLS   anon ✗  authenticated ✓  service_role ✓
--   C  só servidor     anon ✗  authenticated ✗  service_role ✓
--   D  legado          anon ✗  authenticated ✗  service_role ✓
--
-- No Supabase os default privileges do schema public concedem EXECUTE a anon,
-- authenticated e service_role explicitamente; por isso o REVOKE é feito em
-- PUBLIC e também em cada role nominal. Assinaturas exatas obtidas de produção
-- com pg_get_function_identity_arguments em 2026-10-30.
--
-- search_path: todas passam a "public, pg_temp" (pg_temp por último impede que
-- um objeto temporário sombreie um objeto de public). As que já tinham
-- "public" são normalizadas; o rollback restaura o valor anterior de cada uma.

-- ---------------------------------------------------------------------------
-- Grupo A: funções de trigger.
-- Revogar EXECUTE NÃO impede o disparo do trigger: o Postgres só verifica o
-- privilégio EXECUTE da função de trigger no CREATE TRIGGER; na execução do
-- trigger o privilégio não é checado. Nenhum role de API precisa chamá-las.
-- ---------------------------------------------------------------------------
revoke execute on function public.set_organization_id_from_member() from public, anon, authenticated;
grant  execute on function public.set_organization_id_from_member() to service_role;
alter function public.set_organization_id_from_member() set search_path = public, pg_temp;

revoke execute on function public.set_user_id_on_insert() from public, anon, authenticated;
grant  execute on function public.set_user_id_on_insert() to service_role;
alter function public.set_user_id_on_insert() set search_path = public, pg_temp;

revoke execute on function public.set_tenant_and_origem_on_insert() from public, anon, authenticated;
grant  execute on function public.set_tenant_and_origem_on_insert() to service_role;
alter function public.set_tenant_and_origem_on_insert() set search_path = public, pg_temp;

revoke execute on function public.set_conversation_user_id() from public, anon, authenticated;
grant  execute on function public.set_conversation_user_id() to service_role;
alter function public.set_conversation_user_id() set search_path = public, pg_temp;

revoke execute on function public.handle_new_user_webhook() from public, anon, authenticated;
grant  execute on function public.handle_new_user_webhook() to service_role;
alter function public.handle_new_user_webhook() set search_path = public, pg_temp;

revoke execute on function public.leads_enqueue_trigger_function() from public, anon, authenticated;
grant  execute on function public.leads_enqueue_trigger_function() to service_role;
alter function public.leads_enqueue_trigger_function() set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- Grupo B: helpers usados dentro das policies de RLS. As policies são avaliadas
-- com o role de quem consulta, então authenticated PRECISA manter EXECUTE.
-- anon perde EXECUTE: consulta anônima a uma tabela cuja policy chama estes
-- helpers passa a falhar com 42501 em vez de devolver 0 linhas (sem vazamento).
-- ---------------------------------------------------------------------------
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated, service_role;
alter function public.is_admin() set search_path = public, pg_temp;

revoke execute on function public.can_write() from public, anon;
grant  execute on function public.can_write() to authenticated, service_role;
alter function public.can_write() set search_path = public, pg_temp;

revoke execute on function public.is_org_admin(check_org_id uuid) from public, anon;
grant  execute on function public.is_org_admin(check_org_id uuid) to authenticated, service_role;
alter function public.is_org_admin(check_org_id uuid) set search_path = public, pg_temp;

revoke execute on function public.is_org_member(check_org_id uuid) from public, anon;
grant  execute on function public.is_org_member(check_org_id uuid) to authenticated, service_role;
alter function public.is_org_member(check_org_id uuid) set search_path = public, pg_temp;

revoke execute on function public.is_org_writer(check_org_id uuid) from public, anon;
grant  execute on function public.is_org_writer(check_org_id uuid) to authenticated, service_role;
alter function public.is_org_writer(check_org_id uuid) set search_path = public, pg_temp;

revoke execute on function public.get_my_organization_id() from public, anon;
grant  execute on function public.get_my_organization_id() to authenticated, service_role;
alter function public.get_my_organization_id() set search_path = public, pg_temp;

revoke execute on function public.get_user_tenant_id(user_uuid uuid) from public, anon;
grant  execute on function public.get_user_tenant_id(user_uuid uuid) to authenticated, service_role;
alter function public.get_user_tenant_id(user_uuid uuid) set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- Grupo C: só servidor (o app chama via service_role).
-- ---------------------------------------------------------------------------
revoke execute on function public.find_lead_by_phone_digits(p_digits text, p_user_id uuid) from public, anon, authenticated;
grant  execute on function public.find_lead_by_phone_digits(p_digits text, p_user_id uuid) to service_role;
alter function public.find_lead_by_phone_digits(p_digits text, p_user_id uuid) set search_path = public, pg_temp;

revoke execute on function public.get_user_by_evolution_instance(p_instance_name text) from public, anon, authenticated;
grant  execute on function public.get_user_by_evolution_instance(p_instance_name text) to service_role;
alter function public.get_user_by_evolution_instance(p_instance_name text) set search_path = public, pg_temp;

-- pgvector está instalado no schema public, então o operador <=> continua
-- resolvível com search_path = public, pg_temp.
revoke execute on function public.match_document_chunks(query_embedding public.vector, match_count integer, p_user_id uuid, p_agent_config_id text, similarity_threshold double precision) from public, anon, authenticated;
grant  execute on function public.match_document_chunks(query_embedding public.vector, match_count integer, p_user_id uuid, p_agent_config_id text, similarity_threshold double precision) to service_role;
alter function public.match_document_chunks(query_embedding public.vector, match_count integer, p_user_id uuid, p_agent_config_id text, similarity_threshold double precision) set search_path = public, pg_temp;

revoke execute on function public.purge_expired_raw_payloads() from public, anon, authenticated;
grant  execute on function public.purge_expired_raw_payloads() to service_role;
alter function public.purge_expired_raw_payloads() set search_path = public, pg_temp;

revoke execute on function public.generate_user_webhook_url(p_user_id uuid) from public, anon, authenticated;
grant  execute on function public.generate_user_webhook_url(p_user_id uuid) to service_role;
alter function public.generate_user_webhook_url(p_user_id uuid) set search_path = public, pg_temp;

revoke execute on function public.get_user_by_webhook_url(p_webhook_path text) from public, anon, authenticated;
grant  execute on function public.get_user_by_webhook_url(p_webhook_path text) to service_role;
alter function public.get_user_by_webhook_url(p_webhook_path text) set search_path = public, pg_temp;

-- Criada em 20261030110000 já com estes privilégios e search_path; repetido
-- aqui (idempotente) para a matriz ficar completa num só lugar.
revoke execute on function public.claim_due_follow_ups(p_limit integer) from public, anon, authenticated;
grant  execute on function public.claim_due_follow_ups(p_limit integer) to service_role;
alter function public.claim_due_follow_ups(p_limit integer) set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- Grupo D: legado, sem chamador após a Task 3. DROP FUNCTION fica para a
-- reconciliação de migrations do Sprint 2 (após 2 semanas sem uso).
-- ---------------------------------------------------------------------------
revoke execute on function public.criar_lead_organico(p_whatsapp text, p_contato text, p_empresa text, p_telefone text, p_categoria text, p_instance_name text, p_user_id text, p_webhook_path text) from public, anon, authenticated;
grant  execute on function public.criar_lead_organico(p_whatsapp text, p_contato text, p_empresa text, p_telefone text, p_categoria text, p_instance_name text, p_user_id text, p_webhook_path text) to service_role;
alter function public.criar_lead_organico(p_whatsapp text, p_contato text, p_empresa text, p_telefone text, p_categoria text, p_instance_name text, p_user_id text, p_webhook_path text) set search_path = public, pg_temp;

revoke execute on function public.atualizar_lead_por_whatsapp(p_whatsapp text, p_status_msg_wa text, p_estagio_pipeline text, p_faturamento_declarado numeric, p_motivo_follow_up text, p_modo_atendimento text, p_usa_meios_pagamento text, p_empresa text, p_contato text, p_etapa_funil text, p_data_qualificacao timestamp with time zone) from public, anon, authenticated;
grant  execute on function public.atualizar_lead_por_whatsapp(p_whatsapp text, p_status_msg_wa text, p_estagio_pipeline text, p_faturamento_declarado numeric, p_motivo_follow_up text, p_modo_atendimento text, p_usa_meios_pagamento text, p_empresa text, p_contato text, p_etapa_funil text, p_data_qualificacao timestamp with time zone) to service_role;
alter function public.atualizar_lead_por_whatsapp(p_whatsapp text, p_status_msg_wa text, p_estagio_pipeline text, p_faturamento_declarado numeric, p_motivo_follow_up text, p_modo_atendimento text, p_usa_meios_pagamento text, p_empresa text, p_contato text, p_etapa_funil text, p_data_qualificacao timestamp with time zone) set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- Funções de trigger SECURITY INVOKER (advisor function_search_path_mutable).
-- Só fixa o search_path; privilégios inalterados (rodam com o role de quem
-- dispara o trigger, sem escalada).
-- ---------------------------------------------------------------------------
alter function public.handle_updated_at() set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.update_updated_at_column() set search_path = public, pg_temp;
alter function public.update_user_settings_updated_at() set search_path = public, pg_temp;


-- ---------------------------------------------------------------------------
-- Default privileges: funções NOVAS criadas pelo role postgres deixam de nascer
-- executáveis por PUBLIC, anon e authenticated. A partir daqui, TODA função
-- nova precisa de GRANT EXECUTE explícito para o role que deve chamá-la
-- (service_role continua recebendo pelo default privilege do Supabase) e deve
-- ser classificada na matriz de tests/db/function-privileges.sql.
-- Válido dentro de transação; afeta só objetos criados depois.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;
