-- ============================================================================
-- FIX: Permitir que admin veja e atualize user_settings de todos os usuários
-- ============================================================================
-- Problema: A policy SELECT em user_settings só permite auth.uid() = user_id,
-- então o admin não consegue ver usuários pendentes em /settings → Pendentes.
-- Solução: Adicionar OR public.is_admin() = true nas policies SELECT e UPDATE.
-- ============================================================================
-- EXECUTAR NO SUPABASE SQL EDITOR (https://supabase.com/dashboard)
-- ============================================================================

-- 1. Atualizar política SELECT para incluir admin
DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can view own settings or admins see all" ON public.user_settings;

CREATE POLICY "Users can view own settings or admins see all"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin() = true);

-- 2. Atualizar política UPDATE para incluir admin (necessário para aprovar usuários)
DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update own settings or admins update all" ON public.user_settings;

CREATE POLICY "Users can update own settings or admins update all"
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin() = true);

-- 3. Verificar se felipe.xpag@gmail.com tem user_settings criado
-- (descomente e execute manualmente se necessário)
-- SELECT u.id, u.email, us.role, us.pending_setup, us.created_at
-- FROM auth.users u
-- LEFT JOIN public.user_settings us ON u.id = us.user_id
-- WHERE u.email = 'felipe.xpag@gmail.com';
