-- Rollback de 20261105120000_contact_opt_out_rpcs.sql
--
-- Remove só as duas funções. Não apaga nem altera linhas de contact_opt_outs
-- ou contact_opt_out_events, nem mexe em grants das tabelas.
--
-- ATENÇÃO: sem as funções, o serviço de oposição (opt-out.service.ts) passa a
-- falhar ao registrar e revogar (a consulta continua funcionando). Reverta
-- antes o código que as chama, ou aceite que registro/revogação fiquem fora
-- do ar até reaplicar.
--
-- Histórico de migrations: depois de rodar, marque a versão como revertida
-- (supabase migration repair --status reverted 20261105120000, ou
-- delete from supabase_migrations.schema_migrations where version = '20261105120000').

drop function if exists public.revoke_contact_opt_out(uuid, uuid, text, uuid);
drop function if exists public.register_contact_opt_out(uuid, text, text, text, text, uuid, text, text);
