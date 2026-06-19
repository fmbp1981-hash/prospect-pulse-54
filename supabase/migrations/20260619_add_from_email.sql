-- Adiciona from_email por tenant em user_settings
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_settings'
      AND column_name  = 'from_email'
  ) THEN
    ALTER TABLE public.user_settings ADD COLUMN from_email TEXT;
    COMMENT ON COLUMN public.user_settings.from_email
      IS 'Endereço de remetente de e-mail por tenant (ex: contato@intellixai.com.br)';
  END IF;
END $$;
