-- ============================================================================
-- LIMPEZA: Remover todos os usuários pendentes (exceto admin)
-- ============================================================================
-- Remove user_settings E auth.users de todos que têm pending_setup=true.
-- Isso permite que esses usuários se cadastrem novamente do zero.
-- O admin fmbp1981@gmail.com NÃO será afetado.
-- ============================================================================
-- EXECUTAR NO SUPABASE SQL EDITOR
-- ============================================================================

-- 1. Ver quem será removido (execute primeiro para conferir)
SELECT u.id, u.email, us.role, us.pending_setup, us.created_at
FROM auth.users u
LEFT JOIN public.user_settings us ON u.id = us.user_id
WHERE u.email != 'fmbp1981@gmail.com'
  AND (us.pending_setup = true OR us.user_id IS NULL)
ORDER BY u.created_at;

-- 2. Remover user_settings dos pendentes (exceto admin)
DELETE FROM public.user_settings
WHERE pending_setup = true
  AND user_id != (SELECT id FROM auth.users WHERE email = 'fmbp1981@gmail.com' LIMIT 1);

-- 3. Remover da auth.users para permitir novo cadastro
-- (só remove quem NÃO tem mais user_settings, ou seja, os pendentes que acabamos de limpar)
DELETE FROM auth.users
WHERE email != 'fmbp1981@gmail.com'
  AND id NOT IN (SELECT user_id FROM public.user_settings WHERE user_id IS NOT NULL);
