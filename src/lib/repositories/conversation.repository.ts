/**
 * FLUXO 2 - REPOSITÓRIO DE CONVERSAS
 * Equivalente nativo aos nodes "Buscar Historico Conversa" (GET ALL)
 * e "Salvar Conversa Lead" / "Atualizar Conversa Agente" do workflow n8n.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

interface ConversationRow {
  id: string;
  lead_id: string;
  message: string;
  from_lead: boolean;
  ai_generated: boolean;
  timestamp: string;
  user_id: string | null;
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
   * Equivalente ao node "Buscar Historico Conversa" (limit=20).
   */
  async getHistory(leadId: string, limit = 20): Promise<ConversationRow[]> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('whatsapp_conversations' as any)
      .select('*')
      .eq('lead_id', leadId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`getHistory error: ${error.message}`);

    // Retorna em ordem cronológica (mais antiga primeiro)
    return ((data ?? []) as unknown as ConversationRow[]).reverse();
  },

  /**
   * Salva mensagem do lead no banco.
   * Equivalente ao node "Salvar Conversa Lead".
   */
  async saveLeadMessage(msg: ConversationInsert): Promise<ConversationRow> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('whatsapp_conversations' as any)
      .insert({
        ...msg,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`saveLeadMessage error: ${error.message}`);
    return data as unknown as ConversationRow;
  },

  /**
   * Salva resposta do agente de IA.
   * Equivalente ao node "Atualizar Conversa Agente".
   */
  async saveAgentResponse(
    leadId: string,
    message: string,
    userId?: string
  ): Promise<ConversationRow> {
    return this.saveLeadMessage({
      lead_id: leadId,
      message,
      from_lead: false,
      ai_generated: true,
      user_id: userId,
    });
  },
};
