-- ============= ADICIONAR POLÍTICA DE ADMIN PARA DELETE =============
-- Este SQL adiciona políticas que permitem que ADMINS deletem todos os leads
-- Execute este script no SQL Editor do Supabase Dashboard

-- 1. Criar função para verificar se usuário é admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 2. Policy: Admins podem ver TODOS os leads (incluindo de outros usuários)
DROP POLICY IF EXISTS "Admins can view all leads" ON public.leads_prospeccao;
CREATE POLICY "Admins can view all leads"
  ON public.leads_prospeccao
  FOR SELECT
  USING (public.is_admin());

-- 3. Policy: Admins podem deletar TODOS os leads
DROP POLICY IF EXISTS "Admins can delete all leads" ON public.leads_prospeccao;
CREATE POLICY "Admins can delete all leads"
  ON public.leads_prospeccao
  FOR DELETE
  USING (public.is_admin());

-- 4. Policy: Admins podem atualizar TODOS os leads
DROP POLICY IF EXISTS "Admins can update all leads" ON public.leads_prospeccao;
CREATE POLICY "Admins can update all leads"
  ON public.leads_prospeccao
  FOR UPDATE
  USING (public.is_admin());

-- ============= PARA DELETAR TODOS OS LEADS AGORA =============
-- Rode este comando separadamente APENAS se quiser limpar todos os leads:
-- DELETE FROM public.leads_prospeccao;

-- ============= VERIFICAR SE O USUÁRIO É ADMIN =============
-- Rode este comando para verificar se seu usuário é admin:
-- SELECT * FROM public.user_roles WHERE user_id = auth.uid();
