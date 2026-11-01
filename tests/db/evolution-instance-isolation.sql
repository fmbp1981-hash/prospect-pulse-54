-- Teste de banco: instância Evolution única e protegida + leitura e escrita de
-- user_settings só da própria linha (Task 9, Sprint 1; achados F-04, M-01,
-- T9-M1 e T9-L2).
--
-- Retorna UMA LINHA POR CENÁRIO (colunas: cenario, ok, detalhe).
--   ok = true   comportamento esperado DEPOIS de 20261030150000_unique_evolution_instance
--   ok = false  falha (antes da migration, os cenários 1, 2, 3, 5, 7, 10, 11 e 12 dão false)
--   ok = null   usuário de teste não encontrado (ver detalhe)
--
-- Usuários de teste (o mais antigo de cada perfil em public.user_settings):
--   teste.op        operador sem organização  role='operador' and organization_id is null
--   teste.org_admin admin COM organização     role='admin' and organization_id is not null
--   teste.membro    outro usuário da mesma organização do teste.org_admin
--   teste.plat      admin da plataforma (public.platform_admins)
--
-- Isolamento: tudo dentro de begin; ... rollback;. Cada cenário roda num
-- sub-bloco encerrado pela exceção sentinela 'teste_desfaz', que desfaz a
-- escrita e o SET ROLE / request.jwt.claims locais. Resultados vão para GUCs
-- teste.eN_ok / teste.eN_det, lidos no SELECT final.
-- O INSERT do cenário 3 dispara trigger_new_user_webhook (mesma ressalva dos
-- testes das Tasks 6b/8: confirmar que não faz HTTP síncrono).
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
select set_config('teste.plat', coalesce((
  select user_id::text from public.platform_admins order by created_at limit 1), ''), true);

do $$
declare
  v_ok boolean;
  v_det text;
  v_uid uuid;
  v_alvo uuid;
  v_inst text;
  v_rows int;
  v_n int;
  c_inst constant text := 'teste-instancia-e-' || md5(random()::text);
begin
  -- 1. Usuário comum altera a PRÓPRIA evolution_instance_name → 42501.
  v_uid := nullif(current_setting('teste.op'), '')::uuid;
  if v_uid is null then
    perform set_config('teste.e1_ok', '', true);
    perform set_config('teste.e1_det', 'sem operador sem organização', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        update public.user_settings set evolution_instance_name = c_inst where user_id = v_uid;
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
    perform set_config('teste.e1_ok', v_ok::text, true);
    perform set_config('teste.e1_det', v_det, true);
  end if;

  -- 2. Admin de organização altera a instância de outro membro da org → negado.
  v_uid := nullif(current_setting('teste.org_admin'), '')::uuid;
  v_alvo := nullif(current_setting('teste.membro'), '')::uuid;
  if v_uid is null or v_alvo is null then
    perform set_config('teste.e2_ok', '', true);
    perform set_config('teste.e2_det', 'sem admin de org com outro membro', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        update public.user_settings set evolution_instance_name = c_inst where user_id = v_alvo;
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
    perform set_config('teste.e2_ok', v_ok::text, true);
    perform set_config('teste.e2_det', v_det, true);
  end if;

  -- 3. INSERT pelo próprio usuário com instância escolhida → gravada como NULL.
  v_uid := nullif(current_setting('teste.op'), '')::uuid;
  if v_uid is null then
    perform set_config('teste.e3_ok', '', true);
    perform set_config('teste.e3_det', 'sem operador sem organização', true);
  else
    begin
      delete from public.user_settings where user_id = v_uid;
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        insert into public.user_settings (user_id, evolution_instance_name) values (v_uid, c_inst);
        perform set_config('role', 'postgres', true);
        select evolution_instance_name into v_inst from public.user_settings where user_id = v_uid;
        v_ok := v_inst is null;
        v_det := case when v_inst is null then 'instância descartada (NULL)' else 'instância do client aceita' end;
      exception
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.e3_ok', v_ok::text, true);
    perform set_config('teste.e3_det', v_det, true);
  end if;

  -- 4. Controle: usuário comum altera company_name (sem mexer na instância) → 1 linha.
  v_uid := nullif(current_setting('teste.op'), '')::uuid;
  if v_uid is null then
    perform set_config('teste.e4_ok', '', true);
    perform set_config('teste.e4_det', 'sem operador sem organização', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        update public.user_settings set company_name = 'teste-e4' where user_id = v_uid;
        get diagnostics v_rows = row_count;
        v_ok := v_rows = 1; v_det := format('%s linha', v_rows);
      exception
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.e4_ok', v_ok::text, true);
    perform set_config('teste.e4_det', v_det, true);
  end if;

  -- 5. Índice único: o servidor tenta dar a MESMA instância a dois tenants → 23505.
  v_uid := nullif(current_setting('teste.op'), '')::uuid;
  v_alvo := nullif(current_setting('teste.membro'), '')::uuid;
  if v_uid is null or v_alvo is null then
    perform set_config('teste.e5_ok', '', true);
    perform set_config('teste.e5_det', 'faltam dois usuários (operador e membro)', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        perform set_config('role', 'service_role', true);
        update public.user_settings set evolution_instance_name = c_inst where user_id = v_uid;
        update public.user_settings set evolution_instance_name = c_inst where user_id = v_alvo;
        v_ok := false; v_det := 'duplicata aceita';
      exception
        when unique_violation then v_ok := true; v_det := '23505';
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.e5_ok', v_ok::text, true);
    perform set_config('teste.e5_det', v_det, true);
  end if;

  -- 6. Controle: NULL e '' não contam para a unicidade (dois tenants com '').
  v_uid := nullif(current_setting('teste.op'), '')::uuid;
  v_alvo := nullif(current_setting('teste.membro'), '')::uuid;
  if v_uid is null or v_alvo is null then
    perform set_config('teste.e6_ok', '', true);
    perform set_config('teste.e6_det', 'faltam dois usuários (operador e membro)', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        perform set_config('role', 'service_role', true);
        update public.user_settings set evolution_instance_name = '' where user_id in (v_uid, v_alvo);
        get diagnostics v_rows = row_count;
        update public.user_settings set evolution_instance_name = null where user_id in (v_uid, v_alvo);
        v_ok := v_rows = 2; v_det := format('%s linhas com vazio', v_rows);
      exception
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.e6_ok', v_ok::text, true);
    perform set_config('teste.e6_det', v_det, true);
  end if;

  -- 7. M-01: membro da org NÃO lê a linha (segredos) de outro membro da mesma org.
  v_uid := nullif(current_setting('teste.membro'), '')::uuid;
  v_alvo := nullif(current_setting('teste.org_admin'), '')::uuid;
  if v_uid is null or v_alvo is null then
    perform set_config('teste.e7_ok', '', true);
    perform set_config('teste.e7_det', 'sem admin de org com outro membro', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        select count(*) into v_n from public.user_settings where user_id = v_alvo;
        select count(*) into v_rows from public.user_settings where user_id = v_uid;
        v_ok := v_n = 0 and v_rows = 1;
        v_det := format('linha do colega visível: %s; própria: %s', v_n, v_rows);
      exception
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.e7_ok', v_ok::text, true);
    perform set_config('teste.e7_det', v_det, true);
  end if;

  -- 8. Controle: admin da plataforma continua vendo as linhas de outros usuários.
  v_uid := nullif(current_setting('teste.plat'), '')::uuid;
  v_alvo := nullif(current_setting('teste.op'), '')::uuid;
  if v_uid is null or v_alvo is null then
    perform set_config('teste.e8_ok', '', true);
    perform set_config('teste.e8_det', 'sem admin da plataforma ou operador', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        select count(*) into v_n from public.user_settings where user_id = v_alvo;
        v_ok := v_n = 1; v_det := format('%s linha(s) do operador visível(is)', v_n);
      exception
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.e8_ok', v_ok::text, true);
    perform set_config('teste.e8_det', v_det, true);
  end if;

  -- 9. Controle: o admin da plataforma define a instância de um tenant.
  v_uid := nullif(current_setting('teste.plat'), '')::uuid;
  v_alvo := nullif(current_setting('teste.op'), '')::uuid;
  if v_uid is null or v_alvo is null then
    perform set_config('teste.e9_ok', '', true);
    perform set_config('teste.e9_det', 'sem admin da plataforma ou operador', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        update public.user_settings set evolution_instance_name = c_inst where user_id = v_alvo;
        get diagnostics v_rows = row_count;
        v_ok := v_rows = 1; v_det := format('%s linha', v_rows);
      exception
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.e9_ok', v_ok::text, true);
    perform set_config('teste.e9_det', v_det, true);
  end if;
  -- 10. T9-M1: writer da org (admin de org) faz UPDATE SEM WHERE → só a própria
  --     linha muda; a linha do colega fica intacta.
  v_uid := nullif(current_setting('teste.org_admin'), '')::uuid;
  v_alvo := nullif(current_setting('teste.membro'), '')::uuid;
  if v_uid is null or v_alvo is null then
    perform set_config('teste.e10_ok', '', true);
    perform set_config('teste.e10_det', 'sem admin de org com outro membro', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        update public.user_settings set company_name = 'teste-e10';
        get diagnostics v_rows = row_count;
        perform set_config('role', 'postgres', true);
        select count(*) into v_n from public.user_settings
          where user_id = v_alvo and company_name is not distinct from 'teste-e10';
        v_ok := v_n = 0 and v_rows = 1;
        v_det := format('linhas alteradas: %s; linha do colega alterada: %s', v_rows, v_n);
      exception
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.e10_ok', v_ok::text, true);
    perform set_config('teste.e10_det', v_det, true);
  end if;

  -- 11. T9-M1: writer da org faz DELETE SEM WHERE → a linha do colega continua.
  v_uid := nullif(current_setting('teste.org_admin'), '')::uuid;
  v_alvo := nullif(current_setting('teste.membro'), '')::uuid;
  if v_uid is null or v_alvo is null then
    perform set_config('teste.e11_ok', '', true);
    perform set_config('teste.e11_det', 'sem admin de org com outro membro', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        perform set_config('role', 'authenticated', true);
        delete from public.user_settings;
        get diagnostics v_rows = row_count;
        perform set_config('role', 'postgres', true);
        select count(*) into v_n from public.user_settings where user_id = v_alvo;
        v_ok := v_n = 1;
        v_det := format('linhas apagadas: %s; linha do colega existe: %s', v_rows, v_n);
      exception
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.e11_ok', v_ok::text, true);
    perform set_config('teste.e11_det', v_det, true);
  end if;

  -- 12. T9-L2: unicidade ignora espaços nas pontas ('x' e ' x ') → 23505.
  v_uid := nullif(current_setting('teste.op'), '')::uuid;
  v_alvo := nullif(current_setting('teste.membro'), '')::uuid;
  if v_uid is null or v_alvo is null then
    perform set_config('teste.e12_ok', '', true);
    perform set_config('teste.e12_det', 'faltam dois usuários (operador e membro)', true);
  else
    begin
      begin
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        perform set_config('role', 'service_role', true);
        update public.user_settings set evolution_instance_name = c_inst where user_id = v_uid;
        update public.user_settings set evolution_instance_name = '  ' || c_inst || ' ' where user_id = v_alvo;
        v_ok := false; v_det := 'duplicata com espaços aceita';
      exception
        when unique_violation then v_ok := true; v_det := '23505';
        when others then
          if sqlerrm = 'teste_desfaz' then raise; end if;
          v_ok := false; v_det := sqlstate || ' ' || sqlerrm;
      end;
      raise exception 'teste_desfaz';
    exception when others then
      if sqlerrm <> 'teste_desfaz' then v_ok := false; v_det := sqlstate || ' ' || sqlerrm; end if;
    end;
    perform set_config('teste.e12_ok', v_ok::text, true);
    perform set_config('teste.e12_det', v_det, true);
  end if;
end $$;

select c.cenario,
       nullif(current_setting('teste.e' || c.n || '_ok', true), '')::boolean as ok,
       current_setting('teste.e' || c.n || '_det', true) as detalhe
from (values
  (1, '1. usuário altera a própria instância → 42501'),
  (2, '2. admin de org altera instância de membro → negado'),
  (3, '3. INSERT com instância do client → NULL'),
  (4, '4. controle: update comum continua permitido'),
  (5, '5. índice único: mesma instância em dois tenants → 23505'),
  (6, '6. controle: vazio não conta para a unicidade'),
  (7, '7. M-01: membro não lê a linha de outro membro da org'),
  (8, '8. controle: admin da plataforma vê outras linhas'),
  (9, '9. controle: admin da plataforma define a instância'),
  (10, '10. T9-M1: writer da org (UPDATE sem WHERE) não altera linha de colega; própria sim'),
  (11, '11. T9-M1: writer da org (DELETE sem WHERE) não apaga linha de colega'),
  (12, '12. T9-L2: instância igual com espaços nas pontas → 23505')
) as c(n, cenario)
order by c.n;

rollback;
