-- ============================================================
-- FIX SUPABASE - XPAG LeadFinderPro
-- Data: 2026-02-25
-- Execute este script no SQL Editor do Supabase Dashboard
-- É seguro executar múltiplas vezes (IF NOT EXISTS em tudo)
-- ============================================================

-- ── 1. FIX CRÍTICO: is_admin() ────────────────────────────────────────────────
-- A versão antiga consultava public.user_roles (tabela inexistente).
-- Agora usa public.user_settings com coluna role.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_settings
    WHERE user_id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. FIX: can_write() ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_write()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_settings
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'operador')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. ENUM user_role (se não existir) ───────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'operador', 'visualizador');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── 4. Coluna role em user_settings (se não existir) ─────────────────────────
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'operador' NOT NULL;

-- Definir admin para o email principal
UPDATE public.user_settings
SET role = 'admin'
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'fmbp1981@gmail.com'
);

-- ── 5. AGENT_CONFIGS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_configs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL DEFAULT 'Prompt personalizado',
  system_prompt     TEXT NOT NULL,
  prompt_version    TEXT NOT NULL DEFAULT 'custom',
  model             TEXT NOT NULL DEFAULT 'gpt-4.1',
  temperature       NUMERIC(3,2) NOT NULL DEFAULT 0.70 CHECK (temperature BETWEEN 0 AND 2),
  max_iterations    INTEGER NOT NULL DEFAULT 5 CHECK (max_iterations BETWEEN 1 AND 10),
  is_active         BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_configs_user_id ON public.agent_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_active ON public.agent_configs(user_id, is_active) WHERE is_active = true;

ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own agent configs" ON public.agent_configs;
CREATE POLICY "Users manage own agent configs"
  ON public.agent_configs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 6. RAG_DOCUMENTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rag_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_config_id  TEXT,
  filename         TEXT NOT NULL,
  content          TEXT,
  mimetype         TEXT NOT NULL DEFAULT 'text/plain',
  status           TEXT NOT NULL DEFAULT 'processing'
                   CHECK (status IN ('processing', 'ready', 'error', 'deleted')),
  chunk_count      INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rag_docs_user ON public.rag_documents(user_id);
ALTER TABLE public.rag_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own rag documents" ON public.rag_documents;
CREATE POLICY "Users manage own rag documents"
  ON public.rag_documents
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 7. FOLLOWUP_SCHEDULES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.followup_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario        TEXT NOT NULL,
  step_number     INTEGER NOT NULL DEFAULT 1,
  due_at          TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  instance_name   TEXT NOT NULL DEFAULT '',
  skip_reason     TEXT,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_pending
  ON public.followup_schedules(status, due_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_followup_user
  ON public.followup_schedules(user_id, status);

ALTER TABLE public.followup_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own followup schedules" ON public.followup_schedules;
CREATE POLICY "Users manage own followup schedules"
  ON public.followup_schedules
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 8. WHATSAPP_CONVERSATIONS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      TEXT NOT NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message      TEXT NOT NULL,
  from_lead    BOOLEAN NOT NULL DEFAULT true,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_conv_lead ON public.whatsapp_conversations(lead_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_user ON public.whatsapp_conversations(user_id);

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own conversations" ON public.whatsapp_conversations;
CREATE POLICY "Users manage own conversations"
  ON public.whatsapp_conversations
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 9. COLUNAS EXTRAS EM leads_prospeccao ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads_prospeccao' AND column_name = 'follow_up_count'
  ) THEN
    ALTER TABLE public.leads_prospeccao ADD COLUMN follow_up_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads_prospeccao' AND column_name = 'data_ultima_interacao'
  ) THEN
    ALTER TABLE public.leads_prospeccao ADD COLUMN data_ultima_interacao TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads_prospeccao' AND column_name = 'consultor_responsavel'
  ) THEN
    ALTER TABLE public.leads_prospeccao ADD COLUMN consultor_responsavel TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads_prospeccao' AND column_name = 'data_transferencia'
  ) THEN
    ALTER TABLE public.leads_prospeccao ADD COLUMN data_transferencia TIMESTAMPTZ;
  END IF;
END $$;

-- ── 10. TRIGGER updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_configs_updated_at ON public.agent_configs;
CREATE TRIGGER agent_configs_updated_at
  BEFORE UPDATE ON public.agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS rag_documents_updated_at ON public.rag_documents;
CREATE TRIGGER rag_documents_updated_at
  BEFORE UPDATE ON public.rag_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── VERIFICAÇÃO FINAL ─────────────────────────────────────────────────────────
-- Rode para confirmar que tudo foi criado:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
