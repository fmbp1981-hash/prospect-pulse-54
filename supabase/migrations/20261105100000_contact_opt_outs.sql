-- 20261105100000_contact_opt_outs.sql
-- Opt-out de contatos (SPEC.md), TASK-001: contrato de dados.
--
-- Cria:
--   * public.contact_opt_outs: situação vigente da oposição de uma pessoa a
--     novos contatos, por organização. Identificada pelo telefone em E.164
--     e/ou pelo e-mail normalizado (minúsculas, sem espaços em volta). Fica
--     ligada ao lead quando ele existe, mas sobrevive à exclusão do lead
--     (lead_id vira null).
--   * public.contact_opt_out_events: histórico append-only de cada registro e
--     revogação (prova de atendimento ao direito de oposição, LGPD art. 18).
--     Da conversa de WhatsApp guarda só o id da mensagem, nunca o texto.
--
-- Depende de 20260916000000 (organizations, is_org_member), 20261030130000
-- (is_platform_admin) e de public.set_updated_at() (existente).
-- Rollback: supabase/migrations/rollback/20261105100000_contact_opt_outs.down.sql
-- Testes:   tests/db/contact-opt-outs.sql (todos ok=true depois)
--
-- Regras:
--   * A oposição vale para todos os canais (decisão 1 do SPEC); não há canal.
--   * Uma linha por (organização, telefone) e por (organização, e-mail),
--     inclusive revogadas: registrar de novo reativa a mesma linha.
--   * O banco só valida o formato; normalizar é do servidor (TASK-002).
--   * Leitura (authenticated): membros da organização e admin da plataforma.
--   * Escrita: só o servidor (service_role), depois de autorizar o papel do
--     usuário. Nenhum usuário grava direto pela sessão.
--   * Ninguém apaga oposição nem altera/apaga o histórico: service_role não
--     tem DELETE/TRUNCATE nas duas tabelas nem UPDATE no histórico. Só a
--     exclusão da organização remove as linhas (cascade, executado como owner).
--   * O histórico não tem updated_at: é append-only, como usage_events.
--
-- Idempotente: pode ser reaplicada sem erro, MAS os grants daqui são os de
-- antes do reforço (UPDATE amplo de service_role). Se reaplicar esta base
-- depois de 20261105110000_contact_opt_outs_hardening, reaplique o reforço em
-- seguida: ele volta o UPDATE de service_role às colunas de situação.
-- (tests/db/contact-opt-outs-rollback-cycle.py cobre essa sequência.)

-- ---------------------------------------------------------------------------
-- 1. contact_opt_outs (situação vigente)
-- ---------------------------------------------------------------------------
create table if not exists public.contact_opt_outs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  phone_e164       text null
    constraint contact_opt_outs_phone_e164_format
    check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email_normalized text null
    constraint contact_opt_outs_email_normalized_format
    check (email_normalized = lower(btrim(email_normalized)) and email_normalized ~ '^[^@\s]+@[^@\s]+$'),
  status           text not null default 'active'
    constraint contact_opt_outs_status_check
    check (status in ('active', 'revoked')),
  source           text not null
    constraint contact_opt_outs_source_check
    check (source in ('link_email', 'whatsapp_titular', 'agente_ia', 'usuario', 'importacao')),
  lead_id          text null references public.leads_prospeccao(id) on delete set null,
  opted_out_at     timestamptz not null default now(),
  revoked_at       timestamptz null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint contact_opt_outs_identifier_required
    check (phone_e164 is not null or email_normalized is not null),
  constraint contact_opt_outs_revoked_at_check
    check ((status = 'revoked') = (revoked_at is not null))
);

alter table public.contact_opt_outs owner to postgres;

create unique index if not exists contact_opt_outs_org_phone_key
  on public.contact_opt_outs (organization_id, phone_e164)
  where phone_e164 is not null;

create unique index if not exists contact_opt_outs_org_email_key
  on public.contact_opt_outs (organization_id, email_normalized)
  where email_normalized is not null;

create index if not exists contact_opt_outs_lead_id_idx
  on public.contact_opt_outs (lead_id)
  where lead_id is not null;

comment on table public.contact_opt_outs is
  'Oposição vigente de uma pessoa a novos contatos, por organização e em todos os canais (SPEC opt-out). '
  'Escrita só pelo servidor (service_role); leitura por membros da organização e admin da plataforma. '
  'Sobrevive à exclusão do lead (lead_id on delete set null). Histórico em contact_opt_out_events.';
comment on column public.contact_opt_outs.phone_e164 is
  'Telefone em E.164 (ex.: +5511999990000). Normalizado pelo servidor; o banco só valida o formato.';
comment on column public.contact_opt_outs.email_normalized is
  'E-mail em minúsculas e sem espaços em volta. Normalizado pelo servidor; o banco só valida o formato.';
comment on column public.contact_opt_outs.source is
  'Origem do registro vigente: link_email, whatsapp_titular, agente_ia, usuario ou importacao.';

drop trigger if exists contact_opt_outs_updated_at on public.contact_opt_outs;
create trigger contact_opt_outs_updated_at
  before update on public.contact_opt_outs
  for each row
  execute function public.set_updated_at();

-- RLS
alter table public.contact_opt_outs enable row level security;
alter table public.contact_opt_outs force row level security;

drop policy if exists "org members and platform admin read opt-outs" on public.contact_opt_outs;
create policy "org members and platform admin read opt-outs" on public.contact_opt_outs
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());

revoke all on public.contact_opt_outs from public, anon, authenticated, service_role;
grant select on public.contact_opt_outs to authenticated;
grant select, insert, update on public.contact_opt_outs to service_role;

-- ---------------------------------------------------------------------------
-- 2. contact_opt_out_events (histórico append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.contact_opt_out_events (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  opt_out_id          uuid not null references public.contact_opt_outs(id) on delete cascade,
  event_type          text not null
    constraint contact_opt_out_events_event_type_check
    check (event_type in ('opt_out', 'revoke')),
  source              text not null
    constraint contact_opt_out_events_source_check
    check (source in ('link_email', 'whatsapp_titular', 'agente_ia', 'usuario', 'importacao')),
  actor_type          text not null
    constraint contact_opt_out_events_actor_type_check
    check (actor_type in ('usuario', 'agente_ia', 'titular', 'sistema')),
  actor_user_id       uuid null references auth.users(id) on delete set null,
  reason              text null,
  evidence_message_id text null,
  created_at          timestamptz not null default now(),
  constraint contact_opt_out_events_revoke_reason_required
    check (event_type <> 'revoke' or length(btrim(coalesce(reason, ''))) >= 3)
);

alter table public.contact_opt_out_events owner to postgres;

create index if not exists contact_opt_out_events_opt_out_created_at_idx
  on public.contact_opt_out_events (opt_out_id, created_at);

create index if not exists contact_opt_out_events_org_created_at_idx
  on public.contact_opt_out_events (organization_id, created_at);

comment on table public.contact_opt_out_events is
  'Histórico append-only de registros e revogações de oposição (prova de atendimento, LGPD art. 18). '
  'Só o servidor insere; ninguém altera nem apaga (sem UPDATE/DELETE/TRUNCATE para service_role).';
comment on column public.contact_opt_out_events.reason is
  'Motivo; obrigatório na revogação (ex.: novo consentimento do titular, registro feito por engano).';
comment on column public.contact_opt_out_events.evidence_message_id is
  'Id da mensagem que originou o registro automático (WhatsApp). Nunca o texto da mensagem.';

-- RLS
alter table public.contact_opt_out_events enable row level security;
alter table public.contact_opt_out_events force row level security;

drop policy if exists "org members and platform admin read opt-out events" on public.contact_opt_out_events;
create policy "org members and platform admin read opt-out events" on public.contact_opt_out_events
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());

revoke all on public.contact_opt_out_events from public, anon, authenticated, service_role;
grant select on public.contact_opt_out_events to authenticated;
grant select, insert on public.contact_opt_out_events to service_role;
