-- Rollback de 20261030140000_webhook_tokens.sql
--
-- Restaura o estado logo após 20261030130000_guard_user_settings_privileges:
--   * o guard volta ao corpo EXATO de 20261030130000 (sem webhook_token);
--   * remove as constraints e a coluna webhook_token.
--
-- ATENÇÃO: os tokens são perdidos. As URLs /api/webhooks/evolution/<token>
-- cadastradas na Evolution passam a responder 401 até a migration ser
-- reaplicada (novos tokens!) e as URLs reconfiguradas. Fazer rollback do
-- código (rota) junto, ou o webhook do WhatsApp fica parado.

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
  then
    raise exception 'Alteração de campo privilegiado não permitida'
      using errcode = '42501',
            hint = 'role, pending_setup, approved_by, rejected*, user_id e organization_id só podem ser alterados pelo admin da plataforma ou pelo servidor.';
  end if;

  return new;
end;
$$;

alter function public.guard_user_settings_privileged_columns() owner to postgres;

comment on function public.guard_user_settings_privileged_columns() is
  'Trigger BEFORE INSERT OR UPDATE em user_settings: impede que usuário comum (inclusive admin de '
  'organização) defina role, pending_setup, approved_by, rejected*, user_id ou organization_id. '
  'Liberado para service_role, conexão sem JWT como postgres/supabase_admin/service_role e admin da plataforma.';

revoke execute on function public.guard_user_settings_privileged_columns() from public, anon, authenticated;
grant  execute on function public.guard_user_settings_privileged_columns() to service_role;

alter table public.user_settings
  drop constraint if exists user_settings_webhook_token_format;
alter table public.user_settings
  drop constraint if exists user_settings_webhook_token_key;
alter table public.user_settings
  drop column if exists webhook_token;
