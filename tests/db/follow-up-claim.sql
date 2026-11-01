-- Teste de banco: claim_due_follow_ups é idempotente dentro da janela da trava.
--
-- Roda inteiro dentro de begin/rollback: não deixa nada gravado.
-- Esperado ANTES da migration 20261030110000_follow_up_claim:
--   ERROR: function public.claim_due_follow_ups(integer) does not exist
-- Esperado DEPOIS:
--   primeira_contem_lead | segunda_contem_lead
--   true                 | false
--
-- Observação: a função devolve no máximo 20 leads, os mais antigos primeiro.
-- Se houver mais de 20 leads reais elegíveis com interação mais antiga que a do
-- lead de teste, a primeira coluna pode vir false sem bug; nesse caso conferir
-- antes com:
--   select count(*) from leads_prospeccao
--   where modo_atendimento = 'bot' and status_msg_wa in ('Em Conversa','Qualificando')
--     and whatsapp is not null and follow_up_count in (0,1,2);

begin;

-- O trigger de INSERT de leads_prospeccao exige user_id = auth.uid():
-- simula o JWT de um usuário existente só dentro desta transação.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select id from auth.users order by created_at limit 1), 'role', 'authenticated')::text,
  true
);

insert into public.leads_prospeccao (
  id, lead, empresa, user_id, whatsapp,
  follow_up_count, modo_atendimento, status_msg_wa, data_ultima_interacao
) values (
  'TEST-follow-up-claim', 'Lead-TEST', 'Empresa Teste Follow-up',
  (select id from auth.users order by created_at limit 1), '+5500000000000',
  0, 'bot', 'Em Conversa', now() - interval '20 minutes'
);

create temp table _claim_1 on commit drop as
  select id from public.claim_due_follow_ups(20);

create temp table _claim_2 on commit drop as
  select id from public.claim_due_follow_ups(20);

select
  exists (select 1 from _claim_1 where id = 'TEST-follow-up-claim') as primeira_contem_lead,
  exists (select 1 from _claim_2 where id = 'TEST-follow-up-claim') as segunda_contem_lead;

rollback;
