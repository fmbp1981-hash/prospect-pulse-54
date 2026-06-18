-- Adiciona chave Resend por tenant em user_settings
-- Permite que cada tenant use sua própria chave de e-mail transacional (Resend)
-- Se não informado, o sistema usa RESEND_API_KEY do ambiente (variável Vercel global)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_settings'
      AND column_name  = 'resend_api_key'
  ) THEN
    ALTER TABLE public.user_settings ADD COLUMN resend_api_key TEXT;
    COMMENT ON COLUMN public.user_settings.resend_api_key
      IS 'Chave Resend por tenant — sobrepõe a variável de ambiente RESEND_API_KEY';
  END IF;
END $$;
