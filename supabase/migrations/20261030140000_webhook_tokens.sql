-- 20261030140000_webhook_tokens.sql
-- Sprint 1 (segurança), Task 8 (CRÍTICA, achado F-02): token secreto por tenant
-- para o webhook do WhatsApp.
--
-- Antes: POST /api/webhooks/evolution era público e o tenant vinha do campo
-- `instance` do payload. Qualquer um criava lead, rodava o agente (com a chave
-- OpenAI do tenant) e enviava WhatsApp pelo número de outra organização.
-- Agora: a Evolution chama POST /api/webhooks/evolution/<webhook_token> e o
-- servidor (service_role) resolve o tenant por user_settings.webhook_token.
--
-- Depende de 20261030130000_guard_user_settings_privileges (trigger guard).
-- Rollback: supabase/migrations/rollback/20261030140000_webhook_tokens.down.sql
-- Testes:   tests/db/webhook-token.sql (todos ok=true depois)
--
-- Geração do token: 64 caracteres hex a partir de dois gen_random_uuid()
-- (pg_catalog, PG13+; UUID v4 = 122 bits aleatórios cada, 244 bits no total).
-- Não usa gen_random_bytes: pgcrypto fica no schema extensions e as funções
-- rodam com search_path = public, pg_temp.
--
-- Comportamento:
--   * Coluna webhook_token text NOT NULL, única, formato ^[0-9a-f]{64}$.
--   * Linhas existentes: ADD COLUMN com default volátil calcula um valor por
--     linha na reescrita da tabela, sem disparar triggers (updated_at intacto).
--   * INSERT por usuário comum: o guard SEMPRE sobrescreve webhook_token com um
--     valor gerado no servidor (o valor enviado pelo client é descartado).
--   * UPDATE por usuário comum (inclusive admin de organização): mudar
--     webhook_token gera 42501. Rotação só pelo servidor / admin da plataforma.
--   * A leitura segue as policies SELECT atuais de user_settings: o próprio
--     usuário lê o token (para montar a URL em Configurações). ATENÇÃO: a policy
--     "org members can view user_settings" também expõe o token aos membros da
--     mesma organização (como já expõe as chaves de API); tratado no Sprint 2b.

-- ---------------------------------------------------------------------------
-- 1. Coluna, backfill, unicidade e formato
-- ---------------------------------------------------------------------------
alter table public.user_settings
  add column if not exists webhook_token text not null
  default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

-- Reaplicação/estado parcial: garante valor nas linhas sem token.
update public.user_settings
set webhook_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where webhook_token is null;

alter table public.user_settings
  alter column webhook_token set default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
alter table public.user_settings
  alter column webhook_token set not null;

alter table public.user_settings
  drop constraint if exists user_settings_webhook_token_key;
alter table public.user_settings
  add constraint user_settings_webhook_token_key unique (webhook_token);

alter table public.user_settings
  drop constraint if exists user_settings_webhook_token_format;
alter table public.user_settings
  add constraint user_settings_webhook_token_format
  check (webhook_token ~ '^[0-9a-f]{64}$');

comment on column public.user_settings.webhook_token is
  'Segredo do webhook do WhatsApp deste tenant (64 hex). URL: /api/webhooks/evolution/<webhook_token>. '
  'Gerado no servidor; usuário comum não define nem altera (guard aa_guard_user_settings_privileged_columns).';

-- ---------------------------------------------------------------------------
-- 2. Guard: corpo de 20261030130000 + webhook_token (INSERT: gerado; UPDATE: 42501)
--    CREATE OR REPLACE mantém o trigger existente; owner e ACL são reafirmados.
-- ---------------------------------------------------------------------------
create or replace function public.guard_user_settings_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_jwt_role text := coalesce(auth.role(), '');
begin
  if v_jwt_role = 'service_role'
     or (auth.uid() is null
         and v_jwt_role not in ('anon', 'authenticated')
         and current_user in ('postgres', 'supabase_admin', 'service_role'))
  then
    return new;
  end if;

  if public.is_platform_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role          := 'visualizador';
    new.pending_setup := true;
    new.approved_by   := null;
    new.rejected      := false;
    new.rejected_at   := null;
    new.rejected_by   := null;
    -- Token do webhook (Task 8): nunca aceito do client; sempre gerado aqui.
    new.webhook_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    return new;
  end if;

  if new.role            is distinct from old.role
     or new.pending_setup   is distinct from old.pending_setup
     or new.approved_by     is distinct from old.approved_by
     or new.rejected        is distinct from old.rejected
     or new.rejected_at     is distinct from old.rejected_at
     or new.rejected_by     is distinct from old.rejected_by
     or new.user_id         is distinct from old.user_id
     or new.organization_id is distinct from old.organization_id
     or new.webhook_token   is distinct from old.webhook_token
  then
    raise exception 'Alteração de campo privilegiado não permitida'
      using errcode = '42501',
            hint = 'role, pending_setup, approved_by, rejected*, user_id, organization_id e webhook_token só podem ser alterados pelo admin da plataforma ou pelo servidor.';
  end if;

  return new;
end;
$$;

alter function public.guard_user_settings_privileged_columns() owner to postgres;

comment on function public.guard_user_settings_privileged_columns() is
  'Trigger BEFORE INSERT OR UPDATE em user_settings: impede que usuário comum (inclusive admin de '
  'organização) defina role, pending_setup, approved_by, rejected*, user_id, organization_id ou webhook_token '
  '(no INSERT o webhook_token é sempre gerado pelo trigger). '
  'Liberado para service_role, conexão sem JWT como postgres/supabase_admin/service_role e admin da plataforma.';

revoke execute on function public.guard_user_settings_privileged_columns() from public, anon, authenticated;
grant  execute on function public.guard_user_settings_privileged_columns() to service_role;

