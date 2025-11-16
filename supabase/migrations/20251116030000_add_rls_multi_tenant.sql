-- Adicionar Row Level Security (RLS) e Multi-Tenant Support
-- Data: 2025-11-16

-- ============= ADICIONAR COLUNA user_id =============
-- Adiciona coluna user_id para associar leads aos usuários
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Criar índice para melhor performance nas queries filtradas por usuário
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON public.leads_prospeccao(user_id);

-- ============= PREENCHER user_id PARA DADOS EXISTENTES =============
-- ATENÇÃO: Em produção, você deve definir manualmente o user_id correto
-- Para desenvolvimento, vamos deixar NULL (serão visíveis apenas para admins)
-- UPDATE public.leads_prospeccao SET user_id = 'seu-user-id-aqui' WHERE user_id IS NULL;

-- ============= HABILITAR RLS =============
-- RLS já está habilitado, mas vamos garantir
ALTER TABLE public.leads_prospeccao ENABLE ROW LEVEL SECURITY;

-- ============= REMOVER POLICIES ANTIGAS =============
-- Remover policies antigas que permitiam acesso total
DROP POLICY IF EXISTS "Permitir leitura de todos os leads" ON public.leads_prospeccao;
DROP POLICY IF EXISTS "Permitir inserção de leads" ON public.leads_prospeccao;
DROP POLICY IF EXISTS "Permitir atualização de leads" ON public.leads_prospeccao;

-- ============= CRIAR NOVAS POLICIES COM RLS =============

-- 1. SELECT: Usuário pode ver apenas seus próprios leads
CREATE POLICY "Users can view own leads"
  ON public.leads_prospeccao
  FOR SELECT
  USING (auth.uid() = user_id);

-- 2. INSERT: Usuário pode inserir leads (user_id será preenchido automaticamente)
CREATE POLICY "Users can insert own leads"
  ON public.leads_prospeccao
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 3. UPDATE: Usuário pode atualizar apenas seus próprios leads
CREATE POLICY "Users can update own leads"
  ON public.leads_prospeccao
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. DELETE: Usuário pode deletar apenas seus próprios leads
CREATE POLICY "Users can delete own leads"
  ON public.leads_prospeccao
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============= FUNCTION PARA AUTO-PREENCHER user_id =============
-- Cria função que preenche user_id automaticamente ao inserir
CREATE OR REPLACE FUNCTION public.set_user_id_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se user_id não foi fornecido, preenche com o usuário autenticado
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  -- Validação: garantir que user_id corresponde ao usuário autenticado
  -- (previne que usuário insira leads em nome de outro)
  IF NEW.user_id IS NOT NULL AND NEW.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Você não pode criar leads para outro usuário';
  END IF;

  RETURN NEW;
END;
$$;

-- ============= TRIGGER PARA AUTO-PREENCHER user_id =============
DROP TRIGGER IF EXISTS set_user_id_trigger ON public.leads_prospeccao;

CREATE TRIGGER set_user_id_trigger
  BEFORE INSERT ON public.leads_prospeccao
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_id_on_insert();

-- ============= COMENTÁRIOS PARA DOCUMENTAÇÃO =============
COMMENT ON COLUMN public.leads_prospeccao.user_id IS 'ID do usuário proprietário do lead (multi-tenant)';
COMMENT ON POLICY "Users can view own leads" ON public.leads_prospeccao IS 'Usuários podem ver apenas seus próprios leads';
COMMENT ON POLICY "Users can insert own leads" ON public.leads_prospeccao IS 'Usuários podem inserir leads (user_id preenchido automaticamente)';
COMMENT ON POLICY "Users can update own leads" ON public.leads_prospeccao IS 'Usuários podem atualizar apenas seus próprios leads';
COMMENT ON POLICY "Users can delete own leads" ON public.leads_prospeccao IS 'Usuários podem deletar apenas seus próprios leads';
COMMENT ON FUNCTION public.set_user_id_on_insert() IS 'Auto-preenche user_id com o usuário autenticado ao inserir lead';

-- ============= ATUALIZAR EDGE FUNCTION PERMISSIONS =============
-- Garantir que Edge Functions podem inserir com user_id
-- A Edge Function deve passar o user_id no payload ou usar service_role_key
