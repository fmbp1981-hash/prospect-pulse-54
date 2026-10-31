-- Rollback de 20261030150000_unique_evolution_instance.sql
--
-- Restaura o estado logo após 20261030140000_webhook_tokens:
--   * recria a policy SELECT "org members can view user_settings" (definição de
--     produção: for select using (is_org_member(organization_id)));
--   * remove o índice único de evolution_instance_name;
--   * o guard volta ao corpo EXATO de 20261030140000 (sem evolution_instance_name).
--
-- ATENÇÃO: com a policy recriada, membros da mesma organização voltam a ler as
-- chaves de API e o webhook_token uns dos outros (M-01).

drop policy if exists "org members can view user_settings" on public.user_settings;
create policy "org members can view user_settings" on public.user_settings
  for select
  using (is_org_member(organization_id));

drop index if exists public.user_settings_evolution_instance_name_key;

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
