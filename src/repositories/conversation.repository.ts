/**
 * FLUXO 2 - REPOSITÓRIO DE CONVERSAS
 * Equivalente nativo aos nodes "Buscar Historico Conversa" (GET ALL)
 * e "Salvar Conversa Lead" / "Atualizar Conversa Agente" do workflow n8n.
 *
 * Schema real da tabela whatsapp_conversations:
 *   message_lead   — mensagem do lead
 *   message_agent  — resposta do agente (atualizada após o agente responder)
 *   from_lead      — boolean
 *   ai_generated   — boolean
 *   status         — 'aguardando' | 'respondido'
 *   timestamp      — ISO timestamp
 *   created_at
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

// Formato interno usado pelo history-formatter e pelo agente
export interface ConversationEntry {
  timestamp: string;
  from_lead: boolean;
  message: string;
}

interface ConversationInsert {
  lead_id: string;
  message: string;
  from_lead: boolean;
  ai_generated: boolean;
  user_id?: string;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

export const conversationRepository = {
  /**
   * Busca histórico das últimas N conversas do lead.
   * Converte cada row (message_lead + message_agent) em até 2 entradas separadas.
   */
  async getHistory(leadId: string, limit = 20): Promise<ConversationEntry[]> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('whatsapp_conversations' as any)
      .select('message_lead, message_agent, timestamp, created_at, status')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`getHistory error: ${error.message}`);

    // Converte cada row em até 2 entradas (lead + agente)
    const entries: ConversationEntry[] = [];
    const rows = ((data ?? []) as unknown as Array<{
      message_lead: string | null;
      message_agent: string | null;
      timestamp: string | null;
      created_at: string;
      status: string | null;
    }>).reverse(); // cronológico (mais antiga primeiro)

    for (const row of rows) {
      const ts = row.timestamp || row.created_at;
      if (row.message_lead) {
        entries.push({ timestamp: ts, from_lead: true, message: row.message_lead });
      }
      if (row.message_agent) {
        entries.push({ timestamp: ts, from_lead: false, message: row.message_agent });
      }
    }

    return entries;
  },

  /**
   * Salva mensagem do lead (INSERT nova row).
   * Equivalente ao node "Salvar Conversa Lead".
   */
  async saveLeadMessage(msg: ConversationInsert): Promise<{ id: string }> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('whatsapp_conversations' as any)
      .insert({
        lead_id: msg.lead_id,
        message_lead: msg.message,
        from_lead: msg.from_lead,
        ai_generated: msg.ai_generated,
        user_id: msg.user_id ?? null,
        status: 'aguardando',
        timestamp: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw new Error(`saveLeadMessage error: ${error.message}`);
    return data as unknown as { id: string };
  },

  /**
   * Atualiza a última row pendente do lead com a resposta do agente (UPDATE).
   * Equivalente ao node "Atualizar Conversa Agente".
   */
  async saveAgentResponse(
    leadId: string,
    message: string,
    userId?: string
  ): Promise<void> {
    const supabase = getServiceClient();

    // Busca a row mais recente ainda sem resposta do agente
    const { data: rows } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('whatsapp_conversations' as any)
      .select('id')
      .eq('lead_id', leadId)
      .is('message_agent', null)
      .order('created_at', { ascending: false })
      .limit(1);

    const rowId = (rows as unknown as Array<{ id: string }> | null)?.[0]?.id;

    if (rowId) {
      // Atualiza a row existente com a resposta do agente
      await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('whatsapp_conversations' as any)
        .update({
          message_agent: message,
          ai_generated: true,
          status: 'respondido',
          updated_at: new Date().toISOString(),
        })
        .eq('id', rowId);
    } else {
      // Fallback: insere nova row com a resposta (raro, mas seguro)
      await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('whatsapp_conversations' as any)
        .insert({
          lead_id: leadId,
          message_agent: message,
          from_lead: false,
          ai_generated: true,
          user_id: userId ?? null,
          status: 'respondido',
          timestamp: new Date().toISOString(),
        });
    }
  },
};
