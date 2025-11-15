-- Drop existing table and recreate with all CSV columns
DROP TABLE IF EXISTS public.leads_prospeccao CASCADE;

CREATE TABLE public.leads_prospeccao (
  -- ID único do Google Places
  id text PRIMARY KEY,
  
  -- Controle de timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Identificação sequencial do lead
  lead text NOT NULL UNIQUE,
  
  -- Status geral do lead
  status text DEFAULT 'Novo',
  
  -- Data formatada (compatibilidade CSV)
  data text,
  
  -- Dados da empresa
  empresa text NOT NULL,
  categoria text,
  contato text,
  
  -- Contatos
  telefone_whatsapp text,
  email text,
  website text,
  instagram text,
  
  -- Localização
  cidade text,
  endereco text,
  bairro_regiao text,
  
  -- Google Maps
  link_gmn text,
  
  -- Informações adicionais
  aceita_cartao text,
  cnpj text,
  
  -- WhatsApp
  mensagem_whatsapp text,
  status_msg_wa text DEFAULT 'not_sent',
  data_envio_wa timestamptz,
  
  -- Análise
  resumo_analitico text
);

-- Índices para performance
CREATE INDEX idx_leads_lead ON public.leads_prospeccao(lead);
CREATE INDEX idx_leads_status ON public.leads_prospeccao(status);
CREATE INDEX idx_leads_categoria ON public.leads_prospeccao(categoria);
CREATE INDEX idx_leads_cidade ON public.leads_prospeccao(cidade);
CREATE INDEX idx_leads_status_msg_wa ON public.leads_prospeccao(status_msg_wa);
CREATE INDEX idx_leads_created_at ON public.leads_prospeccao(created_at DESC);

-- Trigger para updated_at
CREATE TRIGGER update_leads_prospeccao_updated_at
  BEFORE UPDATE ON public.leads_prospeccao
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE public.leads_prospeccao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura de todos os leads"
  ON public.leads_prospeccao FOR SELECT
  USING (true);

CREATE POLICY "Permitir inserção de leads"
  ON public.leads_prospeccao FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Permitir atualização de leads"
  ON public.leads_prospeccao FOR UPDATE
  USING (true);