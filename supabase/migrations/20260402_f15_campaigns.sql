-- ============================================================
-- MIGRATION: F15 — Sistema de Campanhas
-- Data: 2026-04-02
-- Descrição: Cria tabelas campaigns e campaign_sends
-- ============================================================

-- ── 1. CAMPAIGNS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name             TEXT NOT NULL,
  description      TEXT,
  channel          TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  subject          TEXT,               -- obrigatório para email
  body             TEXT NOT NULL,
  audience_filter  JSONB,              -- { categoria, cidade, estagio_pipeline, ... }

  -- Estado
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'running', 'completed', 'paused')),
  total_sent       INTEGER NOT NULL DEFAULT 0,
  total_failed     INTEGER NOT NULL DEFAULT 0,

  -- Datas
  scheduled_at     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON public.campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status  ON public.campaigns(user_id, status);

-- RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own campaigns"
  ON public.campaigns
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 2. CAMPAIGN_SENDS — Envios individuais ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_sends (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id      UUID,                   -- referência soft (lead pode ser deletado)
  recipient    TEXT NOT NULL,          -- número de WhatsApp ou endereço de email
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at      TIMESTAMPTZ,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign_id ON public.campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_user_id     ON public.campaign_sends(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_status      ON public.campaign_sends(campaign_id, status);

-- RLS
ALTER TABLE public.campaign_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own campaign_sends"
  ON public.campaign_sends
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 3. TRIGGER — updated_at automático ───────────────────────────────────────
-- Reutiliza a função set_updated_at() criada na migration F14.
-- Se esta migration for executada separadamente, cria a função caso não exista.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
