-- Suporte a enriquecimento via Firecrawl (fallback quando LinkedIn não traz
-- email/telefone) — ver references/architecture.md, seção 9.
--
-- 1) contacts.phone_source: espelha email_source (já existente), mesma
--    disciplina de nunca gravar um valor sem registrar a origem.
-- 2) enrichment_raw: proveniência genérica para conectores não-LinkedIn
--    (Firecrawl hoje, outros no futuro). Não reaproveita linkedin_raw —
--    aquela tabela é semanticamente específica de LinkedIn (source_tool
--    CHECK IN ('linkedin_scraper','crosslinked','mock')).

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_source text;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_phone_requires_source
  CHECK (phone IS NULL OR phone_source IS NOT NULL);

COMMENT ON COLUMN public.contacts.phone_source IS
  'Origem do telefone (ex: firecrawl_company_site, linkedin_profile_text). '
  'Nunca gravar phone sem phone_source — mesma disciplina de email_source.';

CREATE TABLE public.enrichment_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  source_tool text NOT NULL CHECK (source_tool IN ('firecrawl_scrape', 'firecrawl_map', 'mock')),
  source_url text,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  raw_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrichment_raw_requires_company_or_contact CHECK (company_id IS NOT NULL OR contact_id IS NOT NULL)
);

ALTER TABLE public.enrichment_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own enrichment_raw"
  ON public.enrichment_raw FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_enrichment_raw_user_id ON public.enrichment_raw(user_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_raw_company_id ON public.enrichment_raw(company_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_raw_contact_id ON public.enrichment_raw(contact_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_raw_expires_at ON public.enrichment_raw(expires_at);

COMMENT ON TABLE public.enrichment_raw IS
  'Payload bruto de enriquecimento via conectores não-LinkedIn (Firecrawl, etc.), '
  'para auditoria/LGPD. Retido por 90 dias (expires_at), mesmo padrão de linkedin_raw.';
