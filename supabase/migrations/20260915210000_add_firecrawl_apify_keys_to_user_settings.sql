-- Chaves de API por tenant para Firecrawl e Apify, seguindo o mesmo padrão
-- já usado para openai_api_key/resend_api_key: cada cliente que adquirir o
-- sistema configura suas próprias credenciais em Configurações, com
-- fallback para variável de ambiente (útil em dev/self-host).

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS firecrawl_api_key text,
  ADD COLUMN IF NOT EXISTS apify_api_key text;

COMMENT ON COLUMN public.user_settings.firecrawl_api_key IS
  'Chave de API Firecrawl por tenant (sobrepõe variável de ambiente FIRECRAWL_API_KEY) — enriquecimento de site institucional.';
COMMENT ON COLUMN public.user_settings.apify_api_key IS
  'Chave de API Apify por tenant (sobrepõe variável de ambiente APIFY_API_KEY) — conector LinkedIn.';
