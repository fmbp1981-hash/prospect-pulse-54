-- Teste de banco: token do webhook do WhatsApp (Task 8, Sprint 1, achado F-02).
--
-- Retorna UMA LINHA POR CENÁRIO (colunas: cenario, ok, detalhe).
--   ok = true   comportamento esperado DEPOIS de 20261030140000_webhook_tokens
--   ok = false  falha
--   ok = null   usuário de teste não encontrado (ver detalhe)
-- Antes da migration a coluna não existe: rodar só depois.
--
-- Usuários de teste (o mais antigo de cada perfil em public.user_settings):
--   teste.op        operador sem organização  role='operador' and organization_id is null
--   teste.org_admin admin COM organização     role='admin' and organization_id is not null
--   teste.membro    outro usuário da mesma organização do teste.org_admin
--
-- Isolamento: tudo dentro de begin; ... rollback;. Cada cenário roda num
-- sub-bloco encerrado pela exceção sentinela 'teste_desfaz', que desfaz a
-- escrita e o SET ROLE / request.jwt.claims locais. Resultados vão para GUCs
-- teste.wN_ok / teste.wN_det, lidos no SELECT final.
-- O INSERT do cenário 4 dispara trigger_new_user_webhook (mesma ressalva do
-- teste da Task 6b: confirmar que não faz HTTP síncrono).
--
-- Rodar como postgres (SQL editor / execute_sql). Não deixa nenhuma alteração.

begin;

select set_config('teste.op', coalesce((
  select user_id::text from public.user_settings
  where role = 'operador' and organization_id is null
  order by created_at limit 1), ''), true);
select set_config('teste.org_admin', coalesce((
  select user_id::text from public.user_settings
  where role = 'admin' and organization_id is not null
  order by created_at limit 1), ''), true);
select set_config('teste.membro', coalesce((
  select us.user_id::text from public.user_settings us
  where us.organization_id = (select organization_id from public.user_settings
                              where user_id::text = current_setting('teste.org_admin'))
    and us.user_id::text <> current_setting('teste.org_admin')
  order by us.created_at limit 1), ''), true);

do $$
declare
  v_ok boolean;
  v_det text;
  v_uid uuid;
  v_alvo uuid;
  v_tok text;
  v_novo text;
  v_rows int;
  v_total int;
  v_distintos int;
  v_formato int;
  c_tok constant text := repeat('ab', 32);
begin
  -- 1. Backfill: todas as linhas com token único, não nulo, no formato.
  select count(*), count(distinct webhook_token),
         count(*) filter (where webhook_token ~ '^[0-9a-f]{64}$')
    into v_total, v_distintos, v_formato
  from public.user_settings;
  perform set_config('teste.w1_ok', (v_total = v_distintos and v_total = v_formato)::text, true);
  perform set_config('teste.w1_det',
    format('linhas=%s distintos=%s formato_ok=%s', v_total, v_distintos, v_formato), true);

  -- 2. Usuário comum altera o PRÓPRIO token → 42501.
  v_uid := nullif(current_setting('teste.op'), '')::uuid;
  if v_uid is null then
    perform set_config('teste.w2_ok', '', true);
    perform set_config('teste.w2_det', 'sem operador sem organização', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        update public.user_settings set webhook_token = c_tok where user_id = v_uid;
        get diagnostics v_rows = row_count;
        v_ok := false; v_det := format('UPDATE aceito (%s linha)', v_rows);
      exception
        when insufficient_privilege then v_ok := true; v_det := '42501';
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.w2_ok', v_ok::text, true);
    perform set_config('teste.w2_det', v_det, true);
  end if;

  -- 3. Admin de organização altera o token de outro membro da org → negado.
  v_uid := nullif(current_setting('teste.org_admin'), '')::uuid;
  v_alvo := nullif(current_setting('teste.membro'), '')::uuid;
  if v_uid is null or v_alvo is null then
    perform set_config('teste.w3_ok', '', true);
    perform set_config('teste.w3_det', 'sem admin de org com outro membro', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        update public.user_settings set webhook_token = c_tok where user_id = v_alvo;
        get diagnostics v_rows = row_count;
        v_ok := (v_rows = 0); v_det := format('%s linha(s) alterada(s)', v_rows);
      exception
        when insufficient_privilege then v_ok := true; v_det := '42501';
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.w3_ok', v_ok::text, true);
    perform set_config('teste.w3_det', v_det, true);
  end if;

  -- 4. INSERT pelo próprio usuário com token escolhido → token descartado e gerado.
  v_uid := nullif(current_setting('teste.op'), '')::uuid;
  if v_uid is null then
    perform set_config('teste.w4_ok', '', true);
    perform set_config('teste.w4_det', 'sem operador sem organização', true);
  else
    begin
      delete from public.user_settings where user_id = v_uid;
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        insert into public.user_settings (user_id, webhook_token) values (v_uid, c_tok);
        perform set_config('role', 'postgres', true);
        select webhook_token into v_tok from public.user_settings where user_id = v_uid;
        v_ok := v_tok is distinct from c_tok and v_tok ~ '^[0-9a-f]{64}$';
        v_det := case when v_tok = c_tok then 'token do client aceito' else 'token gerado no servidor' end;
      exception
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.w4_ok', v_ok::text, true);
    perform set_config('teste.w4_det', v_det, true);
  end if;

  -- 5. Upsert ON CONFLICT DO UPDATE SET webhook_token → 42501.
  v_uid := nullif(current_setting('teste.op'), '')::uuid;
  if v_uid is null then
    perform set_config('teste.w5_ok', '', true);
    perform set_config('teste.w5_det', 'sem operador sem organização', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        insert into public.user_settings (user_id, webhook_token) values (v_uid, c_tok)
          on conflict (user_id) do update set webhook_token = c_tok;
        v_ok := false; v_det := 'upsert aceito';
      exception
        when insufficient_privilege then v_ok := true; v_det := '42501';
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.w5_ok', v_ok::text, true);
    perform set_config('teste.w5_det', v_det, true);
  end if;

  -- 6. Controle: usuário comum altera company_name; token intacto.
  v_uid := nullif(current_setting('teste.op'), '')::uuid;
  if v_uid is null then
    perform set_config('teste.w6_ok', '', true);
    perform set_config('teste.w6_det', 'sem operador sem organização', true);
  else
    select webhook_token into v_tok from public.user_settings where user_id = v_uid;
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        update public.user_settings set company_name = 'teste-w6' where user_id = v_uid;
        get diagnostics v_rows = row_count;
        perform set_config('role', 'postgres', true);
        select webhook_token into v_novo from public.user_settings where user_id = v_uid;
        v_ok := v_rows = 1 and v_novo = v_tok;
        v_det := format('%s linha, token %s', v_rows, case when v_novo = v_tok then 'intacto' else 'MUDOU' end);
      exception
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.w6_ok', v_ok::text, true);
    perform set_config('teste.w6_det', v_det, true);
  end if;

  -- 7. Controle: servidor (JWT service_role) rotaciona o token.
  v_uid := nullif(current_setting('teste.op'), '')::uuid;
  if v_uid is null then
    perform set_config('teste.w7_ok', '', true);
    perform set_config('teste.w7_det', 'sem operador sem organização', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        perform set_config('role', 'service_role', true);
        update public.user_settings set webhook_token = c_tok where user_id = v_uid;
        get diagnostics v_rows = row_count;
        v_ok := v_rows = 1; v_det := format('%s linha rotacionada', v_rows);
      exception
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.w7_ok', v_ok::text, true);
    perform set_config('teste.w7_det', v_det, true);
  end if;

  -- 8. Token fora do formato é rejeitado pelo CHECK (mesmo para o servidor).
  v_uid := nullif(current_setting('teste.op'), '')::uuid;
  if v_uid is null then
    perform set_config('teste.w8_ok', '', true);
    perform set_config('teste.w8_det', 'sem operador sem organização', true);
  else
    begin
      begin
        update public.user_settings set webhook_token = 'curto' where user_id = v_uid;
        v_ok := false; v_det := 'token malformado aceito';
      exception
        when check_violation then v_ok := true; v_det := '23514';
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.w8_ok', v_ok::text, true);
    perform set_config('teste.w8_det', v_det, true);
  end if;
end $$;

select c.cenario,
       nullif(current_setting('teste.w' || c.n || '_ok', true), '')::boolean as ok,
       current_setting('teste.w' || c.n || '_det', true) as detalhe
from (values
  (1, '1. backfill: token único, não nulo, 64 hex'),
  (2, '2. usuário altera o próprio token → 42501'),
  (3, '3. admin de org altera token de membro → negado'),
  (4, '4. INSERT com token do client → descartado'),
  (5, '5. upsert set webhook_token → 42501'),
  (6, '6. controle: update comum mantém token'),
  (7, '7. controle: service_role rotaciona'),
  (8, '8. CHECK de formato')
) as c(n, cenario)
order by c.n;

rollback;
