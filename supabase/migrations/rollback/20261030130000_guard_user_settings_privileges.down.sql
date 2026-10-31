-- Rollback de 20261030130000_guard_user_settings_privileges.sql
--
-- Restaura o estado vigente logo após 20261030120000_harden_security_definer_functions:
--   * remove o trigger e a função guard;
--   * is_admin() volta ao corpo ORIGINAL de produção (plpgsql, VOLATILE,
--     "role admin" sem olhar organização), mantendo SECURITY DEFINER e
--     search_path = public, pg_temp. CREATE OR REPLACE preserva owner e ACL
--     (EXECUTE para authenticated e service_role, sem anon/PUBLIC);
--   * remove is_platform_admin() e a tabela platform_admins (a allowlist e
--     qualquer linha incluída depois da migration são perdidas);
--   * organization_members volta à policy FOR ALL original
--     "admins can manage membership" (20260916000000).
--
-- ATENÇÃO: este rollback REABRE a auto-escalada de role em user_settings, o
-- acesso do admin de organização ao user_settings de todas as empresas, a
-- remoção do próprio vínculo pelo admin de org e a troca de user_id por
-- writers. Usar só se a migration quebrar algo em produção, e reaplicar a
-- correção logo.

drop trigger if exists aa_guard_user_settings_privileged_columns on public.user_settings;
drop function if exists public.guard_user_settings_privileged_columns();

create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_settings
    WHERE user_id = auth.uid()
    AND role = 'admin'
  );
END;
$$;

drop function if exists public.is_platform_admin();
drop table if exists public.platform_admins;

drop policy if exists "org admins can insert membership" on public.organization_members;
drop policy if exists "org admins can update other members" on public.organization_members;
drop policy if exists "org admins can delete other members" on public.organization_members;
drop policy if exists "admins can manage membership" on public.organization_members;
create policy "admins can manage membership" on public.organization_members
  for all
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
