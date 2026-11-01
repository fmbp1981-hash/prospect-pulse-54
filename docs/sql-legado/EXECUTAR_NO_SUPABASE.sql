-- ============================================
-- EXECUTAR ESTE SQL NO SUPABASE SQL EDITOR
-- Dashboard → SQL Editor → New Query → Colar e Executar
-- ============================================

-- 1. Criar tabela de configurações do usuário (se não existir)
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Habilitar RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (com IF NOT EXISTS simulado via DROP/CREATE)
DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
CREATE POLICY "Users can view own settings"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
CREATE POLICY "Users can insert own settings"
  ON public.user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
CREATE POLICY "Users can update own settings"
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Índice
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER trigger_update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_settings_updated_at();

-- ============================================
-- 2. Adicionar novas colunas à tabela leads
-- ============================================

-- Coluna telefone (não WhatsApp)
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS telefone TEXT;

-- Coluna estágio do pipeline
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS estagio_pipeline TEXT DEFAULT 'Novo Lead';

-- Coluna data de envio de proposta
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS data_envio_proposta TIMESTAMP WITH TIME ZONE;

-- Coluna data da última interação (para Follow-up)
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS data_ultima_interacao TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Comentários
COMMENT ON COLUMN public.leads_prospeccao.telefone IS 'Telefone que não é WhatsApp';
COMMENT ON COLUMN public.leads_prospeccao.telefone_whatsapp IS 'Telefone com WhatsApp ativo';
COMMENT ON COLUMN public.leads_prospeccao.estagio_pipeline IS 'Estágio do lead no funil: Novo Lead, Contato Inicial, Proposta Enviada, Negociação, Fechado, Follow-up';
COMMENT ON COLUMN public.leads_prospeccao.data_envio_proposta IS 'Data/hora de envio da proposta comercial';
COMMENT ON COLUMN public.leads_prospeccao.data_ultima_interacao IS 'Data/hora da última interação com o lead (para detecção de estagnação)';

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_leads_estagio_pipeline
  ON public.leads_prospeccao(estagio_pipeline);

CREATE INDEX IF NOT EXISTS idx_leads_data_ultima_interacao
  ON public.leads_prospeccao(data_ultima_interacao);

-- ============================================
-- 3. Atualizar leads existentes
-- ============================================

-- Definir estágio inicial para leads sem estágio
UPDATE public.leads_prospeccao
SET estagio_pipeline = 'Novo Lead'
WHERE estagio_pipeline IS NULL;

-- Atualizar data_ultima_interacao para leads sem data
UPDATE public.leads_prospeccao
SET data_ultima_interacao = created_at
WHERE data_ultima_interacao IS NULL;

-- ============================================
-- CONCLUÍDO!
-- ============================================
-- Após executar, vá em Settings e configure o nome da sua empresa
-- ============================================
