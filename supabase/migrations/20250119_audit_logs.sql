-- Migration: Criar tabela de logs de auditoria
-- Data: 2025-01-19
-- Descrição: Tabela para armazenar logs de todas as ações críticas do sistema

-- Criar tabela audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity_type ON public.audit_logs(entity_type);

-- Habilitar RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem ver apenas seus próprios logs
CREATE POLICY "Users can view own audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Política: Sistema pode inserir logs (via trigger ou função)
CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Adicionar comentários
COMMENT ON TABLE public.audit_logs IS 'Logs de auditoria de todas as ações críticas do sistema';
COMMENT ON COLUMN public.audit_logs.action IS 'Tipo de ação realizada (EXPORT_LEADS, WHATSAPP_DISPATCH, etc)';
COMMENT ON COLUMN public.audit_logs.entity_type IS 'Tipo de entidade afetada (lead, prospection, etc)';
COMMENT ON COLUMN public.audit_logs.entity_id IS 'ID da entidade afetada (opcional)';
COMMENT ON COLUMN public.audit_logs.details IS 'Detalhes adicionais em formato JSON';
