-- Follow-up idempotente: trava atômica por lead.
--
-- Problema: o job de follow-up buscava os leads elegíveis com SELECT simples e
-- só depois enviava/incrementava. Dois disparos simultâneos (agendador externo
-- + cron, ou uma execução que passa de 1 minuto) pegavam o mesmo lead e
-- mandavam a mesma mensagem duas vezes.
--
-- Solução: coluna follow_up_lock_until + função claim_due_follow_ups, que em
-- UM único statement seleciona os leads vencidos (FOR UPDATE SKIP LOCKED) e
-- grava a trava de 5 minutos nas linhas devolvidas. Quem chegar depois não vê
-- as linhas travadas. O job zera a trava ao incrementar o follow-up (sucesso);
-- quando desiste do envio (sem instância / falha) grava um backoff de 15 min
-- na mesma coluna; e a trava expira sozinha se o processo morrer no meio.
--
-- Idempotente: pode ser reaplicada sem erro.
-- Rollback: supabase/migrations/rollback/20261030110000_follow_up_claim.down.sql

alter table public.leads_prospeccao
  add column if not exists follow_up_lock_until timestamptz null;

comment on column public.leads_prospeccao.follow_up_lock_until is
  'Trava do job de follow-up: enquanto > now(), o lead está reservado por uma execução e não é reivindicado de novo.';

create or replace function public.claim_due_follow_ups(p_limit integer default 20)
returns setof public.leads_prospeccao
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select l.id
    from public.leads_prospeccao l
    where l.modo_atendimento = 'bot'
      and l.status_msg_wa in ('Em Conversa', 'Qualificando')
      and l.whatsapp is not null
      and (l.follow_up_lock_until is null or l.follow_up_lock_until < now())
      and (
           (l.follow_up_count = 0 and l.data_ultima_interacao <= now() - interval '15 minutes')
        or (l.follow_up_count = 1 and l.data_ultima_interacao <= now() - interval '60 minutes')
        or (l.follow_up_count = 2 and l.data_ultima_interacao <= now() - interval '1440 minutes')
      )
    order by l.data_ultima_interacao asc, l.id asc
    limit least(greatest(coalesce(p_limit, 20), 0), 100)
    for update of l skip locked
  ),
  claimed as (
    update public.leads_prospeccao l
       set follow_up_lock_until = now() + interval '5 minutes'
      from due
     where l.id = due.id
    returning l.*
  )
  select *
  from claimed
  order by data_ultima_interacao asc, id asc;
$$;

comment on function public.claim_due_follow_ups(integer) is
  'Reivindica atomicamente até p_limit (máx. 100) leads vencidos para follow-up e grava follow_up_lock_until = now() + 5 min. Uso exclusivo do service_role.';

revoke execute on function public.claim_due_follow_ups(integer) from public, anon, authenticated;
grant execute on function public.claim_due_follow_ups(integer) to service_role;
