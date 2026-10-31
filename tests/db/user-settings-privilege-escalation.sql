-- Teste de banco: escalada de privilégio em public.user_settings (Task 6b, Sprint 1).
--
-- Retorna UMA LINHA POR CENÁRIO (colunas: cenario, ok, detalhe).
--   ok = true   comportamento seguro (esperado DEPOIS da migration
--               20261030130000_guard_user_settings_privileges)
--   ok = false  falha de segurança / comportamento incorreto
--   ok = null   usuário de teste não encontrado na base (ver detalhe)
-- Esperado ANTES da migration: cenários 1, 2, 3, 4 e 7 com ok=false
-- (o 4 também falha antes: is_admin() é true para o admin de organização).
-- Esperado DEPOIS: todos ok=true.
--
-- Usuários de teste (lidos de public.user_settings, o mais antigo de cada perfil):
--   teste.vis       visualizador pendente     role='visualizador' and pending_setup
--   teste.op        operador sem organização  role='operador' and organization_id is null
--   teste.org_admin admin COM organização     role='admin' and organization_id is not null
--   teste.plat      admin da plataforma       role='admin' and organization_id is null
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
select set_config('teste.plat', coalesce((
  select user_id::text from public.user_settings
  where role = 'admin' and organization_id is null
  order by created_at limit 1), ''), true);

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
  (8, '8. (controle) service_role aprova usuário -> permitido')
) as r(n, cenario)
order by r.n;

rollback;
