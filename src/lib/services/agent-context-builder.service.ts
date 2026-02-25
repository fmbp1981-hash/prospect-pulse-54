/**
 * FLUXO 3B - AGENT CONTEXT BUILDER
 * Equivalente nativo ao node "Edit Fields" (Prepara Contexto) do n8n.
 * Consolida todos os dados necessários para o AI Agent.
 */

import type { NormalizedMessage } from './message-normalizer.service';
import type { ProcessedMessage } from '../handlers/message-type.handler';
import { conversationRepository } from '../repositories/conversation.repository';
import { formatConversationHistory } from './history-formatter.service';
import type { Database } from '@/integrations/supabase/types';
import type { TenantContext } from './tenant-resolver.service';

type LeadRow = Database['public']['Tables']['leads_prospeccao']['Row'];

export interface AgentContext {
  lead: LeadRow;
  isNewLead: boolean;
  processedMessage: string;
  formattedHistory: string;
  instanceName: string;
  tenant: TenantContext;
  contactName: string;
  whatsapp: string;
}

export async function buildAgentContext(
  normalized: NormalizedMessage,
  processed: ProcessedMessage,
  lead: LeadRow,
  isNewLead: boolean,
  tenant: TenantContext
): Promise<AgentContext> {
  // Busca histórico de conversas (últimas 20)
  const historyRaw = await conversationRepository.getHistory(lead.id, 20);
  const formattedHistory = formatConversationHistory(historyRaw);

  return {
    lead,
    isNewLead,
    processedMessage: processed.content,
    formattedHistory,
    instanceName: normalized.instanceName,
    tenant,
    contactName: normalized.clienteNome,
    whatsapp: normalized.clienteWhatsApp,
  };
}
