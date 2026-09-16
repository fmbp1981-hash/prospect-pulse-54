-- Filtro/Qualificação pós-scrap (Fase 1 do framework de prospecção multicanal)
-- Ver docs/PROSPECCAO-MULTICANAL.md — seção 4.
--
-- Gate centralizado no banco (trigger) em vez de duplicado em cada caminho de
-- inserção (Edge Function de scrap, import de CSV, criação manual): garante que
-- todo lead, não importa a origem, passa pela mesma regra de qualificação.

ALTER TABLE public.leads_prospeccao
  ADD COLUMN IF NOT EXISTS qualification_status text NOT NULL DEFAULT 'pending'
    CHECK (qualification_status IN ('pending', 'qualified', 'disqualified', 'quarantine')),
  ADD COLUMN IF NOT EXISTS qualification_reason text,
  ADD COLUMN IF NOT EXISTS qualified_at timestamptz;

COMMENT ON COLUMN public.leads_prospeccao.qualification_status IS
  'Gate pós-scrap: pending (não avaliado) | qualified (passou no filtro mínimo) | '
  'quarantine (falta dado para decidir — precisa de enriquecimento) | '
  'disqualified (decisão humana/campanha de descarte, nunca automática)';

CREATE OR REPLACE FUNCTION public.compute_lead_qualification()
RETURNS TRIGGER AS $$
DECLARE
  has_contact_channel boolean;
  has_categoria boolean;
BEGIN
  -- Nunca sobrescreve uma decisão humana já tomada (qualified/disqualified são "sticky").
  -- Só recalcula quando o status ainda está pending ou quarantine.
  IF TG_OP = 'UPDATE' AND OLD.qualification_status NOT IN ('pending', 'quarantine') THEN
    RETURN NEW;
  END IF;

  has_categoria := NEW.categoria IS NOT NULL AND btrim(NEW.categoria) <> '';
  has_contact_channel := (NEW.telefone IS NOT NULL AND btrim(NEW.telefone) <> '')
    OR (NEW.whatsapp IS NOT NULL AND btrim(NEW.whatsapp) <> '')
    OR (NEW.email IS NOT NULL AND btrim(NEW.email) <> '')
    OR (NEW.website IS NOT NULL AND btrim(NEW.website) <> '');

  IF has_categoria AND has_contact_channel THEN
    NEW.qualification_status := 'qualified';
    NEW.qualification_reason := 'categoria e ao menos um canal de contato presentes';
    NEW.qualified_at := now();
  ELSE
    NEW.qualification_status := 'quarantine';
    NEW.qualification_reason := 'faltando categoria e/ou canal de contato utilizável';
    NEW.qualified_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_compute_lead_qualification ON public.leads_prospeccao;

CREATE TRIGGER trigger_compute_lead_qualification
  BEFORE INSERT OR UPDATE OF categoria, telefone, whatsapp, email, website
  ON public.leads_prospeccao
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_lead_qualification();

-- Índice para as telas/consultas que vão filtrar por status de qualificação
-- (ex: fila de "quarentena" para revisão/enriquecimento manual).
CREATE INDEX IF NOT EXISTS idx_leads_prospeccao_qualification_status
  ON public.leads_prospeccao (qualification_status);
