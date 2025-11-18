-- Criar tabela de configurações do usuário
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Configurações da empresa
  company_name TEXT,

  -- Configurações Evolution API
  evolution_api_url TEXT,
  evolution_api_key TEXT,
  evolution_instance_name TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Política: usuários podem ver apenas suas próprias configurações
CREATE POLICY "Users can view own settings"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id);

-- Política: usuários podem inserir suas próprias configurações
CREATE POLICY "Users can insert own settings"
  ON public.user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: usuários podem atualizar suas próprias configurações
CREATE POLICY "Users can update own settings"
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Política: usuários podem deletar suas próprias configurações
CREATE POLICY "Users can delete own settings"
  ON public.user_settings FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comentários
COMMENT ON TABLE public.user_settings IS 'Configurações personalizadas por usuário';
COMMENT ON COLUMN public.user_settings.company_name IS 'Nome da empresa do usuário';
COMMENT ON COLUMN public.user_settings.evolution_api_url IS 'URL completa da Evolution API (ex: https://evolution.intellixai.com.br/chat/whatsappNumbers/WA-Pessoal)';
COMMENT ON COLUMN public.user_settings.evolution_api_key IS 'API Key da Evolution API';
COMMENT ON COLUMN public.user_settings.evolution_instance_name IS 'Nome da instância Evolution API (ex: WA-Pessoal)';
