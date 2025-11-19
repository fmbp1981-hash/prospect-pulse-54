-- Migration: Sistema de Roles e Permissões
-- Data: 2025-01-19
-- Descrição: Implementa sistema RBAC (Role-Based Access Control)

-- 1. Criar ENUM para roles
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'operador', 'visualizador');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Adicionar coluna role na tabela user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'operador' NOT NULL;

-- 3. Atualizar registros existentes (caso não tenham role)
UPDATE public.user_settings
SET role = 'operador'
WHERE role IS NULL;

-- 4. Criar função para verificar se usuário é admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_settings
    WHERE user_id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Criar função para verificar se usuário tem permissão de escrita
CREATE OR REPLACE FUNCTION public.can_write()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_settings
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'operador')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Criar função para obter role do usuário atual
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role AS $$
DECLARE
  user_role_value user_role;
BEGIN
  SELECT role INTO user_role_value
  FROM public.user_settings
  WHERE user_id = auth.uid();

  RETURN COALESCE(user_role_value, 'operador');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Atualizar política DELETE de leads para verificar permissão de admin
DROP POLICY IF EXISTS "Users can delete own leads" ON public.leads_prospeccao;
CREATE POLICY "Users can delete own leads"
  ON public.leads_prospeccao FOR DELETE
  USING (
    auth.uid() = user_id
    AND (
      public.is_admin() = true
      OR public.can_write() = true
    )
  );

-- 8. Criar política especial para bulk delete (apenas admin)
CREATE POLICY "Only admins can bulk delete"
  ON public.leads_prospeccao FOR DELETE
  USING (public.is_admin() = true);

-- 9. Política de UPDATE: Admin e Operador podem atualizar
DROP POLICY IF EXISTS "Users can update own leads" ON public.leads_prospeccao;
CREATE POLICY "Users can update own leads"
  ON public.leads_prospeccao FOR UPDATE
  USING (
    auth.uid() = user_id
    AND public.can_write() = true
  );

-- 10. Política de INSERT: Admin e Operador podem inserir
DROP POLICY IF EXISTS "Users can insert own leads" ON public.leads_prospeccao;
CREATE POLICY "Users can insert own leads"
  ON public.leads_prospeccao FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.can_write() = true
  );

-- 11. SELECT permanece acessível para todos os roles (incluindo visualizador)
-- (política já existe, não precisa modificar)

-- 12. Criar tabela de audit para mudanças de role (opcional)
CREATE TABLE IF NOT EXISTS public.role_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users(id),
  old_role user_role,
  new_role user_role NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS na tabela role_changes
ALTER TABLE public.role_changes ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver histórico de mudanças de role
CREATE POLICY "Only admins can view role changes"
  ON public.role_changes FOR SELECT
  USING (public.is_admin() = true);

-- 13. Criar trigger para registrar mudanças de role
CREATE OR REPLACE FUNCTION public.log_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO public.role_changes (user_id, changed_by, old_role, new_role)
    VALUES (NEW.user_id, auth.uid(), OLD.role, NEW.role);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_role_change
  AFTER UPDATE OF role ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.log_role_change();

-- 14. Atualizar política de user_settings para permitir admins gerenciarem roles
DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
CREATE POLICY "Users can update own settings or admins can update any"
  ON public.user_settings FOR UPDATE
  USING (
    auth.uid() = user_id
    OR public.is_admin() = true
  );

-- 15. Adicionar comentários
COMMENT ON TYPE user_role IS 'Tipos de roles: admin (acesso total), operador (CRUD de leads), visualizador (apenas leitura)';
COMMENT ON COLUMN public.user_settings.role IS 'Role do usuário no sistema RBAC';
COMMENT ON TABLE public.role_changes IS 'Histórico de mudanças de roles de usuários';
COMMENT ON FUNCTION public.is_admin() IS 'Retorna true se usuário atual é admin';
COMMENT ON FUNCTION public.can_write() IS 'Retorna true se usuário pode criar/editar/deletar (admin ou operador)';
COMMENT ON FUNCTION public.get_user_role() IS 'Retorna o role do usuário atual';
