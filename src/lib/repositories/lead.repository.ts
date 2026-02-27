/**
 * FLUXO 2 - REPOSITÓRIO DE LEADS
 * Equivalente nativo aos nodes "Encontrar_lead" (Supabase GET) e
 * "Criar_lead" (Supabase INSERT) do workflow n8n.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type LeadRow = Database['public']['Tables']['leads_prospeccao']['Row'];
type LeadInsert = Database['public']['Tables']['leads_prospeccao']['Insert'];
type LeadUpdate = Database['public']['Tables']['leads_prospeccao']['Update'];

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

export const leadRepository = {
  /**
   * Busca lead pelo número de WhatsApp.
   * Equivalente ao node "Encontrar_lead" (filtro: whatsapp = ClienteWhatsApp)
   *
   * Usa os últimos 10 dígitos para comparação — ignora diferenças de formato
   * (+55 81 9..., 5581 9..., (81) 9...) entre prospecção e webhook.
   */
  async findByWhatsApp(
    whatsapp: string,
    userId?: string
  ): Promise<LeadRow | null> {
    const supabase = getServiceClient();

    // Extrai apenas dígitos e pega os últimos 10 (DDD + número local)
    const digits = whatsapp.replace(/\D/g, '');
    const localDigits = digits.slice(-10);

    let query = supabase
      .from('leads_prospeccao')
      .select('*')
      .or(`whatsapp.ilike.%${localDigits}%,telefone.ilike.%${localDigits}%`)
      .limit(1);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`findByWhatsApp error: ${error.message}`);
    return data;
  },

  /**
   * Cria novo lead orgânico.
   * Equivalente ao node "Criar_lead" (INSERT).
   */
  async create(lead: LeadInsert): Promise<LeadRow> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('leads_prospeccao')
      .insert(lead)
      .select()
      .single();

    if (error) throw new Error(`create lead error: ${error.message}`);
    return data;
  },

  /**
   * Atualiza campos de um lead pelo ID.
   * Equivalente à tool "atualizar_lead".
   */
  async update(id: string, fields: LeadUpdate): Promise<LeadRow> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('leads_prospeccao')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`update lead error: ${error.message}`);
    return data;
  },

  /**
   * Busca leads elegíveis para follow-up.
   * Equivalente ao node "Buscar Leads para Follow-up" do Fluxo 4.
   */
  async findLeadsForFollowUp(): Promise<LeadRow[]> {
    const supabase = getServiceClient();
    const now = new Date();

    // Janelas de follow-up: 10min (count=0), 1h (count=1), 24h (count=2)
    const thresholds = [
      { count: 0, minutesAgo: 10 },
      { count: 1, minutesAgo: 60 },
      { count: 2, minutesAgo: 1440 }, // 24h
    ];

    const results: LeadRow[] = [];

    for (const { count, minutesAgo } of thresholds) {
      const cutoff = new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('leads_prospeccao')
        .select('*')
        .eq('follow_up_count', count)
        .eq('modo_atendimento', 'bot')
        .in('status_msg_wa', ['Em Conversa', 'Qualificando'])
        .not('whatsapp', 'is', null)
        .lte('data_ultima_interacao', cutoff)
        .limit(50);

      if (error) {
        console.error(`findLeadsForFollowUp error (count=${count}):`, error.message);
        continue;
      }

      results.push(...(data ?? []));
    }

    return results;
  },

  /**
   * Incrementa o contador de follow-up e atualiza última interação.
   */
  async incrementFollowUpCount(id: string): Promise<void> {
    const supabase = getServiceClient();

    const { data: current } = await supabase
      .from('leads_prospeccao')
      .select('follow_up_count')
      .eq('id', id)
      .single();

    const newCount = ((current?.follow_up_count as number) ?? 0) + 1;
    const status = newCount >= 3 ? 'Follow-up' : undefined;

    const { error } = await supabase
      .from('leads_prospeccao')
      .update({
        follow_up_count: newCount,
        ...(status ? { status_msg_wa: status } : {}),
        data_ultima_interacao: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw new Error(`incrementFollowUpCount error: ${error.message}`);
  },

  /**
   * Keep-alive: consulta 1 linha para manter projeto Supabase ativo.
   * Equivalente ao fluxo auxiliar "Supabase Instancia Ativa".
   */
  async keepAlive(): Promise<void> {
    const supabase = getServiceClient();
    await supabase.from('leads_prospeccao').select('id').limit(1);
  },
};
