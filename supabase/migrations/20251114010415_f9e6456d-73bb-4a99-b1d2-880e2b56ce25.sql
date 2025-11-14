-- Criar tabela de leads de prospecção
CREATE TABLE IF NOT EXISTS public.leads_prospeccao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_empresa TEXT NOT NULL,
  categoria TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  website TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  pais TEXT DEFAULT 'Brasil',
  bairro TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  avaliacao DOUBLE PRECISION,
  total_avaliacoes INTEGER,
  resumo_site TEXT,
  mensagem_whatsapp TEXT,
  status TEXT DEFAULT 'novo',
  origem TEXT DEFAULT 'google_places',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.leads_prospeccao ENABLE ROW LEVEL SECURITY;

-- Política para permitir leitura pública (dados de prospecção)
CREATE POLICY "Permitir leitura de todos os leads"
  ON public.leads_prospeccao
  FOR SELECT
  USING (true);

-- Política para permitir inserção pela edge function
CREATE POLICY "Permitir inserção de leads"
  ON public.leads_prospeccao
  FOR INSERT
  WITH CHECK (true);

-- Política para permitir atualização
CREATE POLICY "Permitir atualização de leads"
  ON public.leads_prospeccao
  FOR UPDATE
  USING (true);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_leads_prospeccao_cidade ON public.leads_prospeccao(cidade);
CREATE INDEX IF NOT EXISTS idx_leads_prospeccao_categoria ON public.leads_prospeccao(categoria);
CREATE INDEX IF NOT EXISTS idx_leads_prospeccao_status ON public.leads_prospeccao(status);
CREATE INDEX IF NOT EXISTS idx_leads_prospeccao_created_at ON public.leads_prospeccao(created_at DESC);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_leads_prospeccao_updated_at
  BEFORE UPDATE ON public.leads_prospeccao
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();