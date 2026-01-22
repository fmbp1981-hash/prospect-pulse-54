/**
 * Serviço de Automação de Movimentação de Leads
 * 
 * Este módulo gerencia a movimentação automática de leads entre os estágios do pipeline
 * baseado em ações realizadas no sistema.
 * 
 * Fluxo de estágios:
 * - Novo Lead → Contato Inicial (após disparo WhatsApp)
 * - Contato Inicial → Proposta Enviada (após enviar proposta)
 * - Proposta Enviada → Negociação (após lead responder)
 * - Negociação → Transferido para Consultor (handoff para consultor)
 * - Transferido para Consultor → Fechado (negociação concluída)
 * - Qualquer estágio → Follow-up (lead inativo ou não qualificado)
 */

import { supabase } from "@/integrations/supabase/client";
import { LeadStatus } from "@/types/prospection";
// LEAD_STATUS is available for future use
// import { LEAD_STATUS } from "@/lib/constants";

// ============= TIPOS =============
export interface LeadMovementResult {
  success: boolean;
  previousStage: LeadStatus | null;
  newStage: LeadStatus;
  message: string;
}

export interface FollowUpReason {
  code: string;
  description: string;
  category: 'inatividade' | 'desqualificacao' | 'sem_resposta' | 'outros';
}

// ============= MOTIVOS DE FOLLOW-UP =============
export const FOLLOWUP_REASONS: FollowUpReason[] = [
  { code: 'SEM_RESPOSTA_WHATSAPP', description: 'Não respondeu ao WhatsApp', category: 'sem_resposta' },
  { code: 'SEM_RESPOSTA_PROPOSTA', description: 'Não respondeu à proposta enviada', category: 'sem_resposta' },
  { code: 'INATIVIDADE_PROLONGADA', description: 'Inatividade prolongada (automático)', category: 'inatividade' },
  { code: 'NAO_ATENDE_CRITERIOS', description: 'Não atende aos critérios de qualificação', category: 'desqualificacao' },
  { code: 'ORCAMENTO_INSUFICIENTE', description: 'Orçamento insuficiente', category: 'desqualificacao' },
  { code: 'TIMING_INADEQUADO', description: 'Momento não é adequado para o lead', category: 'desqualificacao' },
  { code: 'CONCORRENTE_ESCOLHIDO', description: 'Lead optou por concorrente', category: 'desqualificacao' },
  { code: 'CONTATO_INVALIDO', description: 'Dados de contato inválidos', category: 'outros' },
  { code: 'DUPLICADO', description: 'Lead duplicado', category: 'outros' },
  { code: 'OUTRO', description: 'Outro motivo', category: 'outros' },
];

// ============= CONFIGURAÇÕES DE FOLLOW-UP AUTOMÁTICO =============
export interface FollowUpConfig {
  enabled: boolean;
  daysToFollowUp: number; // Dias de inatividade para mover para Follow-up
  stages: LeadStatus[]; // Estágios a monitorar
}

const DEFAULT_FOLLOWUP_CONFIG: FollowUpConfig = {
  enabled: true,
  daysToFollowUp: 7,
  stages: ['Contato Inicial', 'Proposta Enviada', 'Negociação'],
};

// ============= FUNÇÕES DE AUTOMAÇÃO =============

/**
 * Move lead para "Contato Inicial" após disparo de WhatsApp
 */
export async function moveToContatoInicial(leadId: string): Promise<LeadMovementResult> {
  return moveLeadToStage(leadId, 'Contato Inicial', 'WhatsApp enviado');
}

/**
 * Move lead para "Proposta Enviada" após envio de proposta comercial
 */
export async function moveToPropostaEnviada(leadId: string): Promise<LeadMovementResult> {
  try {
    // Atualizar estágio e registrar data de envio da proposta
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentLead, error: fetchError } = await (supabase as any)
      .from("leads_prospeccao")
      .select("status, estagio_pipeline")
      .eq("id", leadId)
      .single();

    if (fetchError || !currentLead) {
      return {
        success: false,
        previousStage: null,
        newStage: 'Proposta Enviada',
        message: 'Lead não encontrado'
      };
    }

    const previousStage = (currentLead.estagio_pipeline || currentLead.status) as LeadStatus;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("leads_prospeccao")
      .update({
        status: 'Proposta Enviada',
        estagio_pipeline: 'Proposta Enviada',
        data_envio_proposta: new Date().toISOString(),
        data_ultima_interacao: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", leadId);

    if (error) throw error;

    return {
      success: true,
      previousStage,
      newStage: 'Proposta Enviada',
      message: 'Lead movido para Proposta Enviada'
    };
  } catch (error) {
    console.error("Erro ao mover para Proposta Enviada:", error);
    return {
      success: false,
      previousStage: null,
      newStage: 'Proposta Enviada',
      message: (error as Error).message
    };
  }
}

/**
 * Move lead para "Negociação" após lead responder à proposta
 */
export async function moveToNegociacao(leadId: string): Promise<LeadMovementResult> {
  return moveLeadToStage(leadId, 'Negociação', 'Lead respondeu à proposta');
}

/**
 * Move lead para "Transferido para Consultor" quando for encaminhado para consultor de negócios
 */
export async function moveToTransferidoParaConsultor(leadId: string): Promise<LeadMovementResult> {
  return moveLeadToStage(leadId, 'Transferido para Consultor', 'Lead transferido para consultor de negócios');
}

/**
 * Move lead para "Fechado" quando negociação for concluída com sucesso
 */
export async function moveToFechado(leadId: string): Promise<LeadMovementResult> {
  return moveLeadToStage(leadId, 'Fechado', 'Negociação fechada com sucesso');
}

/**
 * Move lead para "Follow-up" com motivo específico
 */
export async function moveToFollowUp(
  leadId: string, 
  reasonCode: string,
  customReason?: string
): Promise<LeadMovementResult> {
  try {
    const reason = FOLLOWUP_REASONS.find(r => r.code === reasonCode);
    const reasonText = customReason || reason?.description || 'Motivo não especificado';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentLead, error: fetchError } = await (supabase as any)
      .from("leads_prospeccao")
      .select("status, estagio_pipeline, resumo_analitico")
      .eq("id", leadId)
      .single();

    if (fetchError || !currentLead) {
      return {
        success: false,
        previousStage: null,
        newStage: 'Follow-up',
        message: 'Lead não encontrado'
      };
    }

    const previousStage = (currentLead.estagio_pipeline || currentLead.status) as LeadStatus;
    
    // Construir histórico de motivos de follow-up
    const followUpEntry = `[${new Date().toISOString()}] FOLLOW-UP: ${reasonText} (Estágio anterior: ${previousStage})`;
    const existingNotes = currentLead.resumo_analitico || '';
    const updatedNotes = existingNotes 
      ? `${existingNotes}\n\n${followUpEntry}`
      : followUpEntry;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("leads_prospeccao")
      .update({
        status: 'Follow-up',
        estagio_pipeline: 'Follow-up',
        resumo_analitico: updatedNotes,
        data_ultima_interacao: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", leadId);

    if (error) throw error;

    return {
      success: true,
      previousStage,
      newStage: 'Follow-up',
      message: `Lead movido para Follow-up: ${reasonText}`
    };
  } catch (error) {
    console.error("Erro ao mover para Follow-up:", error);
    return {
      success: false,
      previousStage: null,
      newStage: 'Follow-up',
      message: (error as Error).message
    };
  }
}

/**
 * Função genérica para mover lead entre estágios
 */
export async function moveLeadToStage(
  leadId: string, 
  newStage: LeadStatus,
  reason?: string
): Promise<LeadMovementResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentLead, error: fetchError } = await (supabase as any)
      .from("leads_prospeccao")
      .select("status, estagio_pipeline")
      .eq("id", leadId)
      .single();

    if (fetchError || !currentLead) {
      return {
        success: false,
        previousStage: null,
        newStage,
        message: 'Lead não encontrado'
      };
    }

    const previousStage = (currentLead.estagio_pipeline || currentLead.status) as LeadStatus;

    // Não mover se já estiver no mesmo estágio
    if (previousStage === newStage) {
      return {
        success: true,
        previousStage,
        newStage,
        message: `Lead já está no estágio ${newStage}`
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("leads_prospeccao")
      .update({
        status: newStage,
        estagio_pipeline: newStage,
        data_ultima_interacao: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", leadId);

    if (error) throw error;

    return {
      success: true,
      previousStage,
      newStage,
      message: reason || `Lead movido para ${newStage}`
    };
  } catch (error) {
    console.error(`Erro ao mover lead para ${newStage}:`, error);
    return {
      success: false,
      previousStage: null,
      newStage,
      message: (error as Error).message
    };
  }
}

// ============= AUTOMAÇÃO DE FOLLOW-UP POR INATIVIDADE =============

/**
 * Busca leads inativos que devem ser movidos para Follow-up
 */
export async function getInactiveLeads(config: FollowUpConfig = DEFAULT_FOLLOWUP_CONFIG): Promise<string[]> {
  if (!config.enabled) return [];

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.daysToFollowUp);
    const cutoffDateStr = cutoffDate.toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("leads_prospeccao")
      .select("id, estagio_pipeline, status, data_ultima_interacao, updated_at")
      .in("estagio_pipeline", config.stages)
      .or(`data_ultima_interacao.lt.${cutoffDateStr},data_ultima_interacao.is.null`)
      .lt("updated_at", cutoffDateStr);

    if (error) throw error;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((lead: any) => lead.id);
  } catch (error) {
    console.error("Erro ao buscar leads inativos:", error);
    return [];
  }
}

/**
 * Move todos os leads inativos para Follow-up
 */
export async function processInactiveLeads(
  config: FollowUpConfig = DEFAULT_FOLLOWUP_CONFIG
): Promise<{ processed: number; moved: number; errors: number }> {
  const result = { processed: 0, moved: 0, errors: 0 };

  try {
    const inactiveLeadIds = await getInactiveLeads(config);
    result.processed = inactiveLeadIds.length;

    for (const leadId of inactiveLeadIds) {
      const moveResult = await moveToFollowUp(leadId, 'INATIVIDADE_PROLONGADA');
      if (moveResult.success) {
        result.moved++;
      } else {
        result.errors++;
      }
    }
  } catch (error) {
    console.error("Erro ao processar leads inativos:", error);
  }

  return result;
}

// ============= CONFIGURAÇÕES DO USUÁRIO =============

/**
 * Salva configurações de follow-up automático do usuário
 */
export async function saveFollowUpConfig(
  userId: string,
  config: FollowUpConfig
): Promise<boolean> {
  try {
    // Salvar no localStorage para agora (pode ser migrado para user_settings depois)
    localStorage.setItem(`followup_config_${userId}`, JSON.stringify(config));
    return true;
  } catch (error) {
    console.error("Erro ao salvar configurações de follow-up:", error);
    return false;
  }
}

/**
 * Carrega configurações de follow-up automático do usuário
 */
export function loadFollowUpConfig(userId: string): FollowUpConfig {
  try {
    const saved = localStorage.getItem(`followup_config_${userId}`);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error("Erro ao carregar configurações de follow-up:", error);
  }
  return DEFAULT_FOLLOWUP_CONFIG;
}

// ============= EXPORTAÇÃO =============
export const leadAutomation = {
  moveToContatoInicial,
  moveToPropostaEnviada,
  moveToNegociacao,
  moveToTransferidoParaConsultor,
  moveToFechado,
  moveToFollowUp,
  moveLeadToStage,
  getInactiveLeads,
  processInactiveLeads,
  saveFollowUpConfig,
  loadFollowUpConfig,
  FOLLOWUP_REASONS,
};
