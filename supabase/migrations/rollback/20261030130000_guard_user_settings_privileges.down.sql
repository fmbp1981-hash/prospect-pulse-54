-- Rollback de 20261030130000_guard_user_settings_privileges.sql
--
-- Restaura o estado vigente logo após 20261030120000_harden_security_definer_functions:
--   * remove o trigger e a função guard;
--   * is_admin() volta ao corpo ORIGINAL de produção (plpgsql, VOLATILE,
--     "role admin" sem olhar organização), mantendo SECURITY DEFINER e
--     search_path = public, pg_temp. CREATE OR REPLACE preserva owner e ACL
--     (EXECUTE para authenticated e service_role, sem anon/PUBLIC);
--   * remove is_platform_admin() (nenhuma policy depende dela).
--
-- ATENÇÃO: este rollback REABRE a auto-escalada de role em user_settings e o
-- acesso do admin de organização ao user_settings de todas as empresas.
-- Usar só se a migration quebrar algo em produção, e reaplicar a correção logo.

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
