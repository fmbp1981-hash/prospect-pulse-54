/**
 * FLUXO 2 - LEAD SERVICE
 * Lógica de negócio para busca e criação de leads.
 * Equivalente à lógica dos nodes "Existe?" + "Criar_lead" do n8n.
 */

import { leadRepository } from '../repositories/lead.repository';
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

    const newLead = await leadRepository.create({
      id: generateOrganicId(),
      lead: input.clienteNome,
      empresa: input.clienteNome, // Orgânico: empresa = nome até ser informado
      whatsapp: input.clienteWhatsApp,
      telefone: input.clienteTelefone,
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
   * Marca lead como retornado ao bot após #finalizado.
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
