-- Fecha um gap encontrado durante a verificação da migration anterior
-- (20260916010000_fix_multitenant_rls_isolation.sql): a nova policy
-- "org writers can insert/update/delete <t>" (permissiva, exige is_org_writer)
-- não bloqueia um usuário com role='visualizador' escrevendo na PRÓPRIA linha,
-- porque a policy antiga de cada tabela ("auth.uid() = user_id", permissiva,
-- sem checar role) ainda existe e aprova sozinha via OR — exatamente a mesma
-- classe de problema do achado crítico original, agora para o campo role em
-- vez de organization_id.
--
-- Testado: visualizador de uma organização conseguia fazer UPDATE numa linha
-- de sua própria autoria (SET status = ...) mesmo sem ser writer da org.
--
-- Fix: política RESTRICTIVE de is_org_writer para INSERT/UPDATE/DELETE em cada
-- tabela. Restrictive é ANDed com QUALQUER policy permissiva (antiga ou nova),
-- então nenhuma combinação de policies permissivas consegue mais aprovar uma
-- escrita de um visualizador — nem nas próprias linhas.
--
-- organization_id IS NULL é liberado propositalmente: preserva o comportamento
-- de usuários que ainda não pertencem a nenhuma organização (maioria da base
-- hoje, já que o compartilhamento por organização é opt-in/gradual) — para
-- essas linhas, a policy antiga baseada em user_id continua sendo a única
-- regra que importa, como já era antes desta migration.

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
      RAISE WARNING 'Tabela % não existe, pulando restrictive policy', t;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'org role gate insert ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT WITH CHECK (organization_id IS NULL OR public.is_org_writer(organization_id));',
      'org role gate insert ' || t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'org role gate update ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE USING (organization_id IS NULL OR public.is_org_writer(organization_id)) WITH CHECK (organization_id IS NULL OR public.is_org_writer(organization_id));',
      'org role gate update ' || t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'org role gate delete ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE USING (organization_id IS NULL OR public.is_org_writer(organization_id));',
      'org role gate delete ' || t, t
    );
  END LOOP;
END $$;
