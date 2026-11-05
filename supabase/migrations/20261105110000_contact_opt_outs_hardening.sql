-- 20261105110000_contact_opt_outs_hardening.sql
-- Opt-out de contatos, TASK-001: reforço do contrato de dados pedido pela
-- revisão isolada de 2026-11-04 (20261105100000 já estava aplicada).
--
-- O que muda (só nas duas tabelas do opt-out; nada existente é tocado):
--   1. Evento e oposição sempre da mesma organização (FK composta).
--   2. Lead ligado à oposição sempre da mesma organização (trigger; não
--      altera leads_prospeccao).
--   3. service_role só atualiza as colunas de situação da oposição; ninguém
--      troca organização/created_at nem troca ou apaga telefone/e-mail já
--      preenchido (preencher um identificador vazio continua permitido).
--      Corrigir identificador = revogar e registrar outra oposição.
--   4. Histórico: created_at sempre now(); motivo com no máximo 500
--      caracteres e sem aceitar só espaços/tabs na revogação;
--      evidence_message_id só no formato de id (nunca texto de mensagem).
--   5. Índices por organização (contact_opt_outs) e por autor (eventos).
--
-- Fora daqui (decisão do usuário): exigir um evento a cada mudança de status
-- é responsabilidade do servidor (TASK-002), numa única operação.
-- actor_user_id continua on delete set null: é a única alteração possível no
-- histórico, para não reter vínculo com usuário excluído.
--
-- Funções novas: SECURITY INVOKER, search_path fixo, só usadas por trigger.
-- Rollback: supabase/migrations/rollback/20261105110000_contact_opt_outs_hardening.down.sql
-- Testes:   tests/db/contact-opt-outs.sql (todos ok=true depois)
-- Idempotente: pode ser reaplicada sem erro.

-- ---------------------------------------------------------------------------
-- 1. Evento e oposição da mesma organização
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.contact_opt_outs'::regclass
                   and conname = 'contact_opt_outs_id_org_key') then
    alter table public.contact_opt_outs
      add constraint contact_opt_outs_id_org_key unique (id, organization_id);
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.contact_opt_out_events'::regclass
                   and conname = 'contact_opt_out_events_opt_out_org_fkey') then
    alter table public.contact_opt_out_events
      add constraint contact_opt_out_events_opt_out_org_fkey
      foreign key (opt_out_id, organization_id)
      references public.contact_opt_outs (id, organization_id) on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2 e 3. Guarda da oposição (lead da mesma organização; identificador estável)
-- ---------------------------------------------------------------------------
create or replace function public.contact_opt_outs_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      raise exception 'contact_opt_outs: organization_id não pode mudar'
        using errcode = 'check_violation';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'contact_opt_outs: created_at não pode mudar'
        using errcode = 'check_violation';
    end if;
    if old.phone_e164 is not null and new.phone_e164 is distinct from old.phone_e164 then
      raise exception 'contact_opt_outs: telefone já registrado não pode ser trocado nem apagado'
        using errcode = 'check_violation';
    end if;
    if old.email_normalized is not null and new.email_normalized is distinct from old.email_normalized then
      raise exception 'contact_opt_outs: e-mail já registrado não pode ser trocado nem apagado'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.lead_id is not null
     and (tg_op = 'INSERT' or new.lead_id is distinct from old.lead_id)
     and not exists (select 1 from public.leads_prospeccao l
                     where l.id = new.lead_id
                       and l.organization_id = new.organization_id) then
    raise exception 'contact_opt_outs: lead não pertence à organização da oposição'
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end $$;

comment on function public.contact_opt_outs_guard() is
  'Trigger de contact_opt_outs: lead da mesma organização; organização, created_at e identificador preenchido não mudam.';

drop trigger if exists contact_opt_outs_guard on public.contact_opt_outs;
create trigger contact_opt_outs_guard
  before insert or update on public.contact_opt_outs
  for each row
  execute function public.contact_opt_outs_guard();

-- UPDATE só nas colunas de situação (e identificador vazio, pelo trigger acima)
revoke update on public.contact_opt_outs from service_role;
grant update (status, source, lead_id, opted_out_at, revoked_at, phone_e164, email_normalized, updated_at)
  on public.contact_opt_outs to service_role;

-- ---------------------------------------------------------------------------
-- 4. Histórico: created_at do banco e campos de texto limitados
-- ---------------------------------------------------------------------------
create or replace function public.contact_opt_out_events_stamp()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.created_at := now();
  return new;
end $$;

comment on function public.contact_opt_out_events_stamp() is
  'Trigger de contact_opt_out_events: created_at sempre now() (quem insere não escolhe a data da prova).';

drop trigger if exists contact_opt_out_events_stamp on public.contact_opt_out_events;
create trigger contact_opt_out_events_stamp
  before insert on public.contact_opt_out_events
  for each row
  execute function public.contact_opt_out_events_stamp();

alter table public.contact_opt_out_events
  drop constraint if exists contact_opt_out_events_revoke_reason_required;
alter table public.contact_opt_out_events
  add constraint contact_opt_out_events_revoke_reason_required
  check (event_type <> 'revoke' or length(btrim(coalesce(reason, ''), E' \t\r\n')) >= 3);

alter table public.contact_opt_out_events
  drop constraint if exists contact_opt_out_events_reason_length;
alter table public.contact_opt_out_events
  add constraint contact_opt_out_events_reason_length
  check (reason is null or length(reason) <= 500);

alter table public.contact_opt_out_events
  drop constraint if exists contact_opt_out_events_evidence_message_id_format;
alter table public.contact_opt_out_events
  add constraint contact_opt_out_events_evidence_message_id_format
  check (evidence_message_id is null
         or (length(evidence_message_id) <= 128 and evidence_message_id ~ '^[A-Za-z0-9._:@=+/-]+$'));

-- ---------------------------------------------------------------------------
-- 5. Índices
-- ---------------------------------------------------------------------------
create index if not exists contact_opt_outs_org_idx
  on public.contact_opt_outs (organization_id);

create index if not exists contact_opt_out_events_actor_user_id_idx
  on public.contact_opt_out_events (actor_user_id)
  where actor_user_id is not null;
