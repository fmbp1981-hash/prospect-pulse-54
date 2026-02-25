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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = data as Array<{ user_id: string; company_name: string }> | null;

  if (!rows || rows.length === 0) {
    console.warn(
      `[TenantResolver] No tenant found for instance "${instanceName}"`
    );
    return null;
  }

  const row = rows[0];

  return {
    userId: row.user_id,
    companyName: row.company_name,
    instanceName,
  };
}

/**
 * Verifica se a conversa está em modo "finalizado" (#finalizado).
 * Equivalente ao node "If Finalizado?" do n8n.
 */
export function isFinalizationCommand(message: string): boolean {
  return message.trim().toLowerCase() === '#finalizado';
}
