-- Migration: Audit Logs v2 — user_email + admin policy
-- Data: 2026-05-07
-- Descrição: Adiciona user_email desnormalizado e policy de admin para ver todos os logs

-- 1. Adicionar coluna user_email
ALTER TABLE public.audit_logs
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- 2. Índice para busca/filtro por email
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_email
  ON public.audit_logs(user_email);

-- 3. Policy: Admin pode ver TODOS os logs de auditoria
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (public.is_admin());
