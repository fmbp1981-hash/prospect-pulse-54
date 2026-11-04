-- Rollback de 20261105100000_contact_opt_outs.sql
--
-- Restaura o estado logo após 20261031100000_organization_connections:
-- remove public.contact_opt_out_events e public.contact_opt_outs (com
-- policies, triggers, índices e grants). public.set_updated_at() é anterior a
-- esta migration e fica. Nenhuma tabela existente é alterada.
--
-- ATENÇÃO: apaga as oposições registradas e o histórico, que são prova de
-- atendimento ao direito de oposição (LGPD). Exporte as duas tabelas para
-- scripts/legacy/backup-<data>-opt-outs.json ANTES de rodar (regra de produção
-- do CLAUDE.md). Depois do rollback, o código das tasks seguintes do opt-out
-- deixa de funcionar: reverta-o antes.

drop table if exists public.contact_opt_out_events;
drop table if exists public.contact_opt_outs;
