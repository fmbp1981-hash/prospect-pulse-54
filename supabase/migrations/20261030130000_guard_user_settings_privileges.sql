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
--   2. INSERT da própria linha já com role='admin' (e upsert ON CONFLICT).
--   3. is_admin() era verdadeiro para o admin de uma EMPRESA cliente: as
--      policies "admins see/update all" deixavam esse admin ler/alterar
--      user_settings (com chaves de API) de TODAS as empresas.
--   4. (revisão DB-6B-01) Qualquer critério de admin da plataforma derivado de
--      dados que o próprio usuário controla é forjável: a policy FOR ALL
--      "admins can manage membership" deixava o admin de org apagar o PRÓPRIO
--      vínculo em organization_members.
--   5. (revisão DB-6B-02) A policy "org writers can update user_settings" não
--      amarra user_id: um writer apagava a própria linha e fazia
--      update set user_id = auth.uid() na linha de um admin da mesma org.
--
-- Correção:
--   * public.platform_admins: allowlist explícita do admin da PLATAFORMA.
--     Sem policy para anon/authenticated e sem grant para eles; novos admins da
--     plataforma entram SÓ via service_role ou SQL direto (postgres).
--   * is_platform_admin() e is_admin() = existe linha em platform_admins para
--     auth.uid(). Todas as policies que já usam is_admin() (user_settings,
--     audit_logs, leads_prospeccao, role_changes) passam a valer só para o
--     admin da plataforma, sem reescrever policies. O admin de organização
--     continua coberto por is_org_admin/is_org_member/is_org_writer.
--   * organization_members: a policy FOR ALL do admin de org é trocada por
--     INSERT/UPDATE/DELETE separados; UPDATE e DELETE não alcançam a própria
--     linha do admin (user_id <> auth.uid()).
--   * Trigger guard BEFORE INSERT OR UPDATE em user_settings: só o servidor
--     (JWT service_role, ou conexão sem JWT com role de banco postgres /
--     supabase_admin / service_role) ou o admin da plataforma alteram role,
--     pending_setup, approved_by, rejected*, user_id e organization_id.
--
-- Mudança de comportamento ACEITA (decisão do controller, 2026-10-30): o admin
-- de organização deixa de alterar role / pending_setup de outros usuários pela
-- tela RoleManagement (client da sessão), inclusive membros da própria org
-- (42501). A gestão de roles com o client da sessão fica restrita ao admin da
-- plataforma; as rotas /api/admin/* (service_role) não são afetadas pelo guard.

-- ---------------------------------------------------------------------------
-- 1. Allowlist do admin da plataforma
-- ---------------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins owner to postgres;

comment on table public.platform_admins is
  'Admins da PLATAFORMA (dono do SaaS). Inclusão/remoção só via service_role ou SQL direto; '
  'sem acesso para anon/authenticated. Lida pelas funções SECURITY DEFINER is_platform_admin()/is_admin().';

-- Seed: o admin da plataforma atual = role admin, sem organization_id e sem
-- nenhum vínculo em organization_members (confirmado em produção em
-- 2026-10-30: exatamente 1 usuário). Sem e-mail literal.
insert into public.platform_admins (user_id)
select us.user_id
from public.user_settings us
where us.role = 'admin'
  and us.organization_id is null
  and not exists (
    select 1 from public.organization_members om where om.user_id = us.user_id
  )
on conflict do nothing;

alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;

revoke all on public.platform_admins from public, anon, authenticated;
grant select, insert, delete on public.platform_admins to service_role;

-- Só o owner. Com FORCE RLS o owner também passa pela RLS; esta policy
-- mantém as funções SECURITY DEFINER (owner postgres) e o SQL editor
-- funcionando mesmo que o role postgres não tenha BYPASSRLS. service_role tem
-- BYPASSRLS no Supabase. Nenhuma policy para anon/authenticated.
drop policy if exists "owner manages platform_admins" on public.platform_admins;
create policy "owner manages platform_admins" on public.platform_admins
  for all to postgres
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 2. is_platform_admin() (grupo B: helper de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  );
$$;

alter function public.is_platform_admin() owner to postgres;

comment on function public.is_platform_admin() is
  'true se o usuário atual está em public.platform_admins (admin da PLATAFORMA). '
  'Admin de organização é verificado por is_org_admin(org).';

revoke execute on function public.is_platform_admin() from public, anon;
grant  execute on function public.is_platform_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. is_admin(): mesma assinatura (sem argumentos, returns boolean). CREATE OR
--    REPLACE preserva owner e ACL; SECURITY DEFINER e search_path precisam ser
--    repetidos porque o REPLACE redefine todos os atributos. Corpo idêntico ao
--    de is_platform_admin() (sem chamá-la, para o rollback poder dropá-la).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. organization_members: admin de org não altera nem apaga o próprio vínculo
--    (a policy SELECT "members can view own membership rows" fica como está).
-- ---------------------------------------------------------------------------
drop policy if exists "admins can manage membership" on public.organization_members;

drop policy if exists "org admins can insert membership" on public.organization_members;
create policy "org admins can insert membership" on public.organization_members
  for insert
  with check (public.is_org_admin(organization_id));

drop policy if exists "org admins can update other members" on public.organization_members;
create policy "org admins can update other members" on public.organization_members
  for update
  using (public.is_org_admin(organization_id) and user_id <> auth.uid())
  with check (public.is_org_admin(organization_id) and user_id <> auth.uid());

drop policy if exists "org admins can delete other members" on public.organization_members;
create policy "org admins can delete other members" on public.organization_members
  for delete
  using (public.is_org_admin(organization_id) and user_id <> auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Guard das colunas privilegiadas (grupo A: só trigger)
--
-- SECURITY INVOKER de propósito: o bypass do servidor depende de current_user,
-- e dentro de uma função SECURITY DEFINER current_user seria sempre o owner
-- (postgres). Como invoker, current_user é o role real de quem escreve
-- (authenticated / service_role / postgres). Tudo o que a função chama
-- (auth.uid(), auth.role(), is_platform_admin()) é executável por
-- authenticated e service_role; anon não executa is_platform_admin(), então
-- uma escrita anônima falha com 42501 (já seria barrada pela RLS).
--
-- Chamador privilegiado:
--   * JWT com role service_role (rotas /api/admin/* com a service key);
--   * sem JWT (auth.uid() nulo e auth.role() fora de anon/authenticated) E
--     current_user em postgres / supabase_admin / service_role (migrations,
--     SQL editor, jobs no banco);
--   * admin da plataforma (platform_admins).
-- Demais chamadores:
--   * INSERT: colunas privilegiadas forçadas ao estado de cadastro pendente
--     (organization_id continua resolvido pelo trigger set_org_id_user_settings);
--   * UPDATE: mudar role, pending_setup, approved_by, rejected, rejected_at,
--     rejected_by, user_id ou organization_id gera 42501. Num upsert
--     (INSERT ... ON CONFLICT DO UPDATE) o ramo UPDATE também passa por aqui.
--
-- Prefixo "aa_": dispara antes dos demais BEFORE do user_settings (ordem
-- alfabética): set_org_id_user_settings, trigger_new_user_webhook,
-- trigger_update_user_settings_updated_at. Revogar EXECUTE não impede o
-- disparo do trigger.
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

drop trigger if exists aa_guard_user_settings_privileged_columns on public.user_settings;
create trigger aa_guard_user_settings_privileged_columns
  before insert or update on public.user_settings
  for each row
  execute function public.guard_user_settings_privileged_columns();
