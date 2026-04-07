/**
 * FLUXO 2 - LEAD SERVICE
 * Lógica de negócio para busca e criação de leads.
 * Equivalente à lógica dos nodes "Existe?" + "Criar_lead" do n8n.
 */

import { leadRepository } from '@/repositories/lead.repository';
import type { Database } from '@/integrations/supabase/types';

type LeadRow = Database['public']['Tables']['leads_prospeccao']['Row'];

interface OrganicLeadInput {
  clienteNome: string;
  clienteWhatsApp: string;
  clienteTelefone: string;
  userId: string;
}

function generateOrganicId(): string {
  // Formato idêntico ao n8n: ORG-{timestamp}-{random}
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `ORG-${timestamp}-${random}`;
}

/**
 * Gera uma referência única para o lead.
 * Formato: Lead-{timestamp-base36}-{random-4chars}
 * Sem query ao banco — sem race condition.
 */
function generateLeadRef(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `Lead-${ts}-${rand}`;
}

export const leadService = {
  /**
   * Busca lead existente ou cria novo orgânico.
   * Equivalente à combinação "Encontrar_lead" + "Existe?" + "Criar_lead".
   */
  async findOrCreate(
    input: OrganicLeadInput
  ): Promise<{ lead: LeadRow; isNew: boolean }> {
    const existing = await leadRepository.findByWhatsApp(
      input.clienteWhatsApp,
      input.userId
    );

    if (existing) {
      return { lead: existing, isNew: false };
    }

    const leadRef = generateLeadRef();

    // Normaliza para formato compacto "+55XXXXXXXXXX" — garante consistência no banco
    const normalizePhone = (p: string) => {
      const d = p.replace(/\D/g, '');
      if (!d) return p;
      return d.startsWith('55') ? `+${d}` : `+55${d}`;
    };

    const newLead = await leadRepository.create({
      id: generateOrganicId(),
      lead: leadRef,
      empresa: input.clienteNome,
      whatsapp: normalizePhone(input.clienteWhatsApp),
      telefone: input.clienteTelefone ? normalizePhone(input.clienteTelefone) : input.clienteTelefone,
      status: 'Novo Lead',
      estagio_pipeline: 'Novo Lead',
      categoria: 'Lead Orgânico',
      origem: 'WhatsApp Direto',
      modo_atendimento: 'bot',
      status_msg_wa: 'not_sent',
      follow_up_count: 0,
      user_id: input.userId,
      data_ultima_interacao: new Date().toISOString(),
    } as Database['public']['Tables']['leads_prospeccao']['Insert']);

    return { lead: newLead, isNew: true };
  },

  /**
   * Verifica se o lead está em modo humano.
   */
  isInHumanMode(lead: LeadRow): boolean {
    return lead.modo_atendimento === 'humano';
  },

  /**
   * Verifica se o bot deve retomar automaticamente baseado na inatividade do consultor.
   * Retorna true se o consultor estiver inativo há >= CONSULTANT_INACTIVITY_MS.
   */
  shouldAutoResumeBot(lead: LeadRow): boolean {
    const CONSULTANT_INACTIVITY_MS = 10 * 60 * 1000; // 10 minutos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastAction = (lead as any).data_ultima_acao_consultor as string | null;

    if (!lastAction) {
      // Consultor nunca atuou — usa data_transferencia como ponto de partida do timer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transferTime = (lead as any).data_transferencia as string | null;
      if (!transferTime) return false; // sem registro de transferência, não retomar
      return Date.now() - new Date(transferTime).getTime() >= CONSULTANT_INACTIVITY_MS;
    }

    const inactiveSince = Date.now() - new Date(lastAction).getTime();
    return inactiveSince >= CONSULTANT_INACTIVITY_MS;
  },

  /**
   * Registra atividade do consultor (atualiza data_ultima_acao_consultor).
   */
  async recordConsultantActivity(leadId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await leadRepository.update(leadId, { data_ultima_acao_consultor: new Date().toISOString() } as any);
  },

  /**
   * Marca lead como retornado ao bot (manual via #finalizado ou auto por timeout).
   */
  async returnToBot(leadId: string): Promise<void> {
    await leadRepository.update(leadId, { modo_atendimento: 'bot' });
  },

  /**
   * Atualiza campos do lead (usado pela tool atualizar_lead do agente).
   */
  async updateLead(
    leadId: string,
    fields: Partial<Database['public']['Tables']['leads_prospeccao']['Update']>
  ): Promise<LeadRow> {
    return leadRepository.update(leadId, {
      ...fields,
      data_ultima_interacao: new Date().toISOString(),
    });
  },
};
