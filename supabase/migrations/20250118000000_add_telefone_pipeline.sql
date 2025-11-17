-- Adicionar novas colunas à tabela leads_prospeccao

-- Coluna para telefone (não WhatsApp)
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS telefone TEXT;

-- Coluna para estágio do pipeline/funil
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS estagio_pipeline TEXT DEFAULT 'Novo';

-- Comentários para documentação
COMMENT ON COLUMN public.leads_prospeccao.telefone IS 'Telefone que não é WhatsApp';
COMMENT ON COLUMN public.leads_prospeccao.telefone_whatsapp IS 'Telefone com WhatsApp ativo';
COMMENT ON COLUMN public.leads_prospeccao.estagio_pipeline IS 'Estágio do lead no funil de vendas (sincronizado com Kanban)';

-- Criar índice para melhorar performance de queries por estágio
CREATE INDEX IF NOT EXISTS idx_leads_estagio_pipeline
ON public.leads_prospeccao(estagio_pipeline);
