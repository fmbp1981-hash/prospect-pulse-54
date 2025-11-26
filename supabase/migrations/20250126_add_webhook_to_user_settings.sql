-- Migration: Adicionar campo whatsapp_webhook_url a user_settings
-- Data: 2025-01-26
-- Descrição: Persistir URL do webhook WhatsApp no banco de dados para cada usuário

-- Adicionar coluna whatsapp_webhook_url
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS whatsapp_webhook_url TEXT;

-- Adicionar comentário
COMMENT ON COLUMN public.user_settings.whatsapp_webhook_url
IS 'URL do webhook n8n/Evolution API para envio de mensagens WhatsApp';

-- Migrar dados do localStorage (opcional - será feito pelo frontend)
-- Esta coluna começa vazia e será preenchida quando o usuário configurar
