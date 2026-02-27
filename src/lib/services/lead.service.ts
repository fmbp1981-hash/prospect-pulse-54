/**
 * FLUXO 2 - LEAD SERVICE
 * Lógica de negócio para busca e criação de leads.
 * Equivalente à lógica dos nodes "Existe?" + "Criar_lead" do n8n.
 */

import { leadRepository } from '../repositories/lead.repository';
import { createClient } from '@supabase/supabase-js';
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
 * Gera o próximo número sequencial para leads orgânicos.
 * Formato: ORG-001, ORG-002, etc.
 */
async function generateOrganicLeadRef(userId: string): Promise<string> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { count } = await supabase
    .from('leads_prospeccao')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .like('id', 'ORG-%');

  const next = ((count ?? 0) + 1).toString().padStart(3, '0');
  return `ORG-${next}`;
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

    const leadRef = await generateOrganicLeadRef(input.userId);

    const newLead = await leadRepository.create({
      id: generateOrganicId(),
      lead: leadRef,             // Nº do lead: ORG-001, ORG-002, etc.
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
   * Verifica se o bot deve retomar automaticamente baseado na inatividade do consultor.
   * Retorna true se o consultor estiver inativo há >= CONSULTANT_INACTIVITY_MS.
   */
  shouldAutoResumeBot(lead: LeadRow): boolean {
    const CONSULTANT_INACTIVITY_MS = 10 * 60 * 1000; // 10 minutos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastAction = (lead as any).data_ultima_acao_consultor as string | null;

    if (!lastAction) {
      // Nunca houve ação do consultor — bot pode retomar
      return true;
    }

    const inactiveSince = Date.now() - new Date(lastAction).getTime();
    return inactiveSince >= CONSULTANT_INACTIVITY_MS;
  },

  /**
   * Registra atividade do consultor (atualiza data_ultima_acao_consultor).
   */
  async recordConsultantActivity(leadId: string): Promise<void> {
    await leadRepository.update(leadId, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data_ultima_acao_consultor: new Date().toISOString() as any,
    });
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
