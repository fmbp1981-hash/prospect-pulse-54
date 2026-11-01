-- Rollback de 20261030110000_follow_up_claim.sql
-- Antes de rodar: reverter o deploy do código que chama
-- rpc('claim_due_follow_ups') e grava follow_up_lock_until, senão o job de
-- follow-up passa a falhar.

drop function if exists public.claim_due_follow_ups(integer);

alter table public.leads_prospeccao
  drop column if exists follow_up_lock_until;
