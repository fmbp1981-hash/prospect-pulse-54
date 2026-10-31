-- 20261031100000_organization_connections.sql
-- Sprint 2b (conectores por organização), Task 2: schema.
--
-- Cria:
--   * public.organization_connections: conexão de uma organização com um
--     provedor (WhatsApp, e-mail, LLM, prospecção). Configuração não secreta em
--     config; segredo cifrado na aplicação (AES-256-GCM, secret-box.ts) em
--     secret = { "v": "v1", "iv": "<b64>", "ct": "<b64>" }. O banco nunca vê o
--     segredo em claro.
--   * public.platform_credentials: credencial da plataforma (IntelliX) por
--     provedor, usada pelas conexões com credential_source = 'platform'.
--   * public.usage_events: registro append-only de consumo por organização
--     (spec 4.6), escrito só pelo servidor.
--
-- Depende de 20260916000000 (organizations, is_org_member), 20261030130000
-- (is_platform_admin), 20261030120000 (default privileges: função nova nasce
-- SEM EXECUTE para anon/authenticated) e de public.set_updated_at() (existente).
-- Rollback: supabase/migrations/rollback/20261031100000_organization_connections.down.sql
-- Testes:   tests/db/organization-connections.sql (todos ok=true depois)
--           tests/db/function-privileges.sql (set_connection_webhook_key no grupo A)
--
-- Regras:
--   * "Não configurado" = ausência de linha. status não tem 'not_configured'.
--   * No máximo uma conexão por (organização, categoria) em whatsapp, email e
--     llm; em prospecting, uma por provedor (google_places, apify, firecrawl).
--   * WhatsApp é sempre credencial própria (credential_source = 'own').
--   * webhook_key: identificador opaco (64 hex) da URL do webhook de entrada,
--     gerado no banco só para whatsapp. Nunca legível nem gravável por
--     anon/authenticated.
--   * Leitura (authenticated): membros da organização e admin da plataforma,
--     SEM as colunas secret e webhook_key (grant de SELECT por coluna; um
--     "select *" pelo client da sessão falha com 42501, liste as colunas).
--   * Escrita (authenticated): só admin da plataforma (RLS); webhook_key e
--     organization_id (no UPDATE) fora do grant. O servidor também pode usar
--     service_role (BYPASSRLS).
--
-- Idempotente: pode ser reaplicada sem erro.

-- ---------------------------------------------------------------------------
-- 1. organization_connections
-- ---------------------------------------------------------------------------
create table if not exists public.organization_connections (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  category          text not null
    constraint organization_connections_category_check
    check (category in ('whatsapp', 'email', 'llm', 'prospecting')),
  provider          text not null
    constraint organization_connections_provider_check
    check (provider in ('meta_cloud', 'evolution', 'resend', 'openai', 'google_places', 'apify', 'firecrawl')),
  credential_source text not null
    constraint organization_connections_credential_source_check
    check (credential_source in ('platform', 'own')),
  config            jsonb not null default '{}'::jsonb,
  secret            jsonb null,
  status            text not null default 'pending_test'
    constraint organization_connections_status_check
    check (status in ('pending_test', 'active', 'failing', 'disabled')),
  last_tested_at    timestamptz null,
  last_test_result  text null,
  webhook_key       text null,
  configured_by     uuid null references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint organization_connections_category_provider_check check (
       (category = 'whatsapp'    and provider in ('meta_cloud', 'evolution'))
    or (category = 'email'       and provider = 'resend')
    or (category = 'llm'         and provider = 'openai')
    or (category = 'prospecting' and provider in ('google_places', 'apify', 'firecrawl'))
  ),
  constraint organization_connections_whatsapp_own_check
    check (category <> 'whatsapp' or credential_source = 'own'),
  constraint organization_connections_webhook_key_format
    check (webhook_key is null or webhook_key ~ '^[0-9a-f]{64}$'),
  constraint organization_connections_webhook_key_whatsapp_only
    check (webhook_key is null or category = 'whatsapp'),
  constraint organization_connections_webhook_key_key unique (webhook_key),
  constraint organization_connections_org_category_provider_key
    unique (organization_id, category, provider)
);

alter table public.organization_connections owner to postgres;

create unique index if not exists organization_connections_org_single_category_key
  on public.organization_connections (organization_id, category)
  where category in ('whatsapp', 'email', 'llm');

comment on table public.organization_connections is
  'Conexão de uma organização com um provedor (Sprint 2b). Sem linha = não configurado. '
  'Escrita só pelo admin da plataforma (RLS) ou pelo servidor (service_role). '
  'secret e webhook_key nunca são legíveis por anon/authenticated.';
comment on column public.organization_connections.secret is
  'Segredo cifrado na aplicação: {"v":"v1","iv":"<b64>","ct":"<b64>"}. Só quando credential_source = ''own''.';
comment on column public.organization_connections.webhook_key is
  'Identificador opaco (64 hex) da URL do webhook de entrada do WhatsApp. Gerado no banco só para category = ''whatsapp''.';
comment on index public.organization_connections_org_single_category_key is
  'No máximo uma conexão por organização em whatsapp, email e llm (prospecting: uma por provedor).';

-- Trigger: gera webhook_key para conexões de WhatsApp (grupo A: só trigger).
-- Mesmo padrão do webhook_token (20261030140000): dois gen_random_uuid() sem
-- hífens = 64 hex, 244 bits aleatórios.
create or replace function public.set_connection_webhook_key()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.category = 'whatsapp' and new.webhook_key is null then
    new.webhook_key := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  end if;
  return new;
end;
$$;

alter function public.set_connection_webhook_key() owner to postgres;

comment on function public.set_connection_webhook_key() is
  'Trigger BEFORE INSERT OR UPDATE OF category em organization_connections: gera webhook_key (64 hex) '
  'quando category = ''whatsapp'' e a chave ainda não existe.';

revoke execute on function public.set_connection_webhook_key() from public, anon, authenticated;
grant  execute on function public.set_connection_webhook_key() to service_role;

drop trigger if exists organization_connections_webhook_key on public.organization_connections;
create trigger organization_connections_webhook_key
  before insert or update of category on public.organization_connections
  for each row
  execute function public.set_connection_webhook_key();

drop trigger if exists organization_connections_updated_at on public.organization_connections;
create trigger organization_connections_updated_at
  before update on public.organization_connections
  for each row
  execute function public.set_updated_at();

-- RLS
alter table public.organization_connections enable row level security;
alter table public.organization_connections force row level security;

drop policy if exists "org members and platform admin read connections" on public.organization_connections;
create policy "org members and platform admin read connections" on public.organization_connections
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());

drop policy if exists "platform admin inserts connections" on public.organization_connections;
create policy "platform admin inserts connections" on public.organization_connections
  for insert to authenticated
  with check (public.is_platform_admin());

drop policy if exists "platform admin updates connections" on public.organization_connections;
create policy "platform admin updates connections" on public.organization_connections
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "platform admin deletes connections" on public.organization_connections;
create policy "platform admin deletes connections" on public.organization_connections
  for delete to authenticated
  using (public.is_platform_admin());

-- Privilégios. REVOKE ALL na tabela também remove os grants por coluna, então
-- a sequência abaixo é reaplicável. authenticated nunca lê secret nem
-- webhook_key; grava secret (já cifrado pelo servidor) só se passar na RLS
-- (admin da plataforma); webhook_key não é gravável por authenticated
-- (gerado pelo trigger). organization_id não muda no UPDATE.
revoke all on public.organization_connections from public, anon, authenticated;
grant select (id, organization_id, category, provider, credential_source, config, status,
              last_tested_at, last_test_result, configured_by, created_at, updated_at)
  on public.organization_connections to authenticated;
grant insert (organization_id, category, provider, credential_source, config, secret, status,
              last_tested_at, last_test_result, configured_by)
  on public.organization_connections to authenticated;
grant update (category, provider, credential_source, config, secret, status,
              last_tested_at, last_test_result, configured_by)
  on public.organization_connections to authenticated;
grant delete on public.organization_connections to authenticated;
grant all on public.organization_connections to service_role;

-- ---------------------------------------------------------------------------
-- 2. platform_credentials (só service_role)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_credentials (
  id         uuid primary key default gen_random_uuid(),
  provider   text not null
    constraint platform_credentials_provider_check
    check (provider in ('meta_cloud', 'evolution', 'resend', 'openai', 'google_places', 'apify', 'firecrawl')),
  secret     jsonb not null,
  config     jsonb not null default '{}'::jsonb,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_credentials_provider_key unique (provider)
);

alter table public.platform_credentials owner to postgres;

comment on table public.platform_credentials is
  'Credencial da plataforma (IntelliX) por provedor, usada pelas conexões com credential_source = ''platform''. '
  'secret cifrado na aplicação ({"v","iv","ct"}). Sem acesso para anon/authenticated: só service_role.';

drop trigger if exists platform_credentials_updated_at on public.platform_credentials;
create trigger platform_credentials_updated_at
  before update on public.platform_credentials
  for each row
  execute function public.set_updated_at();

alter table public.platform_credentials enable row level security;
alter table public.platform_credentials force row level security;
-- Nenhuma policy: anon/authenticated não têm acesso (nem privilégio, nem linha).

revoke all on public.platform_credentials from public, anon, authenticated;
grant all on public.platform_credentials to service_role;

-- ---------------------------------------------------------------------------
-- 3. usage_events (append-only, escrita só pelo servidor)
-- ---------------------------------------------------------------------------
create table if not exists public.usage_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category        text not null
    constraint usage_events_category_check
    check (category in ('whatsapp', 'email', 'llm', 'prospecting')),
  provider        text not null
    constraint usage_events_provider_check
    check (provider in ('meta_cloud', 'evolution', 'resend', 'openai', 'google_places', 'apify', 'firecrawl')),
  operation       text not null,
  quantity        numeric not null
    constraint usage_events_quantity_check check (quantity >= 0),
  unit            text not null,
  connection_id   uuid null references public.organization_connections(id) on delete set null,
  created_at      timestamptz not null default now()
);

alter table public.usage_events owner to postgres;

create index if not exists usage_events_org_created_at_idx
  on public.usage_events (organization_id, created_at);

-- Consulta documentada (spec 4.6): consumo por organização e mês.
--
--   select organization_id,
--          date_trunc('month', created_at) as mes,
--          category, provider, operation, unit,
--          sum(quantity) as total,
--          count(*)      as eventos
--   from public.usage_events
--   where created_at >= date_trunc('month', now()) - interval '2 months'
--   group by 1, 2, 3, 4, 5, 6
--   order by 1, 2, 3, 4, 5, 6;
comment on table public.usage_events is
  'Consumo de recursos pagos por organização (append-only; spec 4.6). Escrita só pelo servidor (service_role); '
  'leitura por membros da organização e admin da plataforma. Consumo por organização/mês: '
  'select organization_id, date_trunc(''month'', created_at) as mes, category, provider, operation, unit, '
  'sum(quantity) as total, count(*) as eventos from public.usage_events group by 1, 2, 3, 4, 5, 6 order by 1, 2;';

alter table public.usage_events enable row level security;
alter table public.usage_events force row level security;

drop policy if exists "org members and platform admin read usage" on public.usage_events;
create policy "org members and platform admin read usage" on public.usage_events
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());

revoke all on public.usage_events from public, anon, authenticated;
grant select on public.usage_events to authenticated;
grant all on public.usage_events to service_role;
