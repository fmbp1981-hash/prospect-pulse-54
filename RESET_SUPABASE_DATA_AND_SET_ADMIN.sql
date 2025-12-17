-- ATENÇÃO: ESTE SCRIPT APAGA DADOS.
-- Execute apenas no ambiente correto (dev/staging/prod) e com backup, se necessário.
--
-- Objetivo:
-- 1) Limpar todos os dados de negócio do sistema (tabelas do schema public)
-- 2) Definir o usuário fmbp1981@gmail.com como ADMIN (role='admin' em public.user_settings)
--
-- Como usar:
-- - Supabase Dashboard → SQL Editor → New query → cole este conteúdo → Run.
--
-- Observações:
-- - Este script NÃO apaga usuários do Supabase Auth (auth.users) por segurança.
-- - Se o usuário fmbp1981@gmail.com ainda não existir no Auth, crie-o antes
--   (Auth → Users → Invite user / Create user), depois rode este script.

BEGIN;

-- 1) Validar que o usuário admin existe no Auth
DO $$
DECLARE
  admin_uid UUID;
BEGIN
  SELECT id
    INTO admin_uid
  FROM auth.users
  WHERE email = 'fmbp1981@gmail.com'
  LIMIT 1;

  IF admin_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário % não existe em auth.users. Crie o usuário no Supabase Auth e rode novamente.', 'fmbp1981@gmail.com';
  END IF;
END $$;

-- 2) Limpar dados das tabelas do sistema
-- Ajuste a lista se você tiver tabelas adicionais.
-- Usamos CASCADE para lidar com FKs (ex: whatsapp_conversations → leads_prospeccao).
TRUNCATE TABLE
  public.whatsapp_conversations,
  public.lead_notes,
  public.lead_interactions,
  public.search_history,
  public.audit_logs,
  public.role_changes,
  public.leads_prospeccao,
  public.user_settings
RESTART IDENTITY CASCADE;

-- 3) Recriar/atualizar user_settings do admin com role='admin'
INSERT INTO public.user_settings (user_id, role, created_at, updated_at)
SELECT
  u.id,
  'admin'::public.user_role,
  NOW(),
  NOW()
FROM auth.users u
WHERE u.email = 'fmbp1981@gmail.com'
ON CONFLICT (user_id)
DO UPDATE SET
  role = EXCLUDED.role,
  updated_at = NOW();

COMMIT;

-- Opcional (NÃO RECOMENDADO): apagar usuários do Auth.
-- Se você realmente quer "zerar tudo" incluindo contas, descomente e execute com cuidado.
-- Isso vai remover TODOS os usuários (e pode quebrar integrações/testes).
--
-- BEGIN;
-- DELETE FROM auth.users;
-- COMMIT;
