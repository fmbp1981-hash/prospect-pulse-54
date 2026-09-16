-- Corrige achado LGPD-03 (revisão de segurança do PR #8): `expires_at` em
-- linkedin_raw e enrichment_raw era um campo decorativo — nenhum mecanismo
-- lia/apagava linhas vencidas. Cria job pg_cron diário que efetivamente
-- expurga o payload bruto após o prazo de retenção documentado (90 dias),
-- conforme LGPD Art. 16 (eliminação após o término do tratamento).
--
-- Não afeta `contacts`/`companies` (dados já normalizados, com retenção
-- própria via o direito de eliminação da Seção 6.1 do PROSPECCAO-MULTICANAL.md)
-- — só os payloads brutos de auditoria/proveniência.

CREATE OR REPLACE FUNCTION public.purge_expired_raw_payloads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.linkedin_raw WHERE expires_at < now();
  DELETE FROM public.enrichment_raw WHERE expires_at < now();
END;
$$;

-- Roda todo dia às 03:00 UTC — horário de baixo tráfego, fora do expediente BRT.
-- Idempotente: remove o job antigo (se existir) antes de recriar, para a
-- migration poder ser reaplicada sem erro de "job already exists".
DO $$
BEGIN
  PERFORM cron.unschedule('purge-expired-raw-payloads');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job ainda não existia, tudo bem
END $$;

SELECT cron.schedule(
  'purge-expired-raw-payloads',
  '0 3 * * *',
  $$SELECT public.purge_expired_raw_payloads();$$
);
