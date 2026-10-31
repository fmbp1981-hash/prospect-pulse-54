-- 20261030130000_guard_user_settings_privileges.sql
-- Sprint 1 (segurança), Task 6b (CRÍTICA): fecha a escalada de privilégio em
-- public.user_settings e separa o admin da PLATAFORMA do admin de ORGANIZAÇÃO.
--
-- Depende de 20261030120000_harden_security_definer_functions (search_path de
-- is_admin() = "public, pg_temp", EXECUTE só para authenticated/service_role e
-- default privileges sem EXECUTE para anon/authenticated em função nova).
-- Rollback: supabase/migrations/rollback/20261030130000_guard_user_settings_privileges.down.sql
-- Testes:   tests/db/user-settings-privilege-escalation.sql (todos ok=true depois)
--           tests/db/function-privileges.sql (0 linhas depois)
--
-- Falhas corrigidas (estado de produção verificado em 2026-10-30):
--   1. A policy UPDATE "Users can update own settings or admins update all"
--      (auth.uid() = user_id OR is_admin()) não tem WITH CHECK e authenticated
--      tem UPDATE em todas as colunas, inclusive role: qualquer usuário (até o
--      recém-cadastrado pendente) fazia update({role:'admin', pending_setup:false})
--      na própria linha e virava admin.
--   2. INSERT da própria linha já com role='admin'.
--   3. is_admin() era verdadeiro para o admin de uma EMPRESA cliente (role admin
--      com organization_id): as policies "admins see/update all" deixavam esse
--      admin ler/alterar user_settings (com chaves de API) de TODAS as empresas.
--
-- Correção:
--   * is_platform_admin(): admin da plataforma = user_settings.role = 'admin',
--     user_settings.organization_id nulo E nenhuma linha em
--     organization_members. A ausência de vínculo é obrigatória: o signup
--     (init-user-settings) grava user_settings antes da membership e o
--     approve-user (service_role) não preenche organization_id, então um admin
--     de empresa cliente pode ter user_settings.organization_id nulo
--     (confirmado em produção em 2026-10-30: 2 usuários nessa situação).
--   * is_admin() passa a ter o mesmo corpo. Todas as policies que já usam
--     is_admin() (user_settings, audit_logs, leads_prospeccao, role_changes)
--     passam a valer só para o admin da plataforma, sem reescrever policies.
--     O admin de organização continua coberto por is_org_admin(org) /
--     is_org_member(org) / is_org_writer(org) via organization_members.
--   * Trigger guard BEFORE INSERT OR UPDATE: só service_role, conexão direta
--     sem JWT (migrations) ou o admin da plataforma alteram role, pending_setup,
--     approved_by, rejected, rejected_at e rejected_by.
--
-- Mudança de comportamento ACEITA (decisão do controller, 2026-10-30): o admin
-- de organização deixa de alterar role / pending_setup de outros usuários pela
-- tela RoleManagement (client da sessão), inclusive membros da própria org
-- (42501). A gestão de roles com o client da sessão fica restrita ao admin da
-- plataforma; as rotas /api/admin/* (service_role) não são afetadas pelo guard.

-- ---------------------------------------------------------------------------
-- 1. Admin da plataforma (grupo B: helper de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_settings
    where user_id = auth.uid()
      and role = 'admin'
      and organization_id is null
      and not exists (
        select 1 from public.organization_members om
        where om.user_id = auth.uid()
      )
  );
$$;

comment on function public.is_platform_admin() is
  'true se o usuário atual é admin da PLATAFORMA (user_settings.role = admin, organization_id nulo e '
  'nenhuma linha em organization_members). '
  'Admin de organização é verificado por is_org_admin(org).';

revoke execute on function public.is_platform_admin() from public, anon;
grant  execute on function public.is_platform_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. is_admin(): mesma assinatura (sem argumentos, returns boolean). CREATE OR
--    REPLACE preserva owner e ACL; o SET search_path e o SECURITY DEFINER
--    precisam ser repetidos porque o REPLACE redefine todos os atributos.
--    Corpo idêntico ao de is_platform_admin() (sem chamá-la, para o rollback
--    poder dropar is_platform_admin sem dependência).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_settings
    where user_id = auth.uid()
      and role = 'admin'
      and organization_id is null
      and not exists (
        select 1 from public.organization_members om
        where om.user_id = auth.uid()
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Guard das colunas privilegiadas (grupo A: só trigger)
--
-- Chamador privilegiado:
--   * auth.role() = 'service_role' (rotas /api/admin/* com service role key);
--   * sem JWT: auth.uid() nulo e auth.role() fora de anon/authenticated
--     (conexão direta postgres/supabase_admin, migrations, SQL editor);
--   * admin da plataforma (tela de gestão de roles com o client da sessão).
-- Demais chamadores:
--   * INSERT: colunas privilegiadas são forçadas ao estado de "cadastro novo
--     pendente" (o client do app já envia visualizador/pending_setup=true);
--   * UPDATE: alterar qualquer coluna privilegiada gera 42501.
--
-- O prefixo "aa_" faz este trigger disparar antes dos demais BEFORE do
-- user_settings (Postgres dispara triggers do mesmo evento em ordem
-- alfabética): set_org_id_user_settings, trigger_new_user_webhook,
-- trigger_update_user_settings_updated_at.
-- Revogar EXECUTE não impede o disparo do trigger (o privilégio só é checado
-- no CREATE TRIGGER, que roda como postgres).
-- ---------------------------------------------------------------------------
create or replace function public.guard_user_settings_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jwt_role text := coalesce(auth.role(), '');
begin
  if v_jwt_role = 'service_role'
     or (auth.uid() is null and v_jwt_role not in ('anon', 'authenticated'))
     or public.is_platform_admin()
  then
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

  if new.role          is distinct from old.role
     or new.pending_setup is distinct from old.pending_setup
     or new.approved_by   is distinct from old.approved_by
     or new.rejected      is distinct from old.rejected
     or new.rejected_at   is distinct from old.rejected_at
     or new.rejected_by   is distinct from old.rejected_by
  then
    raise exception 'Alteração de campo privilegiado não permitida'
      using errcode = '42501',
            hint = 'role, pending_setup, approved_by e rejected* só podem ser alterados pelo admin da plataforma ou pelo servidor.';
  end if;

  return new;
end;
$$;

comment on function public.guard_user_settings_privileged_columns() is
  'Trigger BEFORE INSERT OR UPDATE em user_settings: impede que usuário comum (inclusive admin de '
  'organização) defina role, pending_setup, approved_by ou rejected*. Liberado para service_role, '
  'conexão sem JWT e admin da plataforma.';

revoke execute on function public.guard_user_settings_privileged_columns() from public, anon, authenticated;
grant  execute on function public.guard_user_settings_privileged_columns() to service_role;

drop trigger if exists aa_guard_user_settings_privileged_columns on public.user_settings;
create trigger aa_guard_user_settings_privileged_columns
  before insert or update on public.user_settings
  for each row
  execute function public.guard_user_settings_privileged_columns();
