-- ============================================
-- Migration: Adicionar suporte multi-tenant para empresas específicas
-- Data: 2025-12-11
-- Objetivo: Identificar leads por empresa/tenant (ex: Xpag) e origem (app vs site)
-- ============================================

-- NOTA: Campo 'empresa' já existe e contém o nome da empresa PROSPECTADA
-- Vamos adicionar novos campos para identificar o TENANT (dono do lead) e ORIGEM

-- 1. Adicionar coluna 'tenant_id' para identificar a empresa/tenant DONA do lead
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- 2. Adicionar coluna 'origem' para identificar a fonte do lead
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'google_places';

-- 3. Criar índices para consultas
CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON public.leads_prospeccao(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_origem ON public.leads_prospeccao(origem);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_origem ON public.leads_prospeccao(tenant_id, origem);

-- 4. Adicionar comentários para documentação
COMMENT ON COLUMN public.leads_prospeccao.empresa
IS 'Nome da empresa PROSPECTADA (ex: "Restaurante do João", "Padaria Silva")';

COMMENT ON COLUMN public.leads_prospeccao.tenant_id
IS 'Identificador da empresa/tenant DONA do lead (ex: xpag, intellix, etc). NULL para usuários comuns.';

COMMENT ON COLUMN public.leads_prospeccao.origem
IS 'Origem do lead: google_places (prospecção via API), app (app interno), website (site), manual';

-- 5. Criar função helper para identificar o tenant do usuário
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(user_uuid UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  company_name TEXT;
BEGIN
  -- Busca o nome da empresa do usuário na tabela user_settings
  SELECT company_name INTO company_name
  FROM public.user_settings
  WHERE user_id = user_uuid;

  -- Retorna o company_name em lowercase (normalizado)
  IF company_name IS NOT NULL AND company_name != '' THEN
    RETURN LOWER(TRIM(company_name));
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.get_user_tenant_id(UUID)
IS 'Retorna o tenant_id (company_name normalizado) do usuário a partir da tabela user_settings';

-- 6. Criar trigger para auto-preencher campos 'tenant_id' e 'origem' na inserção
CREATE OR REPLACE FUNCTION public.set_tenant_and_origem_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_tenant TEXT;
BEGIN
  -- Se tenant_id não foi fornecido, tenta pegar da configuração do usuário
  IF NEW.tenant_id IS NULL AND NEW.user_id IS NOT NULL THEN
    user_tenant := public.get_user_tenant_id(NEW.user_id);

    -- Se encontrou configuração de tenant, preenche
    IF user_tenant IS NOT NULL THEN
      NEW.tenant_id := user_tenant;
    END IF;
  END IF;

  -- Ajusta origem se necessário
  -- Se tem tenant_id definido e origem ainda é 'google_places', marca como 'app'
  IF NEW.tenant_id IS NOT NULL AND (NEW.origem IS NULL OR NEW.origem = 'google_places') THEN
    NEW.origem := 'app';
  END IF;

  -- Se não tem tenant_id e origem é NULL, mantém default 'google_places'
  IF NEW.origem IS NULL THEN
    NEW.origem := 'google_places';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop trigger antigo se existir
DROP TRIGGER IF EXISTS set_tenant_trigger ON public.leads_prospeccao;

-- Criar trigger
CREATE TRIGGER set_tenant_trigger
  BEFORE INSERT ON public.leads_prospeccao
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tenant_and_origem_on_insert();

COMMENT ON FUNCTION public.set_tenant_and_origem_on_insert()
IS 'Auto-preenche campos tenant_id e origem baseado na configuração do usuário. Se tenant existe, origem é app.';

-- ============================================
-- CONCLUÍDO! ✅
-- ============================================
--
-- Próximos passos:
-- 1. Configurar company_name='xpag' na tabela user_settings para usuários da Xpag
-- 2. Leads criados por usuários Xpag serão automaticamente marcados com:
--    - tenant_id='xpag'
--    - origem='app'
--    - empresa='Nome da Empresa Prospectada' (preenchido normalmente)
-- 3. Leads do site Xpag devem ser inseridos com:
--    - tenant_id='xpag'
--    - origem='website'
-- 4. Usuários comuns terão:
--    - tenant_id=NULL
--    - origem='google_places'
