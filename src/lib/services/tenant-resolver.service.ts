/**
 * FLUXO 2 - TENANT RESOLVER
 * Contexto do usuário que atende as mensagens recebidas (dono dos leads,
 * configuração do agente). Nunca é resolvido por dado do payload (instância,
 * número): só pela conexão autenticada (organização) ou pelo token do webhook.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { connectionsRepository } from '@/lib/repositories/connections.repository';

export interface TenantContext {
  userId: string;
  companyName: string;
  agentEnabled: boolean;
  openaiApiKey?: string;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

/**
 * Resolve o usuário pelo token secreto do webhook legado (user_settings.webhook_token),
 * usado só por /api/webhooks/evolution/<token> até o corte (Task 12 remove).
 * O chamador deve validar o formato do token antes (isWellFormedWebhookToken).
 */
export async function resolveTenantByWebhookToken(
  token: string
): Promise<TenantContext | null> {
  const supabase = getServiceClient();
  const { data: row, error } = await supabase
    .from('user_settings')
    .select('user_id, company_name, agent_enabled, openai_api_key')
    .eq('webhook_token', token)
    .maybeSingle();

  if (error) {
    console.warn('[TenantResolver] resolveTenantByWebhookToken error:', error.message);
    return null;
  }

  if (!row?.user_id) return null;

  return {
    userId: row.user_id,
    companyName: row.company_name || '',
    agentEnabled: row.agent_enabled ?? true,
    openaiApiKey: row.openai_api_key || undefined,
  };
}

/**
 * Contexto de atendimento da organização dona da conexão do webhook:
 * o usuário responsável (admin mais antigo, ou o membro mais antigo) e as
 * configurações dele. Sem membro → null (o evento não é processado).
 */
export async function resolveTenantByOrganization(
  organizationId: string
): Promise<TenantContext | null> {
  const userId = await connectionsRepository.findOrganizationResponsibleUserId(organizationId);
  if (!userId) return null;

  const { data: row, error } = await getServiceClient()
    .from('user_settings')
    .select('company_name, agent_enabled, openai_api_key')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`resolveTenantByOrganization error: ${error.message}`);

  return {
    userId,
    companyName: row?.company_name || '',
    agentEnabled: row?.agent_enabled ?? true,
    openaiApiKey: row?.openai_api_key || undefined,
  };
}

/**
 * Verifica se a conversa está em modo "finalizado" (#finalizado).
 * Equivalente ao node "If Finalizado?" do n8n.
 */
export function isFinalizationCommand(message: string): boolean {
  return message.trim().toLowerCase() === '#finalizado';
}
