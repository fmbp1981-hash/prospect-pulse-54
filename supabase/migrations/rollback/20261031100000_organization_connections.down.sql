-- Rollback de 20261031100000_organization_connections.sql
--
-- Restaura o estado logo após 20261030160000_restrict_row_owner_writes:
--   * remove public.usage_events, public.platform_credentials e
--     public.organization_connections (com policies, triggers, índices e grants);
--   * remove public.set_connection_webhook_key().
-- public.set_updated_at() é anterior a esta migration e fica.
--
-- ATENÇÃO: apaga as conexões, as credenciais da plataforma (cifradas) e o
-- registro de consumo. Exporte as três tabelas para
-- scripts/legacy/backup-<data>-organization-connections.json ANTES de rodar
-- (regra de produção do CLAUDE.md). Depois do rollback, o código que lê
-- conexões passa a responder "não configurado" para todas as organizações, e
-- as URLs de webhook por conexão (webhook_key) deixam de existir.

drop table if exists public.usage_events;
drop table if exists public.platform_credentials;
drop table if exists public.organization_connections;

drop function if exists public.set_connection_webhook_key();
