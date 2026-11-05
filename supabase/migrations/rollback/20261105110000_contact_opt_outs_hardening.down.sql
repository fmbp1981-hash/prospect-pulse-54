-- Rollback de 20261105110000_contact_opt_outs_hardening.sql
--
-- Volta ao estado logo após 20261105100000_contact_opt_outs: remove triggers,
-- funções, constraints e índices do reforço e devolve o UPDATE amplo de
-- service_role em contact_opt_outs. Não apaga linhas.
--
-- ATENÇÃO: sem o reforço, o banco deixa de garantir organização coerente entre
-- evento, oposição e lead, e volta a aceitar troca de identificador. Reverta
-- antes o código que depende dessas garantias.
--
-- Histórico de migrations: depois de rodar, marque a versão como revertida
-- (supabase migration repair --status reverted 20261105110000, ou
-- delete from supabase_migrations.schema_migrations where version = '20261105110000').

drop index if exists public.contact_opt_out_events_actor_user_id_idx;
drop index if exists public.contact_opt_outs_org_idx;

alter table public.contact_opt_out_events
  drop constraint if exists contact_opt_out_events_evidence_message_id_format;
alter table public.contact_opt_out_events
  drop constraint if exists contact_opt_out_events_reason_length;
alter table public.contact_opt_out_events
  drop constraint if exists contact_opt_out_events_revoke_reason_required;
alter table public.contact_opt_out_events
  add constraint contact_opt_out_events_revoke_reason_required
  check (event_type <> 'revoke' or length(btrim(coalesce(reason, ''))) >= 3);

drop trigger if exists contact_opt_out_events_stamp on public.contact_opt_out_events;
drop function if exists public.contact_opt_out_events_stamp();

revoke update on public.contact_opt_outs from service_role;
grant update on public.contact_opt_outs to service_role;

drop trigger if exists contact_opt_outs_guard on public.contact_opt_outs;
drop function if exists public.contact_opt_outs_guard();

alter table public.contact_opt_out_events
  drop constraint if exists contact_opt_out_events_opt_out_org_fkey;
alter table public.contact_opt_outs
  drop constraint if exists contact_opt_outs_id_org_key;
