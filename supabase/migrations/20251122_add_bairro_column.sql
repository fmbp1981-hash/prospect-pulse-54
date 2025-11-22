-- Add bairro column to leads_prospeccao table
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS bairro TEXT;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_leads_bairro
ON public.leads_prospeccao(bairro);

-- Comment on column
COMMENT ON COLUMN public.leads_prospeccao.bairro IS 'Bairro ou região específica do lead';
