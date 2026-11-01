-- Teste de banco: escalada de privilégio em public.user_settings (Task 6b, Sprint 1).
--
-- Retorna UMA LINHA POR CENÁRIO (colunas: cenario, ok, detalhe).
--   ok = true   comportamento seguro (esperado DEPOIS da migration
--               20261030130000_guard_user_settings_privileges)
--   ok = false  falha de segurança / comportamento incorreto
--   ok = null   usuário de teste não encontrado na base (ver detalhe)
-- Esperado ANTES da migration: cenários 1, 2, 3, 4, 7, 9, 10, 11, 12, 13, 15,
-- 16 e 17 com ok=false (o 4 também falha antes: is_admin() é true para o admin de
-- organização). 5, 6, 8 e 14 são controles (ok=true antes e depois).
-- Esperado DEPOIS: todos ok=true.
--
-- Usuários de teste (lidos de public.user_settings, o mais antigo de cada perfil):
--   teste.vis       visualizador pendente     role='visualizador' and pending_setup
--   teste.op        operador sem organização  role='operador' and organization_id is null
--   teste.org_admin admin COM organização     role='admin' and organization_id is not null
--   teste.plat      admin da plataforma: se public.platform_admins existe (depois
--                   da migration), o mais antigo dela; senão role='admin',
--                   organization_id nulo e SEM linha em organization_members
--   teste.adm_vinc  admin de org com user_settings.organization_id nulo mas COM
--                   linha em organization_members (fluxo de signup/approve-user)
--
-- Isolamento: TUDO roda dentro de begin; ... rollback;. Além disso cada cenário
-- roda num sub-bloco que termina com a exceção sentinela 'teste_desfaz', o que
-- desfaz a escrita do cenário (e o SET ROLE / request.jwt.claims locais) antes
-- do próximo cenário; o resultado fica em variáveis plpgsql e é publicado em
-- GUCs teste.cN_ok / teste.cN_det, lidos no SELECT final.
-- O papel de API é simulado com set_config('role','authenticated', true)
-- (= SET LOCAL ROLE) + request.jwt.claims {sub, role:'authenticated'}.
--
-- Cenário 7 (INSERT): user_settings.user_id tem FK para auth.users, então não
-- dá para usar um uuid fictício. Escolha documentada: dentro do sub-bloco, o
-- postgres apaga a linha do visualizador pendente e o próprio usuário (como
-- authenticated) reinsere a linha com role='admin', pending_setup=false; a
-- linha resultante deve sair visualizador/pending_setup=true. A exceção
-- sentinela restaura a linha original.
-- ATENÇÃO: o INSERT dispara trigger_new_user_webhook (handle_new_user_webhook).
-- Confirmar antes que ele não faz chamada HTTP síncrona; com pg_net a chamada
-- só seria enviada no COMMIT, e este script termina em ROLLBACK.
--
-- Cenários 12 e 15 FABRICAM o perfil de ataque dentro do sub-bloco (como
-- postgres, sem JWT) a partir do operador sem organização (teste.op):
--   12: op vira operador (writer) da org de teste.org_admin e perde a própria
--       linha de user_settings; depois, como authenticated, tenta
--       update set user_id = op na linha do admin da org;
--   15: op vira role='admin', sem vínculo em organization_members e fora de
--       platform_admins; não pode ser tratado como admin da plataforma.
--   16: op fica sem vínculo; o admin de org tenta vincular op e o admin da
--       plataforma à própria org (INSERT em organization_members);
--   17: op vira membro da org do admin; o admin de org tenta reapontar o
--       user_id desse vínculo para o admin da plataforma (UPDATE).
-- Tudo é desfeito pela exceção sentinela.
--
-- Erro inesperado num cenário vira ok=false com o SQLSTATE no detalhe (o script
-- não aborta). Exceção: no cenário 4 qualquer erro significa que a escrita não
-- aconteceu, então conta como negado (ok=true).
--
-- Rodar como postgres (SQL editor / execute_sql). Não deixa nenhuma alteração.

begin;

select set_config('teste.vis', coalesce((
  select user_id::text from public.user_settings
  where role = 'visualizador' and pending_setup
  order by created_at limit 1), ''), true);
select set_config('teste.op', coalesce((
  select user_id::text from public.user_settings
  where role = 'operador' and organization_id is null
  order by created_at limit 1), ''), true);
select set_config('teste.org_admin', coalesce((
  select user_id::text from public.user_settings
  where role = 'admin' and organization_id is not null
  order by created_at limit 1), ''), true);
do $$
declare v text;
begin
  if to_regclass('public.platform_admins') is not null then
    execute $q$
      select coalesce((
        select pa.user_id::text from public.platform_admins pa
        join public.user_settings us on us.user_id = pa.user_id
        order by us.created_at limit 1), '')$q$ into v;
  else
    v := coalesce((
      select us.user_id::text from public.user_settings us
      where us.role = 'admin' and us.organization_id is null
        and not exists (select 1 from public.organization_members om where om.user_id = us.user_id)
      order by us.created_at limit 1), '');
  end if;
  perform set_config('teste.plat', v, true);
end $$;
select set_config('teste.adm_vinc', coalesce((
  select us.user_id::text from public.user_settings us
  where us.role = 'admin' and us.organization_id is null
    and exists (select 1 from public.organization_members om where om.user_id = us.user_id)
  order by us.created_at limit 1), ''), true);

-- ---------------------------------------------------------------------------
-- 1. visualizador pendente tenta virar admin na própria linha
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('teste.vis'), '')::uuid;
  v_n int; v_ok boolean; v_det text;
begin
  if v_uid is null then
    v_det := 'sem visualizador pendente na base';
  else
    begin
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      update public.user_settings set role = 'admin', pending_setup = false where user_id = v_uid;
      get diagnostics v_n = row_count;
      v_ok := (v_n = 0);
      v_det := format('update aceito: %s linha(s) alterada(s)', v_n);
      raise exception 'teste_desfaz';
    exception
      when insufficient_privilege then
        v_ok := true; v_det := 'negado (42501): ' || sqlerrm;
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c1_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c1_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 2. operador sem organização tenta virar admin na própria linha
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('teste.op'), '')::uuid;
  v_n int; v_ok boolean; v_det text;
begin
  if v_uid is null then
    v_det := 'sem operador sem organização na base';
  else
    begin
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      update public.user_settings set role = 'admin' where user_id = v_uid;
      get diagnostics v_n = row_count;
      v_ok := (v_n = 0);
      v_det := format('update aceito: %s linha(s) alterada(s)', v_n);
      raise exception 'teste_desfaz';
    exception
      when insufficient_privilege then
        v_ok := true; v_det := 'negado (42501): ' || sqlerrm;
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c2_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c2_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 3. admin COM organização não vê user_settings de outra org / sem org
--    (fora a própria linha)
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('teste.org_admin'), '')::uuid;
  v_org uuid;
  v_total int; v_fora int; v_ok boolean; v_det text;
begin
  if v_uid is null then
    v_det := 'sem admin com organização na base';
  else
    select organization_id into v_org from public.user_settings where user_id = v_uid;
    begin
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      select count(*),
             count(*) filter (where user_id <> v_uid and organization_id is distinct from v_org)
        into v_total, v_fora
        from public.user_settings;
      v_ok := (v_fora = 0);
      v_det := format('visíveis: %s; fora da própria org (excluindo a própria linha): %s', v_total, v_fora);
      raise exception 'teste_desfaz';
    exception
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c3_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c3_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 4. admin COM organização tenta alterar role do operador sem organização
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('teste.org_admin'), '')::uuid;
  v_alvo uuid := nullif(current_setting('teste.op'), '')::uuid;
  v_n int; v_ok boolean; v_det text;
begin
  if v_uid is null or v_alvo is null then
    v_det := 'sem admin com organização ou sem operador sem organização na base';
  else
    begin
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      update public.user_settings set role = 'visualizador' where user_id = v_alvo;
      get diagnostics v_n = row_count;
      v_ok := (v_n = 0);
      v_det := format('%s linha(s) alterada(s)', v_n);
      raise exception 'teste_desfaz';
    exception
      when insufficient_privilege then
        v_ok := true; v_det := 'negado (42501): ' || sqlerrm;
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := true; v_det := 'negado por erro P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := true; v_det := 'negado por erro ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c4_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c4_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 5. admin da plataforma altera role de outro usuário (operador sem org)
--    -> permitido (tela de gestão de roles, client da sessão)
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('teste.plat'), '')::uuid;
  v_alvo uuid := nullif(current_setting('teste.op'), '')::uuid;
  v_n int; v_ok boolean; v_det text;
begin
  if v_uid is null or v_alvo is null then
    v_det := 'sem admin da plataforma ou sem operador sem organização na base';
  else
    begin
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      update public.user_settings set role = 'visualizador' where user_id = v_alvo;
      get diagnostics v_n = row_count;
      v_ok := (v_n = 1);
      v_det := format('%s linha(s) alterada(s)', v_n);
      raise exception 'teste_desfaz';
    exception
      when insufficient_privilege then
        v_ok := false; v_det := 'negado (42501): ' || sqlerrm;
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c5_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c5_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 6. usuário comum (operador sem org) altera campo não sensível da própria linha
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('teste.op'), '')::uuid;
  v_n int; v_ok boolean; v_det text;
begin
  if v_uid is null then
    v_det := 'sem operador sem organização na base';
  else
    begin
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      update public.user_settings
         set company_name = company_name, updated_at = now()
       where user_id = v_uid;
      get diagnostics v_n = row_count;
      v_ok := (v_n = 1);
      v_det := format('%s linha(s) alterada(s)', v_n);
      raise exception 'teste_desfaz';
    exception
      when insufficient_privilege then
        v_ok := false; v_det := 'negado (42501): ' || sqlerrm;
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c6_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c6_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 7. INSERT da própria linha já com role='admin' (visualizador pendente,
--    linha apagada e reinserida dentro do sub-bloco; ver cabeçalho)
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('teste.vis'), '')::uuid;
  v_role text; v_pending boolean; v_ok boolean; v_det text;
begin
  if v_uid is null then
    v_det := 'sem visualizador pendente na base';
  else
    begin
      delete from public.user_settings where user_id = v_uid;  -- como postgres
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      insert into public.user_settings (user_id, role, pending_setup)
      values (v_uid, 'admin', false)
      returning role::text, pending_setup into v_role, v_pending;
      v_ok := (v_role = 'visualizador' and v_pending);
      v_det := format('linha inserida com role=%s, pending_setup=%s', v_role, v_pending);
      raise exception 'teste_desfaz';
    exception
      when insufficient_privilege then
        v_ok := true; v_det := 'insert negado (42501): ' || sqlerrm;
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c7_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c7_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 8. (controle) service_role aprova usuário pendente (rota /api/admin/approve-user)
--    -> continua permitido
-- ---------------------------------------------------------------------------
do $$
declare
  v_alvo uuid := nullif(current_setting('teste.vis'), '')::uuid;
  v_n int; v_ok boolean; v_det text;
begin
  if v_alvo is null then
    v_det := 'sem visualizador pendente na base';
  else
    begin
      perform set_config('role', 'service_role', true);
      perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
      update public.user_settings
         set role = 'operador', pending_setup = false, rejected = false,
             rejected_at = null, rejected_by = null
       where user_id = v_alvo;
      get diagnostics v_n = row_count;
      v_ok := (v_n = 1);
      v_det := format('%s linha(s) alterada(s)', v_n);
      raise exception 'teste_desfaz';
    exception
      when insufficient_privilege then
        v_ok := false; v_det := 'negado (42501): ' || sqlerrm;
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c8_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c8_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 9. admin com user_settings.organization_id nulo mas COM vínculo em
--    organization_members NÃO é admin da plataforma: não vê user_settings de
--    outras orgs / sem org (fora a própria linha)
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('teste.adm_vinc'), '')::uuid;
  v_org uuid;
  v_total int; v_fora int; v_ok boolean; v_det text;
begin
  if v_uid is null then
    v_det := 'sem admin com organization_id nulo e vínculo em organization_members na base';
  else
    select organization_id into v_org from public.organization_members where user_id = v_uid limit 1;
    begin
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      select count(*),
             count(*) filter (where user_id <> v_uid and organization_id is distinct from v_org)
        into v_total, v_fora
        from public.user_settings;
      v_ok := (v_fora = 0);
      v_det := format('visíveis: %s; fora da org do vínculo (excluindo a própria linha): %s', v_total, v_fora);
      raise exception 'teste_desfaz';
    exception
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c9_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c9_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 10. o mesmo usuário do cenário 9 tenta alterar role do operador sem org
--     -> 0 linhas ou negado (qualquer erro = escrita não aconteceu)
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('teste.adm_vinc'), '')::uuid;
  v_alvo uuid := nullif(current_setting('teste.op'), '')::uuid;
  v_n int; v_ok boolean; v_det text;
begin
  if v_uid is null or v_alvo is null then
    v_det := 'sem admin com vínculo e organization_id nulo ou sem operador sem organização na base';
  else
    begin
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      update public.user_settings set role = 'visualizador' where user_id = v_alvo;
      get diagnostics v_n = row_count;
      v_ok := (v_n = 0);
      v_det := format('%s linha(s) alterada(s)', v_n);
      raise exception 'teste_desfaz';
    exception
      when insufficient_privilege then
        v_ok := true; v_det := 'negado (42501): ' || sqlerrm;
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := true; v_det := 'negado por erro P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := true; v_det := 'negado por erro ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c10_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c10_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 11. admin de org tenta apagar o PRÓPRIO vínculo em organization_members
--     (para virar "sem org") -> 0 linhas/negado e continua sem ver outras orgs.
--     Usa teste.adm_vinc (org nula em user_settings) se existir, senão
--     teste.org_admin.
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := coalesce(nullif(current_setting('teste.adm_vinc'), '')::uuid,
                         nullif(current_setting('teste.org_admin'), '')::uuid);
  v_org uuid;
  v_n int; v_fora int; v_ok boolean; v_det text;
begin
  if v_uid is null then
    v_det := 'sem admin de organização na base';
  else
    select organization_id into v_org from public.organization_members where user_id = v_uid limit 1;
    begin
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      delete from public.organization_members where user_id = v_uid;
      get diagnostics v_n = row_count;
      select count(*) filter (where user_id <> v_uid and organization_id is distinct from v_org)
        into v_fora from public.user_settings;
      v_ok := (v_n = 0 and v_fora = 0);
      v_det := format('vínculos apagados: %s; user_settings visíveis fora da org (excluindo a própria): %s', v_n, v_fora);
      raise exception 'teste_desfaz';
    exception
      when insufficient_privilege then
        v_ok := true; v_det := 'negado (42501): ' || sqlerrm;
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c11_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c11_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 12. writer da org reatribui user_id da linha do admin da mesma org
--     (perfil fabricado a partir de teste.op; ver cabeçalho) -> negado
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('teste.op'), '')::uuid;
  v_admin uuid := nullif(current_setting('teste.org_admin'), '')::uuid;
  v_org uuid;
  v_n int; v_ok boolean; v_det text;
begin
  if v_uid is null or v_admin is null then
    v_det := 'sem operador sem organização ou sem admin com organização na base';
  else
    select organization_id into v_org from public.user_settings where user_id = v_admin;
    begin
      -- montagem do perfil (postgres, sem JWT)
      delete from public.organization_members where user_id = v_uid;
      insert into public.organization_members (organization_id, user_id, role)
      values (v_org, v_uid, 'operador');
      delete from public.user_settings where user_id = v_uid;
      -- ataque
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      update public.user_settings set user_id = v_uid where user_id = v_admin;
      get diagnostics v_n = row_count;
      v_ok := (v_n = 0);
      v_det := format('%s linha(s) do admin reatribuída(s) ao writer', v_n);
      raise exception 'teste_desfaz';
    exception
      when insufficient_privilege then
        v_ok := true; v_det := 'negado (42501): ' || sqlerrm;
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c12_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c12_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 13. upsert do usuário comum: insert ... on conflict (user_id) do update
--     set role = 'admin' na própria linha -> negado ou role não vira admin
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('teste.op'), '')::uuid;
  v_role text; v_ok boolean; v_det text;
begin
  if v_uid is null then
    v_det := 'sem operador sem organização na base';
  else
    begin
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      insert into public.user_settings (user_id, role, pending_setup)
      values (v_uid, 'admin', false)
      on conflict (user_id) do update set role = 'admin', pending_setup = false;
      select role::text into v_role from public.user_settings where user_id = v_uid;
      v_ok := (v_role is distinct from 'admin');
      v_det := format('upsert aceito; role resultante=%s', v_role);
      raise exception 'teste_desfaz';
    exception
      when insufficient_privilege then
        v_ok := true; v_det := 'negado (42501): ' || sqlerrm;
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c13_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c13_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 14. (controle) admin da plataforma (platform_admins depois da migration)
--     altera role do visualizador pendente -> permitido
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('teste.plat'), '')::uuid;
  v_alvo uuid := nullif(current_setting('teste.vis'), '')::uuid;
  v_n int; v_ok boolean; v_det text;
begin
  if v_uid is null or v_alvo is null then
    v_det := 'sem admin da plataforma ou sem visualizador pendente na base';
  else
    begin
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      update public.user_settings set role = 'operador' where user_id = v_alvo;
      get diagnostics v_n = row_count;
      v_ok := (v_n = 1);
      v_det := format('%s linha(s) alterada(s)', v_n);
      raise exception 'teste_desfaz';
    exception
      when insufficient_privilege then
        v_ok := false; v_det := 'negado (42501): ' || sqlerrm;
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c14_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c14_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 15. role='admin', organization_id nulo, SEM vínculo e FORA de
--     platform_admins (perfil fabricado a partir de teste.op) NÃO é admin da
--     plataforma: não vê outras linhas nem altera role de outro usuário
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := nullif(current_setting('teste.op'), '')::uuid;
  v_alvo uuid := nullif(current_setting('teste.vis'), '')::uuid;
  v_fora int; v_n int; v_ok boolean; v_det text;
begin
  if v_uid is null or v_alvo is null then
    v_det := 'sem operador sem organização ou sem visualizador pendente na base';
  else
    begin
      -- montagem do perfil (postgres, sem JWT)
      update public.user_settings set role = 'admin', organization_id = null where user_id = v_uid;
      delete from public.organization_members where user_id = v_uid;
      if to_regclass('public.platform_admins') is not null then
        execute 'delete from public.platform_admins where user_id = $1' using v_uid;
      end if;
      -- ataque
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      select count(*) filter (where user_id <> v_uid) into v_fora from public.user_settings;
      update public.user_settings set role = 'operador' where user_id = v_alvo;
      get diagnostics v_n = row_count;
      v_ok := (v_fora = 0 and v_n = 0);
      v_det := format('linhas de outros visíveis: %s; role de outro alterado: %s linha(s)', v_fora, v_n);
      raise exception 'teste_desfaz';
    exception
      when insufficient_privilege then
        v_ok := false; v_det := 'erro 42501 inesperado: ' || sqlerrm;
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c15_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c15_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 16. admin de org tenta vincular à própria org o admin da plataforma e o
--     operador sem org (INSERT em organization_members) -> negado
--     Admin de org = teste.org_admin, senão teste.adm_vinc.
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := coalesce(nullif(current_setting('teste.org_admin'), '')::uuid,
                         nullif(current_setting('teste.adm_vinc'), '')::uuid);
  v_plat uuid := nullif(current_setting('teste.plat'), '')::uuid;
  v_op uuid := nullif(current_setting('teste.op'), '')::uuid;
  v_org uuid;
  v_alvo uuid;
  v_ok_alvos int := 0; v_tent int := 0;
  v_ok boolean; v_det text := '';
begin
  if v_uid is null or (v_plat is null and v_op is null) then
    v_det := 'sem admin de organização ou sem alvos (admin da plataforma / operador sem org) na base';
  else
    select organization_id into v_org from public.organization_members
      where user_id = v_uid and role = 'admin' limit 1;
    begin
      -- montagem: op sem vínculo (postgres, sem JWT)
      if v_op is not null then
        delete from public.organization_members where user_id = v_op;
      end if;
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      foreach v_alvo in array array_remove(array[v_plat, v_op], null) loop
        v_tent := v_tent + 1;
        begin
          insert into public.organization_members (organization_id, user_id, role)
          values (v_org, v_alvo, 'operador');
          v_det := v_det || format('[%s vinculado] ', v_alvo);
        exception
          when insufficient_privilege then
            v_ok_alvos := v_ok_alvos + 1;
            v_det := v_det || format('[%s negado 42501: %s] ', v_alvo, sqlerrm);
          when others then
            v_det := v_det || format('[%s erro %s: %s] ', v_alvo, sqlstate, sqlerrm);
        end;
      end loop;
      v_ok := (v_ok_alvos = v_tent);
      raise exception 'teste_desfaz';
    exception
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c16_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c16_det', v_det, true);
end $$;

-- ---------------------------------------------------------------------------
-- 17. admin de org reaponta user_id de um vínculo da própria org para o
--     admin da plataforma (UPDATE em organization_members) -> negado
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid := coalesce(nullif(current_setting('teste.org_admin'), '')::uuid,
                         nullif(current_setting('teste.adm_vinc'), '')::uuid);
  v_plat uuid := nullif(current_setting('teste.plat'), '')::uuid;
  v_op uuid := nullif(current_setting('teste.op'), '')::uuid;
  v_org uuid;
  v_n int; v_ok boolean; v_det text;
begin
  if v_uid is null or v_plat is null or v_op is null then
    v_det := 'sem admin de organização, admin da plataforma ou operador sem org na base';
  else
    select organization_id into v_org from public.organization_members
      where user_id = v_uid and role = 'admin' limit 1;
    begin
      -- montagem: op vira membro da org do admin (postgres, sem JWT)
      delete from public.organization_members where user_id in (v_op, v_plat);
      insert into public.organization_members (organization_id, user_id, role)
      values (v_org, v_op, 'operador');
      -- ataque
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      update public.organization_members set user_id = v_plat
       where user_id = v_op and organization_id = v_org;
      get diagnostics v_n = row_count;
      v_ok := (v_n = 0);
      v_det := format('%s vínculo(s) reapontado(s) para o admin da plataforma', v_n);
      raise exception 'teste_desfaz';
    exception
      when insufficient_privilege then
        v_ok := true; v_det := 'negado (42501): ' || sqlerrm;
      when raise_exception then
        if sqlerrm <> 'teste_desfaz' then
          v_ok := false; v_det := 'erro inesperado P0001: ' || sqlerrm;
        end if;
      when others then
        v_ok := false; v_det := 'erro inesperado ' || sqlstate || ': ' || sqlerrm;
    end;
  end if;
  perform set_config('teste.c17_ok', coalesce(v_ok::text, ''), true);
  perform set_config('teste.c17_det', v_det, true);
end $$;

select r.cenario,
       nullif(current_setting('teste.c' || r.n || '_ok'), '')::boolean as ok,
       current_setting('teste.c' || r.n || '_det') as detalhe
from (values
  (1, '1. visualizador pendente vira admin na própria linha -> negado'),
  (2, '2. operador sem org vira admin na própria linha -> negado'),
  (3, '3. admin com org não vê user_settings de outra org/sem org'),
  (4, '4. admin com org altera role de operador sem org -> 0 linhas/negado'),
  (5, '5. admin da plataforma altera role de outro usuário -> permitido'),
  (6, '6. usuário comum altera campo não sensível próprio -> permitido'),
  (7, '7. INSERT próprio com role=admin -> sai visualizador/pendente'),
  (8, '8. (controle) service_role aprova usuário -> permitido'),
  (9, '9. admin com org_id nulo mas com vínculo não vê outras orgs'),
  (10, '10. admin com org_id nulo mas com vínculo altera role de outro -> 0 linhas/negado'),
  (11, '11. admin de org apaga o próprio vínculo -> negado e continua sem ver outras orgs'),
  (12, '12. writer reatribui user_id da linha do admin da mesma org -> negado'),
  (13, '13. upsert on conflict do update set role=admin por usuário comum -> negado'),
  (14, '14. (controle) admin da plataforma (allowlist) altera role de outro -> permitido'),
  (15, '15. admin sem org/vínculo fora da allowlist não é admin da plataforma'),
  (16, '16. admin de org vincula admin da plataforma / operador sem org à própria org -> negado'),
  (17, '17. admin de org reaponta user_id de vínculo da própria org -> negado')
) as r(n, cenario)
order by r.n;

rollback;
