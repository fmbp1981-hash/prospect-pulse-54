/**
 * FLUXO AUXILIAR - KEEP-ALIVE SUPABASE
 * Equivalente nativo ao Schedule Trigger "5 Dias" + "Supabase Instancia Ativa" do n8n.
 * Mantém o projeto Supabase ativo em planos gratuitos.
 */

import { leadRepository } from '../repositories/lead.repository';

export async function runSupabaseKeepAlive(): Promise<void> {
  try {
    await leadRepository.keepAlive();
    console.log('[KeepAlive] Supabase pinged successfully');
  } catch (err) {
    console.error('[KeepAlive] Failed:', err);
  }
}
