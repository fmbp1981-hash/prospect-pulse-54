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
   * Usa regexp_replace no Postgres para remover todos os não-dígitos antes de comparar.
   * Isso resolve o mismatch entre o formato do Google Places ("+55 81 99999-0001")
   * e o formato do webhook Evolution API ("+5581999990001").
   *
   * A comparação é feita com os últimos 8+ dígitos para máxima compatibilidade entre
   * números fixos (10 dígitos locais) e celulares (11 dígitos locais).
   */
  async findByWhatsApp(
    whatsapp: string,
    userId?: string
  ): Promise<LeadRow | null> {
    const supabase = getServiceClient();

    // Extrai apenas dígitos e usa os últimos 11 (cobre mobile BR: DDD 2 + 9 dígitos)
    // Para fixo (DDD 2 + 8 dígitos = 10), os últimos 11 incluem o dígito país correto.
    const digits = whatsapp.replace(/\D/g, '');
    // Usa pelo menos 8 dígitos (número sem DDD) e no máximo 11 para evitar falsos positivos
    const localDigits = digits.length >= 11 ? digits.slice(-11) : digits.slice(-8);

    // Chama a RPC que usa regexp_replace no Postgres — único jeito de comparar
    // "+55 81 99999-0001" com "5581999990001" de forma correta.
    const { data, error } = await (supabase as any)
      .rpc('find_lead_by_phone_digits', {
        p_digits: localDigits,
        p_user_id: userId || null,
      });

    if (error) throw new Error(`findByWhatsApp error: ${error.message}`);

    // RPC com SETOF retorna array — pega o primeiro elemento
    const rows = data as LeadRow[] | null;
    return rows?.[0] ?? null;
  },

  /**
   * Busca lead pelo ID, sem filtro de tenant (service_role). Somente servidor:
   * usado pelo consumidor da fila de follow-up, que recebe só o leadId de uma
   * mensagem gerada pelo próprio sistema. Nunca expor a entrada de usuário.
   */
  async findById(id: string): Promise<LeadRow | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('leads_prospeccao')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`findById error: ${error.message}`);
    return data ?? null;
  },

  /**
   * Busca lead pelo ID restrito ao dono (service_role: o filtro de tenant é
   * obrigatório). null quando não existe ou é de outro usuário.
   */
  async findByIdForUser(id: string, userId: string): Promise<LeadRow | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('leads_prospeccao')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error(`findByIdForUser error: ${error.message}`);
    return data ?? null;
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
   * Reivindica atomicamente os leads vencidos para follow-up.
   * Equivalente ao node "Buscar Leads para Follow-up" do Fluxo 4, agora com trava:
   * a RPC claim_due_follow_ups seleciona com FOR UPDATE SKIP LOCKED e grava
   * follow_up_lock_until = now() + 5 min nas linhas devolvidas, então duas
   * execuções simultâneas nunca recebem o mesmo lead.
   * Janelas: 15 min (count=0), 1 h (count=1), 24 h (count=2); mais antigos primeiro.
   */
  async claimDueFollowUps(limit = 20): Promise<LeadRow[]> {
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc('claim_due_follow_ups', { p_limit: limit });

    if (error) throw new Error(`claimDueFollowUps error: ${error.message}`);
    return data ?? [];
  },

  /**
   * Devolve um lead reivindicado que não recebeu a mensagem (sem instância
   * configurada, sem dono, falha no envio etc.) com backoff: a trava passa a
   * valer até now() + backoffMinutes. Zerar a trava faria leads com problema
   * permanente ficarem sempre entre os mais antigos, ocupando o lote de cada
   * execução (starvation dos leads saudáveis) e retentando a cada minuto.
   */
  async releaseFollowUpClaim(id: string, backoffMinutes = 15): Promise<void> {
    const supabase = getServiceClient();
    const retryAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('leads_prospeccao')
      .update({ follow_up_lock_until: retryAt })
      .eq('id', id);

    if (error) throw new Error(`releaseFollowUpClaim error: ${error.message}`);
  },

  /**
   * Incrementa o contador de follow-up, atualiza última interação e libera a
   * trava de follow-up no mesmo update.
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
        follow_up_lock_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw new Error(`incrementFollowUpCount error: ${error.message}`);
  },

  /**
   * Reserva o envio do follow-up `expectedCount` antes de enviar (caminho da
   * fila): update condicional `follow_up_count = expectedCount + 1` (mais os
   * mesmos campos de incrementFollowUpCount, exceto a trava, que segue segurando
   * o lead enquanto a fila tenta de novo) só onde `follow_up_count = expectedCount`.
   * true apenas se exatamente uma linha mudou: duas entregas da mesma mensagem
   * nunca enviam as duas.
   */
  async reserveFollowUpSend(id: string, expectedCount: number, now: Date = new Date()): Promise<boolean> {
    const supabase = getServiceClient();
    const newCount = expectedCount + 1;
    const at = now.toISOString();

    const { data, error } = await supabase
      .from('leads_prospeccao')
      .update({
        follow_up_count: newCount,
        ...(newCount >= 3 ? { status_msg_wa: 'Follow-up' } : {}),
        data_ultima_interacao: at,
        updated_at: at,
      })
      .eq('id', id)
      .eq('follow_up_count', expectedCount)
      .select('id');

    if (error) throw new Error(`reserveFollowUpSend error: ${error.message}`);
    return (data ?? []).length === 1;
  },

  /**
   * Desfaz uma reserva de envio que falhou: volta `follow_up_count` para
   * `expectedCount` e restaura status_msg_wa/data_ultima_interacao anteriores,
   * só se a linha ainda estiver exatamente como a reserva deixou (count + 1 e
   * data_ultima_interacao = reservedAt). Se o lead interagiu nesse meio-tempo,
   * não sobrescreve. true se reverteu.
   */
  async revertFollowUpReservation(
    id: string,
    expectedCount: number,
    previous: { reservedAt: Date; status_msg_wa: string | null; data_ultima_interacao: string | null }
  ): Promise<boolean> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('leads_prospeccao')
      .update({
        follow_up_count: expectedCount,
        status_msg_wa: previous.status_msg_wa,
        data_ultima_interacao: previous.data_ultima_interacao,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('follow_up_count', expectedCount + 1)
      .eq('data_ultima_interacao', previous.reservedAt.toISOString())
      .select('id');

    if (error) throw new Error(`revertFollowUpReservation error: ${error.message}`);
    return (data ?? []).length === 1;
  },

  /**
   * Busca o lead de prospecção mais recente enviado pelo tenant que pode
   * ter originado uma resposta de bot.
   *
   * Usado quando um business account JID (ORG lead) responde com bot:
   * nesse caso precisamos enviar a resposta para o número original da
   * prospecção, não para o JID do bot (que pode não existir no WhatsApp).
   *
   * Critérios: non-ORG, status_msg_wa='sent', whatsapp preenchido,
   * criado até `windowMinutes` antes do momento indicado.
   */
  async findRecentProspectionTarget(
    userId: string,
    beforeIso: string,
    windowMinutes = 120
  ): Promise<LeadRow | null> {
    const supabase = getServiceClient();
    const windowStart = new Date(
      new Date(beforeIso).getTime() - windowMinutes * 60 * 1000
    ).toISOString();

    const { data, error } = await supabase
      .from('leads_prospeccao')
      .select('*')
      .eq('user_id', userId)
      .eq('status_msg_wa', 'sent')
      .not('whatsapp', 'is', null)
      .not('id', 'like', 'ORG-%')
      .gte('created_at', windowStart)
      .lte('created_at', beforeIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[leadRepository] findRecentProspectionTarget error:', error.message);
      return null;
    }
    return data;
  },
};
