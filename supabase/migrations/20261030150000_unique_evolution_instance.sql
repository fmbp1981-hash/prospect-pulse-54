-- 20261030150000_unique_evolution_instance.sql
-- Sprint 1 (segurança), Task 9: isolamento entre tenants.
--   F-04 (High): evolution_instance_name era editável pelo próprio usuário e sem
--                unicidade. Como o envio usa a EVOLUTION_API_KEY global (vale para
--                qualquer instância), quem gravasse o nome da instância de outra
--                organização enviava WhatsApp pelo número dela, e a resolução de
--                tenant por instância (get_user_by_evolution_instance) ficava ambígua.
--   M-01 (revisão da Task 8): a policy SELECT "org members can view user_settings"
--                expunha a membros da mesma organização as chaves de API, o
--                webhook_token e os demais segredos da linha de cada colega.
--   T9-M1 (revisão da Task 9): as policies permissivas "org writers can
--                update/delete/insert user_settings" deixavam um writer da org
--                alterar ou apagar a linha de um colega.
--
-- Depende de 20261030140000_webhook_tokens (guard com webhook_token): rodar DEPOIS.
-- Rollback: supabase/migrations/rollback/20261030150000_unique_evolution_instance.down.sql
-- Testes:   tests/db/evolution-instance-isolation.sql (todos ok=true depois)
--
-- Comportamento:
--   * Índice único parcial em user_settings(btrim(evolution_instance_name)),
--     ignorando NULL e vazio/só espaços ('inst' e ' inst ' são a mesma instância,
--     como em resolveInstanceForUser, que faz trim). Antes de criar, aborta com
--     mensagem clara se houver duplicata (também comparando com btrim).
--   * Guard (trigger BEFORE INSERT OR UPDATE): evolution_instance_name entra na
--     lista de colunas protegidas. Usuário comum (inclusive admin de organização):
--     INSERT → coluna forçada a NULL; UPDATE que muda o valor → 42501. Quem define
--     a instância: admin da plataforma (Configurações → Usuários) ou o servidor.
--     Corpo = 20261030140000 + apenas evolution_instance_name.
--   * drop da policy "org members can view user_settings": cada usuário lê só a
--     própria linha (policy "Users can view own settings or admins see all";
--     admin da plataforma continua vendo todas via is_admin()). As rotas de
--     servidor usam service_role e não dependem dessa policy. Mapeamento feito no
--     código (git grep "from('user_settings')"): todas as leituras pelo client da
--     sessão filtram .eq('user_id', user.id), exceto RoleManagement, que é do admin
--     da plataforma.
--   * drop das policies permissivas "org writers can update user_settings",
--     "org writers can delete user_settings" e "org writers can insert
--     user_settings" (T9-M1): escrita só na própria linha (policies "Users can
--     insert own settings" / "Users can update own settings or admins update all")
--     ou pelo admin da plataforma. As policies RESTRICTIVE "org role gate ..."
--     continuam.

-- ---------------------------------------------------------------------------
-- 1. Unicidade de evolution_instance_name (F-04)
-- ---------------------------------------------------------------------------
do $$
declare
  v_dups text;
begin
  select string_agg(format('%L (%s linhas)', instancia, n), ', ')
    into v_dups
  from (
    select btrim(evolution_instance_name) as instancia, count(*) as n
    from public.user_settings
    where evolution_instance_name is not null and btrim(evolution_instance_name) <> ''
    group by btrim(evolution_instance_name)
    having count(*) > 1
  ) d;

  if v_dups is not null then
    raise exception 'evolution_instance_name duplicado em user_settings: %', v_dups
      using hint = 'Resolva as duplicatas (deixe o nome só no tenant dono da instância) antes de aplicar esta migration.';
  end if;
end $$;

create unique index if not exists user_settings_evolution_instance_name_key
  on public.user_settings (btrim(evolution_instance_name))
  where evolution_instance_name is not null and btrim(evolution_instance_name) <> '';

comment on index public.user_settings_evolution_instance_name_key is
  'Uma instância Evolution pertence a um único tenant (F-04), comparando com btrim. NULL e vazio não contam.';

-- ---------------------------------------------------------------------------
-- 2. Guard: corpo de 20261030140000 + evolution_instance_name
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
    -- Instância Evolution (Task 9, F-04): definida só pelo admin da plataforma/servidor.
    new.evolution_instance_name := null;
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
     or new.evolution_instance_name is distinct from old.evolution_instance_name
  then
    raise exception 'Alteração de campo privilegiado não permitida'
      using errcode = '42501',
            hint = 'role, pending_setup, approved_by, rejected*, user_id, organization_id, webhook_token e evolution_instance_name só podem ser alterados pelo admin da plataforma ou pelo servidor.';
  end if;

  return new;
end;
$$;

alter function public.guard_user_settings_privileged_columns() owner to postgres;

comment on function public.guard_user_settings_privileged_columns() is
  'Trigger BEFORE INSERT OR UPDATE em user_settings: impede que usuário comum (inclusive admin de '
  'organização) defina role, pending_setup, approved_by, rejected*, user_id, organization_id, webhook_token '
  'ou evolution_instance_name (no INSERT o webhook_token é sempre gerado pelo trigger e '
  'evolution_instance_name vira NULL). '
  'Liberado para service_role, conexão sem JWT como postgres/supabase_admin/service_role e admin da plataforma.';

revoke execute on function public.guard_user_settings_privileged_columns() from public, anon, authenticated;
grant  execute on function public.guard_user_settings_privileged_columns() to service_role;

-- ---------------------------------------------------------------------------
-- 3. M-01: membros da mesma organização deixam de ler a linha (e os segredos)
--    uns dos outros.
-- ---------------------------------------------------------------------------
drop policy if exists "org members can view user_settings" on public.user_settings;

-- ---------------------------------------------------------------------------
-- 4. T9-M1: writer da organização deixa de inserir/alterar/apagar a linha de
--    um colega. Ficam as policies da própria linha e as RESTRICTIVE
--    "org role gate ..." (visualizador continua sem escrita).
-- ---------------------------------------------------------------------------
drop policy if exists "org writers can update user_settings" on public.user_settings;
drop policy if exists "org writers can delete user_settings" on public.user_settings;
drop policy if exists "org writers can insert user_settings" on public.user_settings;
