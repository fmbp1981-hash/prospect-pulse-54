-- ============================================================
-- MIGRATION: Native Workflow Engine — XPAG LeadFinderPro
-- Data: 2026-02-25
-- Descrição: Cria tabelas para Agent Config, RAG e Follow-up
-- ============================================================

-- ── 1. EXTENSÃO PGVECTOR (para RAG) ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ── 2. AGENT_CONFIGS — Prompt editor por tenant ───────────────────────────────
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

-- RLS
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agent configs"
  ON public.agent_configs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 3. RAG_DOCUMENTS — Documentos de treinamento ─────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_rag_docs_status ON public.rag_documents(user_id, status);

ALTER TABLE public.rag_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own rag documents"
  ON public.rag_documents
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 4. RAG_DOCUMENT_CHUNKS — Chunks vetorizados ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.rag_document_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES public.rag_documents(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  chunk_index  INTEGER NOT NULL,
  embedding    vector(1536),       -- text-embedding-3-small
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chunks_doc ON public.rag_document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user ON public.rag_document_chunks(user_id);

-- Índice HNSW para busca vetorial eficiente
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON public.rag_document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

ALTER TABLE public.rag_document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chunks"
  ON public.rag_document_chunks
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 5. FUNÇÃO RPC: match_document_chunks ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding   vector(1536),
  match_count       INTEGER DEFAULT 3,
  p_user_id         UUID DEFAULT NULL,
  p_agent_config_id TEXT DEFAULT NULL,
  similarity_threshold FLOAT DEFAULT 0.6
)
RETURNS TABLE (
  id            UUID,
  document_id   UUID,
  content       TEXT,
  chunk_index   INTEGER,
  similarity    FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.document_id,
    c.content,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.rag_document_chunks c
  JOIN public.rag_documents d ON d.id = c.document_id
  WHERE
    (p_user_id IS NULL OR c.user_id = p_user_id)
    AND (p_agent_config_id IS NULL OR d.agent_config_id = p_agent_config_id)
    AND d.status = 'ready'
    AND 1 - (c.embedding <=> query_embedding) > similarity_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── 6. FOLLOWUP_SCHEDULES — Agendamento de follow-ups de longo prazo ──────────
CREATE TABLE IF NOT EXISTS public.followup_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         TEXT NOT NULL,   -- ID do lead (pode ser ORG-xxx ou place_id)
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario        TEXT NOT NULL,   -- low_revenue, no_response_long, qualified_not_closed, etc.
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
  ON public.followup_schedules(status, due_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_followup_user
  ON public.followup_schedules(user_id, status);

CREATE INDEX IF NOT EXISTS idx_followup_lead
  ON public.followup_schedules(lead_id);

ALTER TABLE public.followup_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own followup schedules"
  ON public.followup_schedules
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 7. WHATSAPP_CONVERSATIONS (se não existir) ────────────────────────────────
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

CREATE POLICY "Users manage own conversations"
  ON public.whatsapp_conversations
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 8. COLUNAS EXTRAS EM leads_prospeccao (se não existirem) ─────────────────
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

-- ── 9. TRIGGER: updated_at automático ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_configs_updated_at
  BEFORE UPDATE ON public.agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER rag_documents_updated_at
  BEFORE UPDATE ON public.rag_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
