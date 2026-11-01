-- Rollback de 20261030120000_harden_security_definer_functions.sql
--
-- Restaura o estado de produção consultado em 2026-10-30 (owner de todas = postgres):
--   * ACL exata de cada função: EXECUTE para PUBLIC, anon e authenticated
--     (service_role já tinha), EXCETO get_my_organization_id, is_org_admin,
--     is_org_member e is_org_writer, que em produção NÃO tinham grant a PUBLIC
--     (só anon, authenticated, service_role);
--   * default privileges do role postgres revogados no fim da migration;
--   * proconfig anterior de cada função:
--       - RESET search_path nas que estavam vazias;
--       - SET search_path = public nas que tinham "search_path=public".
-- claim_due_follow_ups NÃO é alterada: seu estado (só service_role,
-- search_path = public, pg_temp) pertence a 20261030110000_follow_up_claim e é
-- o mesmo antes e depois desta migration.
--
-- ATENÇÃO: este rollback reabre a execução anônima de funções SECURITY DEFINER
-- (ex.: match_document_chunks com p_user_id nulo lê chunks de todos os tenants).
-- Usar só se a migration quebrar algo em produção, e reaplicar a correção logo.

-- Grupo A ---------------------------------------------------------------------
grant execute on function public.set_organization_id_from_member() to public, anon, authenticated;
alter function public.set_organization_id_from_member() set search_path = public;

grant execute on function public.set_user_id_on_insert() to public, anon, authenticated;
alter function public.set_user_id_on_insert() set search_path = public;

grant execute on function public.set_tenant_and_origem_on_insert() to public, anon, authenticated;
alter function public.set_tenant_and_origem_on_insert() set search_path = public;

grant execute on function public.set_conversation_user_id() to public, anon, authenticated;
alter function public.set_conversation_user_id() reset search_path;

grant execute on function public.handle_new_user_webhook() to public, anon, authenticated;
alter function public.handle_new_user_webhook() reset search_path;

grant execute on function public.leads_enqueue_trigger_function() to public, anon, authenticated;
alter function public.leads_enqueue_trigger_function() reset search_path;

-- Grupo B ---------------------------------------------------------------------
grant execute on function public.is_admin() to public, anon, authenticated;
alter function public.is_admin() reset search_path;

grant execute on function public.can_write() to public, anon, authenticated;
alter function public.can_write() reset search_path;

grant execute on function public.is_org_admin(check_org_id uuid) to anon, authenticated;
alter function public.is_org_admin(check_org_id uuid) set search_path = public;

grant execute on function public.is_org_member(check_org_id uuid) to anon, authenticated;
alter function public.is_org_member(check_org_id uuid) set search_path = public;

grant execute on function public.is_org_writer(check_org_id uuid) to anon, authenticated;
alter function public.is_org_writer(check_org_id uuid) set search_path = public;

grant execute on function public.get_my_organization_id() to anon, authenticated;
alter function public.get_my_organization_id() set search_path = public;

grant execute on function public.get_user_tenant_id(user_uuid uuid) to public, anon, authenticated;
alter function public.get_user_tenant_id(user_uuid uuid) set search_path = public;

-- Grupo C ---------------------------------------------------------------------
grant execute on function public.find_lead_by_phone_digits(p_digits text, p_user_id uuid) to public, anon, authenticated;
alter function public.find_lead_by_phone_digits(p_digits text, p_user_id uuid) reset search_path;

grant execute on function public.get_user_by_evolution_instance(p_instance_name text) to public, anon, authenticated;
alter function public.get_user_by_evolution_instance(p_instance_name text) reset search_path;

grant execute on function public.match_document_chunks(query_embedding public.vector, match_count integer, p_user_id uuid, p_agent_config_id text, similarity_threshold double precision) to public, anon, authenticated;
alter function public.match_document_chunks(query_embedding public.vector, match_count integer, p_user_id uuid, p_agent_config_id text, similarity_threshold double precision) reset search_path;

grant execute on function public.purge_expired_raw_payloads() to public, anon, authenticated;
alter function public.purge_expired_raw_payloads() set search_path = public;

grant execute on function public.generate_user_webhook_url(p_user_id uuid) to public, anon, authenticated;
alter function public.generate_user_webhook_url(p_user_id uuid) reset search_path;

grant execute on function public.get_user_by_webhook_url(p_webhook_path text) to public, anon, authenticated;
alter function public.get_user_by_webhook_url(p_webhook_path text) reset search_path;

-- Grupo D ---------------------------------------------------------------------
grant execute on function public.criar_lead_organico(p_whatsapp text, p_contato text, p_empresa text, p_telefone text, p_categoria text, p_instance_name text, p_user_id text, p_webhook_path text) to public, anon, authenticated;
alter function public.criar_lead_organico(p_whatsapp text, p_contato text, p_empresa text, p_telefone text, p_categoria text, p_instance_name text, p_user_id text, p_webhook_path text) reset search_path;

grant execute on function public.atualizar_lead_por_whatsapp(p_whatsapp text, p_status_msg_wa text, p_estagio_pipeline text, p_faturamento_declarado numeric, p_motivo_follow_up text, p_modo_atendimento text, p_usa_meios_pagamento text, p_empresa text, p_contato text, p_etapa_funil text, p_data_qualificacao timestamp with time zone) to public, anon, authenticated;
alter function public.atualizar_lead_por_whatsapp(p_whatsapp text, p_status_msg_wa text, p_estagio_pipeline text, p_faturamento_declarado numeric, p_motivo_follow_up text, p_modo_atendimento text, p_usa_meios_pagamento text, p_empresa text, p_contato text, p_etapa_funil text, p_data_qualificacao timestamp with time zone) reset search_path;

-- Triggers invoker (privilégios não foram alterados) -------------------------
alter function public.handle_updated_at() reset search_path;
alter function public.set_updated_at() reset search_path;
alter function public.update_updated_at_column() reset search_path;
alter function public.update_user_settings_updated_at() reset search_path;

-- Default privileges (reverte o fim da migration) -----------------------------
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated;
alter default privileges for role postgres grant execute on functions to public;
