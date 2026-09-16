-- Renomeia o gate de "qualification_status" para "icp_fit_status" — evita colisão
-- de nome com o estágio de pipeline "Qualificação" (LeadStatus), que é
-- conversacional (SDR) e mede outra coisa. Este campo mede fit com o ICP.
--
-- Também introduz icp_settings: perfil de cliente ideal configurado UMA VEZ
-- pela empresa, reaproveitado por todos os canais de prospecção (não é por
-- campanha/execução de scrap).

-- 1. Renomeia colunas em leads_prospeccao
ALTER TABLE public.leads_prospeccao RENAME COLUMN qualification_status TO icp_fit_status;
ALTER TABLE public.leads_prospeccao RENAME COLUMN qualification_reason TO icp_fit_reason;
ALTER TABLE public.leads_prospeccao RENAME COLUMN qualified_at TO icp_fit_evaluated_at;

-- 2. Migra vocabulário de valores existentes (nenhuma linha tinha 'qualified'
--    ainda, mas a migração de dados fica registrada por segurança/idempotência)
UPDATE public.leads_prospeccao SET icp_fit_status = 'fit' WHERE icp_fit_status = 'qualified';

-- 3. Substitui o CHECK constraint pelo vocabulário expandido
ALTER TABLE public.leads_prospeccao DROP CONSTRAINT IF EXISTS leads_prospeccao_qualification_status_check;
ALTER TABLE public.leads_prospeccao
  ADD CONSTRAINT leads_prospeccao_icp_fit_status_check
  CHECK (icp_fit_status IN ('pending', 'fit', 'no_fit', 'quarantine', 'disqualified'));

COMMENT ON COLUMN public.leads_prospeccao.icp_fit_status IS
  'Match com o Perfil de Cliente Ideal (ICP) configurado pela empresa em icp_settings. '
  'NÃO confundir com o estágio de pipeline "Qualificação" (coluna status/LeadStatus), '
  'que é conversacional e conduzido pelo agente de SDR. '
  'pending (não avaliado) | fit (bate com o ICP configurado) | '
  'no_fit (dado suficiente, mas fora do perfil desejado) | '
  'quarantine (falta dado pra decidir) | '
  'disqualified (decisão humana/campanha, nunca setado automaticamente)';

ALTER INDEX IF EXISTS idx_leads_prospeccao_qualification_status
  RENAME TO idx_leads_prospeccao_icp_fit_status;

-- 4. Perfil de Cliente Ideal — configuração única por empresa/usuário.
--    Canal-agnóstico: os mesmos critérios valem para Google Maps, LinkedIn, etc.
--    Array vazio em qualquer atributo = "sem restrição" naquele atributo.
CREATE TABLE public.icp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Atributos hoje disponíveis em leads_prospeccao (canal Google Maps)
  target_categories text[] NOT NULL DEFAULT '{}',
  target_cities text[] NOT NULL DEFAULT '{}',

  -- Atributos hoje disponíveis em companies/contacts (canal LinkedIn — fase futura)
  target_states text[] NOT NULL DEFAULT '{}',
  target_seniorities text[] NOT NULL DEFAULT '{}',
  target_departments text[] NOT NULL DEFAULT '{}',
  min_employee_count integer,
  max_employee_count integer,

  require_contact_channel boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.icp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own icp_settings"
  ON public.icp_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_icp_settings_updated_at
  BEFORE UPDATE ON public.icp_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.icp_settings IS
  'Perfil de Cliente Ideal (ICP), configurado uma única vez pela empresa. Usado por '
  'todos os canais de prospecção para decidir se um lead/contato coletado tem os '
  'atributos que a empresa pretende prospectar (maior potencial de conversão). '
  'Não é por campanha/execução — é configuração de conta.';

-- 5. Recria a função/trigger de fit, agora consultando icp_settings
DROP TRIGGER IF EXISTS trigger_compute_lead_qualification ON public.leads_prospeccao;
DROP FUNCTION IF EXISTS public.compute_lead_qualification();

CREATE OR REPLACE FUNCTION public.compute_lead_icp_fit()
RETURNS TRIGGER AS $$
DECLARE
  cfg RECORD;
  has_contact_channel boolean;
  has_categoria boolean;
  categoria_match boolean;
  cidade_match boolean;
BEGIN
  -- Nunca sobrescreve uma decisão já consolidada (fit/disqualified são "sticky").
  IF TG_OP = 'UPDATE' AND OLD.icp_fit_status NOT IN ('pending', 'quarantine', 'no_fit') THEN
    RETURN NEW;
  END IF;

  has_categoria := NEW.categoria IS NOT NULL AND btrim(NEW.categoria) <> '';
  has_contact_channel := (NEW.telefone IS NOT NULL AND btrim(NEW.telefone) <> '')
    OR (NEW.whatsapp IS NOT NULL AND btrim(NEW.whatsapp) <> '')
    OR (NEW.email IS NOT NULL AND btrim(NEW.email) <> '')
    OR (NEW.website IS NOT NULL AND btrim(NEW.website) <> '');

  SELECT * INTO cfg FROM public.icp_settings WHERE user_id = NEW.user_id;

  -- Critério mínimo de dado utilizável — independe de ICP configurado ou não
  IF NOT has_categoria OR (coalesce(cfg.require_contact_channel, true) AND NOT has_contact_channel) THEN
    NEW.icp_fit_status := 'quarantine';
    NEW.icp_fit_reason := 'faltando categoria e/ou canal de contato utilizável';
    NEW.icp_fit_evaluated_at := NULL;
    RETURN NEW;
  END IF;

  -- Sem ICP configurado ainda (ou configurado sem nenhuma restrição) => não filtra por perfil,
  -- só exige o critério mínimo de dado já checado acima.
  IF cfg.user_id IS NULL
     OR (coalesce(array_length(cfg.target_categories, 1), 0) = 0
         AND coalesce(array_length(cfg.target_cities, 1), 0) = 0) THEN
    NEW.icp_fit_status := 'fit';
    NEW.icp_fit_reason := 'sem perfil de cliente ideal configurado — critério mínimo de dado atendido';
    NEW.icp_fit_evaluated_at := now();
    RETURN NEW;
  END IF;

  categoria_match := coalesce(array_length(cfg.target_categories, 1), 0) = 0
    OR EXISTS (SELECT 1 FROM unnest(cfg.target_categories) t WHERE NEW.categoria ILIKE t);
  cidade_match := coalesce(array_length(cfg.target_cities, 1), 0) = 0
    OR (NEW.cidade IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(cfg.target_cities) t WHERE NEW.cidade ILIKE t));

  IF categoria_match AND cidade_match THEN
    NEW.icp_fit_status := 'fit';
    NEW.icp_fit_reason := 'categoria e cidade dentro do perfil de cliente ideal configurado';
    NEW.icp_fit_evaluated_at := now();
  ELSE
    NEW.icp_fit_status := 'no_fit';
    NEW.icp_fit_reason := CASE
      WHEN NOT categoria_match THEN 'categoria fora do perfil de cliente ideal configurado'
      ELSE 'cidade fora do perfil de cliente ideal configurado'
    END;
    NEW.icp_fit_evaluated_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

CREATE TRIGGER trigger_compute_lead_icp_fit
  BEFORE INSERT OR UPDATE OF categoria, telefone, whatsapp, email, website
  ON public.leads_prospeccao
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_lead_icp_fit();
