/**
 * FLUXO 2 - TENANT RESOLVER
 * Equivalente nativo ao node "HTTP Request (get_user_by_evolution_instance)" do n8n.
 * Resolve qual usuário/empresa é dono da instância Evolution API.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export interface TenantContext {
  userId: string;
  companyName: string;
  instanceName: string;
  agentEnabled: boolean;
  openaiApiKey?: string;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

export async function resolveTenantByInstance(
  instanceName: string
): Promise<TenantContext | null> {
  const supabase = getServiceClient();

  // Chama a RPC get_user_by_evolution_instance (mesma que o n8n usava)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .rpc('get_user_by_evolution_instance', { p_instance_name: instanceName });

  if (error) {
    console.warn(
      `[TenantResolver] RPC error for instance "${instanceName}":`,
      error.message
    );
    return null;
  }

  // A RPC retorna RETURNS json (objeto único), não uma tabela/array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = data as { success: boolean; user_id?: string; company_name?: string } | null;

  if (!result || !result.success || !result.user_id) {
    console.warn(
      `[TenantResolver] No tenant found for instance "${instanceName}"`,
      result
    );
    return null;
  }

  // Busca agent_enabled de user_settings
  const supabase2 = getServiceClient();
  const { data: settings } = await supabase2
    .from('user_settings')
    .select('agent_enabled, openai_api_key')
    .eq('user_id', result.user_id)
    .single();

  const s = settings as { agent_enabled?: boolean; openai_api_key?: string } | null;

  return {
    userId: result.user_id,
    companyName: result.company_name || '',
    instanceName,
    agentEnabled: s?.agent_enabled ?? true,
    openaiApiKey: s?.openai_api_key || undefined,
  };
}

/**
 * Verifica se a conversa está em modo "finalizado" (#finalizado).
 * Equivalente ao node "If Finalizado?" do n8n.
 */
export function isFinalizationCommand(message: string): boolean {
  return message.trim().toLowerCase() === '#finalizado';
}
