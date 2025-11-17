-- Criar tabela para armazenar conversas do WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT REFERENCES public.leads_prospeccao(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  from_lead BOOLEAN NOT NULL DEFAULT false, -- true = mensagem do lead, false = nossa resposta
  message_id TEXT, -- ID da mensagem do WhatsApp
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id), -- Multi-tenant

  -- Metadata adicional
  ai_generated BOOLEAN DEFAULT false,
  sentiment TEXT, -- positive, neutral, negative (futuro)
  intent TEXT -- interest, question, objection, closing (futuro)
);

-- Criar índices para performance
CREATE INDEX idx_whatsapp_conversations_lead_id ON public.whatsapp_conversations(lead_id);
CREATE INDEX idx_whatsapp_conversations_timestamp ON public.whatsapp_conversations(timestamp DESC);
CREATE INDEX idx_whatsapp_conversations_user_id ON public.whatsapp_conversations(user_id);

-- Habilitar RLS
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para multi-tenancy
CREATE POLICY "Users can view own conversations"
  ON public.whatsapp_conversations FOR SELECT
  USING (
    user_id = auth.uid() OR
    lead_id IN (
      SELECT id FROM public.leads_prospeccao WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own conversations"
  ON public.whatsapp_conversations FOR INSERT
  WITH CHECK (
    lead_id IN (
      SELECT id FROM public.leads_prospeccao WHERE user_id = auth.uid()
    )
  );

-- Trigger para auto-preencher user_id
CREATE OR REPLACE FUNCTION public.set_conversation_user_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Buscar user_id do lead associado
  SELECT user_id INTO NEW.user_id
  FROM public.leads_prospeccao
  WHERE id = NEW.lead_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_set_conversation_user_id
  BEFORE INSERT ON public.whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_conversation_user_id();

-- Comentários
COMMENT ON TABLE public.whatsapp_conversations IS 'Armazena histórico de conversas do WhatsApp com leads';
COMMENT ON COLUMN public.whatsapp_conversations.from_lead IS 'true = mensagem do lead, false = resposta nossa/IA';
COMMENT ON COLUMN public.whatsapp_conversations.ai_generated IS 'Se a resposta foi gerada por IA';
