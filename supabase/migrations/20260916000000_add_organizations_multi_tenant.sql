-- Multi-tenant por organização (empresa) — vários usuários da mesma empresa
-- compartilham os mesmos dados; empresas diferentes ficam completamente
-- isoladas entre si. Ver conversa/decisão registrada na sessão de 2026-09-16.
--
-- Estratégia deliberadamente ADITIVA e não-destrutiva:
--   - Não remove nem reescreve nenhuma policy de RLS existente (26 tabelas,
--     banco com cliente real ativo — risco alto demais pra reescrever tudo
--     de uma vez). Cada tabela ganha uma policy NOVA, e múltiplas policies
--     permissivas no Postgres se combinam com OR — então isso só AMPLIA
--     acesso, nunca quebra o que já funciona hoje (auth.uid() = user_id).
--   - organization_id nasce NULLABLE em toda tabela — quem não pertence a
--     nenhuma organização continua funcionando exatamente como antes.
--   - Um trigger genérico preenche organization_id automaticamente no INSERT
--     a partir da organização do usuário logado — isso faz o
--     compartilhamento entre membros da mesma empresa funcionar para dado
--     NOVO sem precisar reescrever repositórios/rotas agora (fase 2).

-- ============================================================
-- 1. organizations + organization_members
-- ============================================================

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'operador' CHECK (role IN ('admin', 'operador', 'visualizador')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- MVP: 1 usuário pertence a no máximo 1 organização. Revisitar se algum
  -- dia precisar de usuário em múltiplas empresas ao mesmo tempo.
  UNIQUE (user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_organization_members_org_id ON public.organization_members(organization_id);

-- ============================================================
-- 2. Funções auxiliares (SECURITY DEFINER — mesmo padrão já usado em
--    is_admin()/can_write() deste projeto, evita recursão de RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_organization_id()
RETURNS uuid AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_org_member(check_org_id uuid)
RETURNS boolean AS $$
  SELECT check_org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = check_org_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_org_admin(check_org_id uuid)
RETURNS boolean AS $$
  SELECT check_org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = check_org_id AND user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- RLS de organizations/organization_members usa as funções acima (não se
-- referenciam diretamente, evita recursão).
CREATE POLICY "members can view own organization" ON public.organizations
  FOR SELECT USING (public.is_org_member(id));

CREATE POLICY "admins can update own organization" ON public.organizations
  FOR UPDATE USING (public.is_org_admin(id));

CREATE POLICY "members can view own membership rows" ON public.organization_members
  FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "admins can manage membership" ON public.organization_members
  FOR ALL USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- ============================================================
-- 3. Trigger genérico: preenche organization_id no INSERT a partir da
--    organização do usuário logado, se ainda não vier setado.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_organization_id_from_member()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_my_organization_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 4. Para cada tabela com user_id: adiciona organization_id, policy
--    aditiva de compartilhamento por organização, e o trigger de
--    auto-preenchimento no INSERT.
-- ============================================================

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
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;',
      t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I(organization_id);',
      'idx_' || t || '_organization_id', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));',
      'org members can access ' || t, t
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_organization_id_from_member();',
      'set_org_id_' || t, t
    );
  END LOOP;
END $$;

-- ============================================================
-- 5. Backfill: cria a organização "IntelliX.AI" e associa
--    contato@intellixai.com.br como admin — único usuário real hoje.
--    Demais usuários (ex: fmbp1981@gmail.com) ficam sem organização por
--    enquanto, continuam funcionando pelo caminho antigo (user_id).
-- ============================================================

DO $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
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
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'contato@intellixai.com.br';

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.organizations (name) VALUES ('IntelliX.AI')
      RETURNING id INTO v_org_id;

    INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (v_org_id, v_user_id, 'admin');

    FOREACH t IN ARRAY tables LOOP
      EXECUTE format(
        'UPDATE public.%I SET organization_id = $1 WHERE user_id = $2;', t
      ) USING v_org_id, v_user_id;
    END LOOP;
  END IF;
END $$;

COMMENT ON TABLE public.organizations IS
  'Empresa cliente do sistema. Múltiplos usuários (organization_members) '
  'compartilham os mesmos dados de prospecção via organization_id nas '
  'tabelas de negócio. Empresas diferentes são completamente isoladas.';
COMMENT ON TABLE public.organization_members IS
  'Vínculo usuário <-> organização + role (admin/operador/visualizador). '
  'MVP: 1 usuário pertence a no máximo 1 organização (UNIQUE user_id).';
