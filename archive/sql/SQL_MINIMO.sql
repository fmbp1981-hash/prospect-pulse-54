-- ============================================
-- SQL MÍNIMO - GARANTIDO DE FUNCIONAR
-- Execute este SQL completo de uma vez
-- ============================================

-- 1. Criar tabela user_settings
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 2. Habilitar RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS (ignorar se já existir)
DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
CREATE POLICY "Users can view own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
CREATE POLICY "Users can insert own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
CREATE POLICY "Users can update own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

-- 4. Criar índice
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);

-- 5. Adicionar colunas na tabela leads
ALTER TABLE public.leads_prospeccao ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE public.leads_prospeccao ADD COLUMN IF NOT EXISTS estagio_pipeline TEXT DEFAULT 'Novo Lead';
ALTER TABLE public.leads_prospeccao ADD COLUMN IF NOT EXISTS data_envio_proposta TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.leads_prospeccao ADD COLUMN IF NOT EXISTS data_ultima_interacao TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 6. Criar índices nas novas colunas
CREATE INDEX IF NOT EXISTS idx_leads_estagio_pipeline ON public.leads_prospeccao(estagio_pipeline);
CREATE INDEX IF NOT EXISTS idx_leads_data_ultima_interacao ON public.leads_prospeccao(data_ultima_interacao);

-- 7. Atualizar leads existentes
UPDATE public.leads_prospeccao SET estagio_pipeline = 'Novo Lead' WHERE estagio_pipeline IS NULL;
UPDATE public.leads_prospeccao SET data_ultima_interacao = COALESCE(created_at, NOW()) WHERE data_ultima_interacao IS NULL;
