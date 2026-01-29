-- ================================================================
-- SQL para adicionar novos campos do Agente IA XPAG v3.0
-- Executar no Supabase SQL Editor
-- ================================================================

-- 1. Adicionar novos campos na tabela leads_prospeccao
-- Campos para qualificação e fluxo do agente

-- Campo: usa_meios_pagamento - indica se lead já usa cartão/pix
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS usa_meios_pagamento TEXT;

COMMENT ON COLUMN public.leads_prospeccao.usa_meios_pagamento IS 'Indica se lead já usa meios de pagamento: SIM, NAO, null';

-- Campo: faturamento_declarado - valor numérico do faturamento mensal
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS faturamento_declarado NUMERIC;

COMMENT ON COLUMN public.leads_prospeccao.faturamento_declarado IS 'Faturamento mensal declarado pelo lead em reais';

-- Campo: motivo_follow_up - razão para estar em follow-up
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS motivo_follow_up TEXT;

COMMENT ON COLUMN public.leads_prospeccao.motivo_follow_up IS 'Motivo pelo qual lead está em follow-up: Faturamento abaixo do mínimo, Sem interesse, etc';

-- Campo: modo_atendimento - bot ou humano
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS modo_atendimento TEXT DEFAULT 'bot';

COMMENT ON COLUMN public.leads_prospeccao.modo_atendimento IS 'Modo atual de atendimento: bot, humano';

-- Campo: etapa_funil - etapa detalhada do funil de vendas
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS etapa_funil TEXT;

COMMENT ON COLUMN public.leads_prospeccao.etapa_funil IS 'Etapa do funil: Diagnóstico, Transferência, Nutrição, etc';

-- Campo: origem - origem do lead
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS origem TEXT;

COMMENT ON COLUMN public.leads_prospeccao.origem IS 'Origem do lead: Prospecção, WhatsApp Direto, Instagram, etc';

-- Campo: resposta_inicial - primeira resposta do lead
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS resposta_inicial TEXT;

COMMENT ON COLUMN public.leads_prospeccao.resposta_inicial IS 'Primeira resposta do lead: SIM, NAO, ORGANICO';

-- Campo: data_qualificacao - quando foi qualificado
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS data_qualificacao TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.leads_prospeccao.data_qualificacao IS 'Data/hora em que o lead foi qualificado';

-- Campo: ultimo_contato - última interação
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS ultimo_contato TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.leads_prospeccao.ultimo_contato IS 'Data/hora do último contato com o lead';

-- ================================================================
-- 2. Criar índices para melhorar performance de consultas
-- ================================================================

-- Índice para busca por WhatsApp (usado pelo agente)
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp ON public.leads_prospeccao(whatsapp);

-- Índice para filtrar por estagio_pipeline
CREATE INDEX IF NOT EXISTS idx_leads_estagio ON public.leads_prospeccao(estagio_pipeline);

-- Índice para filtrar por status_msg_wa
CREATE INDEX IF NOT EXISTS idx_leads_status_wa ON public.leads_prospeccao(status_msg_wa);

-- Índice para filtrar por faturamento
CREATE INDEX IF NOT EXISTS idx_leads_faturamento ON public.leads_prospeccao(faturamento_declarado);

-- ================================================================
-- 3. Atualizar tipos do pipeline (valores válidos)
-- ================================================================

-- Verificar e documentar os valores válidos para estagio_pipeline:
-- - Novo Lead
-- - Contato Inicial
-- - Qualificação
-- - Transferido para Consultor
-- - Fechado Ganho
-- - Fechado Perdido
-- - Follow-up

-- Valores válidos para status_msg_wa:
-- - not_sent
-- - sent
-- - failed
-- - Em Conversa
-- - Qualificando
-- - Qualificado
-- - Transferido
-- - Follow-up

-- ================================================================
-- 4. Atualizar função de atualização de lead (para n8n)
-- ================================================================

-- Função para atualizar lead por WhatsApp (usada pelo workflow n8n)
CREATE OR REPLACE FUNCTION public.atualizar_lead_por_whatsapp(
  p_whatsapp TEXT,
  p_status_msg_wa TEXT DEFAULT NULL,
  p_estagio_pipeline TEXT DEFAULT NULL,
  p_faturamento_declarado NUMERIC DEFAULT NULL,
  p_motivo_follow_up TEXT DEFAULT NULL,
  p_modo_atendimento TEXT DEFAULT NULL,
  p_usa_meios_pagamento TEXT DEFAULT NULL,
  p_empresa TEXT DEFAULT NULL,
  p_contato TEXT DEFAULT NULL,
  p_etapa_funil TEXT DEFAULT NULL,
  p_data_qualificacao TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_id TEXT;
  v_result JSON;
BEGIN
  -- Buscar lead pelo WhatsApp
  SELECT id INTO v_lead_id
  FROM public.leads_prospeccao
  WHERE whatsapp = p_whatsapp
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Lead não encontrado');
  END IF;

  -- Atualizar campos não nulos
  UPDATE public.leads_prospeccao
  SET
    status_msg_wa = COALESCE(p_status_msg_wa, status_msg_wa),
    estagio_pipeline = COALESCE(p_estagio_pipeline, estagio_pipeline),
    faturamento_declarado = COALESCE(p_faturamento_declarado, faturamento_declarado),
    motivo_follow_up = COALESCE(p_motivo_follow_up, motivo_follow_up),
    modo_atendimento = COALESCE(p_modo_atendimento, modo_atendimento),
    usa_meios_pagamento = COALESCE(p_usa_meios_pagamento, usa_meios_pagamento),
    empresa = COALESCE(p_empresa, empresa),
    contato = COALESCE(p_contato, contato),
    etapa_funil = COALESCE(p_etapa_funil, etapa_funil),
    data_qualificacao = COALESCE(p_data_qualificacao, data_qualificacao),
    data_ultima_interacao = NOW(),
    ultimo_contato = NOW(),
    updated_at = NOW()
  WHERE id = v_lead_id;

  -- Retornar resultado
  SELECT json_build_object(
    'success', true,
    'lead_id', v_lead_id,
    'updated_at', NOW()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ================================================================
-- 5. Função para criar lead orgânico (para n8n)
-- ================================================================

CREATE OR REPLACE FUNCTION public.criar_lead_organico(
  p_whatsapp TEXT,
  p_contato TEXT DEFAULT NULL,
  p_empresa TEXT DEFAULT 'A definir',
  p_telefone TEXT DEFAULT NULL,
  p_categoria TEXT DEFAULT 'Lead Orgânico'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_id TEXT;
  v_lead_numero TEXT;
  v_result JSON;
BEGIN
  -- Verificar se já existe
  SELECT id INTO v_lead_id
  FROM public.leads_prospeccao
  WHERE whatsapp = p_whatsapp
  LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Lead já existe', 'lead_id', v_lead_id);
  END IF;

  -- Gerar IDs
  v_lead_id := gen_random_uuid()::TEXT;
  v_lead_numero := 'Lead-ORG-' || EXTRACT(EPOCH FROM NOW())::BIGINT;

  -- Inserir lead
  INSERT INTO public.leads_prospeccao (
    id,
    lead,
    empresa,
    whatsapp,
    telefone,
    contato,
    categoria,
    status,
    estagio_pipeline,
    status_msg_wa,
    origem,
    data,
    created_at,
    updated_at,
    data_ultima_interacao,
    ultimo_contato
  ) VALUES (
    v_lead_id,
    v_lead_numero,
    COALESCE(p_empresa, 'A definir'),
    p_whatsapp,
    COALESCE(p_telefone, p_whatsapp),
    p_contato,
    p_categoria,
    'Novo Lead',
    'Contato Inicial',
    'Em Conversa',
    'WhatsApp Direto',
    TO_CHAR(NOW(), 'DD/MM/YYYY'),
    NOW(),
    NOW(),
    NOW(),
    NOW()
  );

  -- Retornar resultado
  SELECT json_build_object(
    'success', true,
    'lead_id', v_lead_id,
    'lead_numero', v_lead_numero,
    'created_at', NOW()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ================================================================
-- 6. Permissões para as funções (acesso público via anon key)
-- ================================================================

GRANT EXECUTE ON FUNCTION public.atualizar_lead_por_whatsapp TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_lead_organico TO anon, authenticated;

-- ================================================================
-- PRONTO! Execute este script no Supabase SQL Editor
-- ================================================================

-- Verificar se os campos foram criados:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'leads_prospeccao' ORDER BY ordinal_position;
