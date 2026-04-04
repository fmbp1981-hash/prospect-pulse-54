-- ============================================================
-- FASE 2-3: Base de Clientes + Campanhas
-- Executar no Supabase Dashboard → SQL Editor
-- Data: 2026-04-02
-- ============================================================

-- ─── TABELA: clientes ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lead_id_original      TEXT,
  empresa               TEXT NOT NULL,
  contato               TEXT,
  whatsapp              TEXT,
  telefone              TEXT,
  email                 TEXT,
  website               TEXT,
  instagram             TEXT,
  cnpj                  TEXT,
  cidade                TEXT,
  endereco              TEXT,
  bairro                TEXT,
  categoria             TEXT,
  tags                  TEXT[],
  aceita_cartao         TEXT,
  faturamento_declarado NUMERIC,
  usa_meios_pagamento   TEXT,
  status                TEXT DEFAULT 'Ativo',  -- Ativo | Inativo | Reprospectar
  origem                TEXT,
  estagio_origem        TEXT,
  data_primeiro_contato TIMESTAMPTZ,
  data_conversao        TIMESTAMPTZ DEFAULT NOW(),
  consultor_responsavel TEXT,
  observacoes           TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- RLS para clientes
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clientes_select" ON public.clientes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "clientes_insert" ON public.clientes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "clientes_update" ON public.clientes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "clientes_delete" ON public.clientes FOR DELETE USING (auth.uid() = user_id);

-- ─── TABELA: cliente_historico ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.cliente_historico (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID REFERENCES public.clientes(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tipo        TEXT NOT NULL,
  descricao   TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cliente_historico_cliente_created
  ON public.cliente_historico (cliente_id, created_at DESC);

-- RLS para cliente_historico
ALTER TABLE public.cliente_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hist_select" ON public.cliente_historico FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "hist_insert" ON public.cliente_historico FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "hist_delete" ON public.cliente_historico FOR DELETE USING (auth.uid() = user_id);

-- ─── TABELA: campaigns ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  channel         TEXT NOT NULL DEFAULT 'whatsapp',  -- whatsapp | email
  status          TEXT DEFAULT 'draft',  -- draft | running | completed | paused
  subject         TEXT,
  body            TEXT NOT NULL,
  audience_filter JSONB,
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  total_sent      INT DEFAULT 0,
  total_failed    INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS para campaigns
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_select" ON public.campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "campaigns_insert" ON public.campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "campaigns_update" ON public.campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "campaigns_delete" ON public.campaigns FOR DELETE USING (auth.uid() = user_id);

-- ─── TABELA: campaign_sends ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_sends (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lead_id      TEXT,
  recipient    TEXT NOT NULL,
  status       TEXT DEFAULT 'pending',  -- pending | sent | failed
  sent_at      TIMESTAMPTZ,
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign
  ON public.campaign_sends (campaign_id, status);

-- RLS para campaign_sends
ALTER TABLE public.campaign_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sends_select" ON public.campaign_sends FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sends_insert" ON public.campaign_sends FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sends_update" ON public.campaign_sends FOR UPDATE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- PRONTO! Execute acima e confirme as 4 tabelas criadas.
-- ─────────────────────────────────────────────────────────────
