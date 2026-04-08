-- ============================================================
-- MIGRATION: F14 — Base de Clientes Permanente
-- Data: 2026-04-02
-- Descrição: Cria tabelas clientes e cliente_historico
-- ============================================================

-- ── 1. CLIENTES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id_original        UUID REFERENCES public.leads_prospeccao(id) ON DELETE SET NULL,

  -- Dados da empresa
  empresa                 TEXT NOT NULL,
  contato                 TEXT,
  whatsapp                TEXT,
  telefone                TEXT,
  email                   TEXT,
  website                 TEXT,
  instagram               TEXT,
  cnpj                    TEXT,

  -- Localização
  cidade                  TEXT,
  endereco                TEXT,
  bairro                  TEXT,

  -- Negócio
  categoria               TEXT,
  aceita_cartao           BOOLEAN,
  faturamento_declarado   TEXT,
  usa_meios_pagamento     BOOLEAN,

  -- Relacionamento
  status                  TEXT NOT NULL DEFAULT 'Ativo',   -- Ativo | Inativo | Reprospectar
  origem                  TEXT NOT NULL DEFAULT 'Manual',  -- Prospecção | Manual | Reimportado de Clientes
  estagio_origem          TEXT,                            -- estagio_pipeline no momento da conversão
  data_primeiro_contato   TIMESTAMPTZ,
  data_conversao          TIMESTAMPTZ NOT NULL DEFAULT now(),
  consultor_responsavel   TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clientes_user_id    ON public.clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_clientes_status     ON public.clientes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa    ON public.clientes USING gin(to_tsvector('portuguese', empresa));

-- RLS
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own clientes"
  ON public.clientes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 2. CLIENTE_HISTORICO — Timeline de eventos por cliente ───────────────────
CREATE TABLE IF NOT EXISTS public.cliente_historico (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,       -- conversao | status_change | nota | whatsapp | email | campanha | follow_up
  descricao   TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_historico_cliente_id ON public.cliente_historico(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_historico_user_id    ON public.cliente_historico(user_id);
CREATE INDEX IF NOT EXISTS idx_cliente_historico_created_at ON public.cliente_historico(cliente_id, created_at DESC);

-- RLS
ALTER TABLE public.cliente_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cliente_historico"
  ON public.cliente_historico
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 3. TRIGGER — updated_at automático ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
