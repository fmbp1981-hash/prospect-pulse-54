/**
 * Serviço de Automação de Movimentação de Leads
 *
 * Este módulo gerencia a movimentação automática de leads entre os estágios do pipeline
 * baseado em ações realizadas no sistema.
 *
 * Novo Pipeline (7 estágios - reorganizado em 2025):
 * 1. Novo Lead → Prospecção via sistema
 * 2. Contato Inicial → MSG WhatsApp disparada
 * 3. Qualificação → Agente IA qualificando (faturamento >= R$50k)
 * 4. Transferido para Consultor → Lead qualificado
 * 5. Fechado Ganho → Negócio fechado com sucesso
 * 6. Fechado Perdido → Negócio não fechou
 * 7. Follow-up → Não qualificados ou estagnados >= 7 dias
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
  { code: 'INATIVIDADE_AUTOMATICA', description: 'Inatividade - sem resposta após 7 dias', category: 'inatividade' },
  { code: 'INATIVIDADE_PROLONGADA', description: 'Inatividade prolongada (automático)', category: 'inatividade' },
  { code: 'NAO_QUALIFICADO', description: 'Não qualificado (faturamento < R$50k)', category: 'desqualificacao' },
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

// Configuração padrão: monitorar Novo Lead e Contato Inicial para inatividade
const DEFAULT_FOLLOWUP_CONFIG: FollowUpConfig = {
  enabled: true,
  daysToFollowUp: 7,
  stages: ['Novo Lead', 'Contato Inicial'],
};

// ============= FUNÇÕES DE AUTOMAÇÃO =============

/**
 * Move lead para "Contato Inicial" após disparo de WhatsApp
 */
export async function moveToContatoInicial(leadId: string): Promise<LeadMovementResult> {
  return moveLeadToStage(leadId, 'Contato Inicial', 'WhatsApp enviado');
}

/**
 * Move lead para "Qualificação" quando agente IA está qualificando
 */
export async function moveToQualificacao(leadId: string): Promise<LeadMovementResult> {
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
        newStage: 'Qualificação',
        message: 'Lead não encontrado'
      };
    }

    const previousStage = (currentLead.estagio_pipeline || currentLead.status) as LeadStatus;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("leads_prospeccao")
      .update({
        status: 'Qualificação',
        estagio_pipeline: 'Qualificação',
        data_qualificacao: new Date().toISOString(),
        data_ultima_interacao: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", leadId);

    if (error) throw error;

    return {
      success: true,
      previousStage,
      newStage: 'Qualificação',
      message: 'Lead movido para Qualificação'
    };
  } catch (error) {
    console.error("Erro ao mover para Qualificação:", error);
    return {
      success: false,
      previousStage: null,
      newStage: 'Qualificação',
      message: (error as Error).message
    };
  }
}

/**
 * Move lead para "Fechado Ganho" quando negócio é fechado com sucesso
 */
export async function moveToFechadoGanho(leadId: string): Promise<LeadMovementResult> {
  return moveLeadToStage(leadId, 'Fechado Ganho', 'Negócio fechado com sucesso');
}

/**
 * Move lead para "Fechado Perdido" quando negócio não é fechado
 */
export async function moveToFechadoPerdido(leadId: string, motivo?: string): Promise<LeadMovementResult> {
  return moveLeadToStage(leadId, 'Fechado Perdido', motivo || 'Negócio não fechado');
}

/**
 * Move lead para "Transferido para Consultor" quando for encaminhado para consultor de negócios
 */
export async function moveToTransferidoParaConsultor(leadId: string): Promise<LeadMovementResult> {
  return moveLeadToStage(leadId, 'Transferido para Consultor', 'Lead transferido para consultor de negócios');
}

/**
 * @deprecated Use moveToFechadoGanho ou moveToFechadoPerdido
 * Move lead para "Fechado Ganho" quando negociação for concluída com sucesso
 */
export async function moveToFechado(leadId: string): Promise<LeadMovementResult> {
  return moveToFechadoGanho(leadId);
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
      const moveResult = await moveToFollowUp(leadId, 'INATIVIDADE_AUTOMATICA');
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
  // Funções principais do novo pipeline
  moveToContatoInicial,
  moveToQualificacao,
  moveToTransferidoParaConsultor,
  moveToFechadoGanho,
  moveToFechadoPerdido,
  moveToFollowUp,
  moveLeadToStage,
  // Deprecated (para retrocompatibilidade)
  moveToFechado,
  // Automação de follow-up por inatividade
  getInactiveLeads,
  processInactiveLeads,
  saveFollowUpConfig,
  loadFollowUpConfig,
  FOLLOWUP_REASONS,
};
