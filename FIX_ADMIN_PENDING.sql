-- FIX: Desbloquear admin fmbp1981@gmail.com
-- Executar no Supabase Dashboard → SQL Editor → New query → Run
--
-- Problema: user_settings do admin tem pending_setup=true, o que bloqueia
-- o acesso mostrando a tela "Aguardando Aprovação".

UPDATE public.user_settings
SET
  pending_setup = false,
  role = 'admin',
  updated_at = NOW()
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'fmbp1981@gmail.com' LIMIT 1
);
