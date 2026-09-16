-- Corrige falhas críticas de isolamento encontradas na revisão de segurança do PR #7
-- (multi-tenant-reviewer + database-architect, ambos com veredito FAIL) sobre
-- 20260916000000_add_organizations_multi_tenant.sql:
--
-- 1) CRÍTICO — Policies permissivas se combinam com OR no Postgres. As políticas
--    antigas de cada tabela (ex: "auth.uid() = user_id") nunca validam
--    organization_id, então bastava a policy antiga aprovar (sempre aprova quando
--    o usuário edita a própria linha) para o INSERT/UPDATE passar mesmo setando
--    organization_id de OUTRA organização — quebrando o isolamento inteiro.
--    Fix: o trigger passa a REJEITAR (não só preencher) um organization_id que o
--    usuário autenticado não pertence, tanto em INSERT quanto em UPDATE. Isso
--    fecha a brecha independente de quantas policies permissivas existam, porque
--    o trigger roda antes de qualquer policy ser avaliada.
--
-- 2) ALTO — role 'visualizador' tinha os mesmos poderes de escrita que admin/
--    operador (a policy "FOR ALL" não olhava a coluna role). Fix: nova função
--    is_org_writer() exclui visualizador; políticas de escrita passam a exigi-la.
--
-- 3) ALTO — migration original não era idempotente (CREATE POLICY/TRIGGER sem
--    DROP IF EXISTS antes, backfill sem guarda). Fix: todo DDL abaixo dropa antes
--    de recriar, e o backfill só roda se a organização ainda não existir.
--
-- 4) MÉDIO — funções SECURITY DEFINER ficaram com EXECUTE aberto para PUBLIC
--    (padrão do Postgres). Fix: revoga de PUBLIC, concede só para authenticated.
--
-- 5) BAIXO — policy de UPDATE em organizations sem WITH CHECK explícito. Fix:
--    adiciona.
--
-- Nenhuma tabela é criada ou removida aqui; é só correção de RLS/triggers/grants
-- sobre o que 20260916000000 já criou.

-- ============================================================================
-- 1. Privilégio mínimo nas funções helper existentes
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.get_my_organization_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;

-- ============================================================================
-- 2. Nova função helper: membro com poder de escrita (exclui 'visualizador')
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_org_writer(check_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = auth.uid()
      AND organization_id = check_org_id
      AND role <> 'visualizador'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_org_writer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_writer(uuid) TO authenticated;

-- ============================================================================
-- 3. Trigger passa a VALIDAR organization_id, não só preencher quando NULL.
--    auth.uid() IS NULL identifica escrita via service role (webhooks n8n,
--    Edge Functions) — esses caminhos são responsabilidade da aplicação, não
--    de um usuário autenticado tentando forjar organization_id, e não devem
--    ser bloqueados aqui.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_organization_id_from_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_my_organization_id();
  ELSIF auth.uid() IS NOT NULL AND NOT public.is_org_member(NEW.organization_id) THEN
    RAISE EXCEPTION 'organization_id inválido para o usuário atual';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 4. Re-cria trigger (agora BEFORE INSERT OR UPDATE) e políticas por comando
--    (SELECT/INSERT/UPDATE/DELETE) em vez de uma única policy FOR ALL, para
--    cada uma das tabelas multi-tenant. Guarda com DROP IF EXISTS (idempotente)
--    e com checagem de existência da tabela (evita quebrar se alguma delas
--    ainda não existir num ambiente novo criado só a partir das migrations).
-- ============================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'agent_configs', 'audit_logs', 'campaign_sends', 'campaigns',
    'cliente_historico', 'clientes', 'companies', 'contacts',
    'followup_schedules', 'icp_settings', 'import_history', 'lead_notes',
    'leads_prospeccao', 'linkedin_raw', 'linkedin_suppression_list',
    'message_logs', 'message_templates', 'prospecting_channels',
    'prospecting_jobs', 'rag_document_chunks', 'rag_documents',
    'search_history', 'user_settings', 'webhook_keys',
    'whatsapp_conversations', 'enrichment_raw'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE WARNING 'Tabela % não existe, pulando fix de RLS multi-tenant', t;
      CONTINUE;
    END IF;

    -- Trigger: agora valida em INSERT e UPDATE, não só preenche em INSERT
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I;', 'set_org_id_' || t, t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_from_member();',
      'set_org_id_' || t, t
    );

    -- Remove a policy antiga "FOR ALL" (não distinguia leitura de escrita nem
    -- validava role)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'org members can access ' || t, t);

    -- Leitura: qualquer membro da organização
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'org members can view ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_org_member(organization_id));',
      'org members can view ' || t, t
    );

    -- Escrita (INSERT/UPDATE/DELETE): só membros com role <> visualizador
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'org writers can insert ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.is_org_writer(organization_id));',
      'org writers can insert ' || t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'org writers can update ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (public.is_org_writer(organization_id)) WITH CHECK (public.is_org_writer(organization_id));',
      'org writers can update ' || t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'org writers can delete ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (public.is_org_writer(organization_id));',
      'org writers can delete ' || t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- 5. organizations: WITH CHECK explícito na policy de UPDATE
-- ============================================================================

DROP POLICY IF EXISTS "admins can update own organization" ON public.organizations;
CREATE POLICY "admins can update own organization" ON public.organizations
  FOR UPDATE USING (public.is_org_admin(id)) WITH CHECK (public.is_org_admin(id));
