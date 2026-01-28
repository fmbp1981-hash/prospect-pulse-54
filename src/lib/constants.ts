/**
 * Constantes do sistema para evitar magic strings e centralizar valores
 */

// ============= LEAD STATUS =============
// Novo pipeline com 7 estágios (reorganizado em 2025)
export const LEAD_STATUS = {
  // Estágios principais do pipeline (7 estágios)
  NOVO_LEAD: 'Novo Lead',                           // #1 - Prospecção via sistema
  CONTATO_INICIAL: 'Contato Inicial',               // #2 - MSG WhatsApp disparada
  QUALIFICACAO: 'Qualificação',                     // #3 - Agente IA qualificando
  TRANSFERIDO_PARA_CONSULTOR: 'Transferido para Consultor', // #4 - Lead qualificado
  FECHADO_GANHO: 'Fechado Ganho',                   // #5 - Negócio fechado com sucesso
  FECHADO_PERDIDO: 'Fechado Perdido',               // #6 - Negócio não fechou
  FOLLOWUP: 'Follow-up',                            // #7 - Não qualificados ou estagnados

  // Deprecated (para retrocompatibilidade com dados antigos)
  NOVO: 'Novo',
  PROPOSTA_ENVIADA: 'Proposta Enviada',   // Migrar → Qualificação
  NEGOCIACAO: 'Negociação',               // Migrar → Transferido para Consultor
  FECHADO: 'Fechado',                     // Migrar → Fechado Ganho
  EM_FOLLOWUP: 'Em Follow-up',            // Migrar → Follow-up
  RECORRENTE: 'Recorrente',               // Manter para casos especiais
} as const;

export type LeadStatusValue = typeof LEAD_STATUS[keyof typeof LEAD_STATUS];

// ============= WHATSAPP STATUS =============
export const WHATSAPP_STATUS = {
  NOT_SENT: 'not_sent',
  SENT: 'sent',
  FAILED: 'failed',
} as const;

export type WhatsAppStatusValue = typeof WHATSAPP_STATUS[keyof typeof WHATSAPP_STATUS];

// ============= CONVERSATION STATUS (Agente IA n8n) =============
export const CONVERSATION_STATUS = {
  EM_CONVERSA: 'Em Conversa',
  QUALIFICANDO: 'Qualificando',
  QUALIFICADO: 'Qualificado',
  FOLLOW_UP: 'Follow-up',
  TRANSFERIDO: 'Transferido',
} as const;

export type ConversationStatusValue = typeof CONVERSATION_STATUS[keyof typeof CONVERSATION_STATUS];

// Função para mapear status_msg_wa do agente para status de pipeline
export function mapAgentStatusToPipeline(agentStatus: string): string {
  switch (agentStatus) {
    case CONVERSATION_STATUS.EM_CONVERSA:
      return LEAD_STATUS.CONTATO_INICIAL;
    case CONVERSATION_STATUS.QUALIFICANDO:
      return LEAD_STATUS.QUALIFICACAO;
    case CONVERSATION_STATUS.QUALIFICADO:
      // Lead qualificado (faturamento >= R$50k) → Qualificação (aguardando transferência)
      return LEAD_STATUS.QUALIFICACAO;
    case CONVERSATION_STATUS.FOLLOW_UP:
      return LEAD_STATUS.FOLLOWUP;
    case CONVERSATION_STATUS.TRANSFERIDO:
      return LEAD_STATUS.TRANSFERIDO_PARA_CONSULTOR;
    default:
      return agentStatus;
  }
}

// Função para migrar status antigos para o novo pipeline
export function migrateLeadStatus(oldStatus: string): string {
  switch (oldStatus) {
    case 'Proposta Enviada':
      return LEAD_STATUS.QUALIFICACAO;
    case 'Negociação':
      return LEAD_STATUS.TRANSFERIDO_PARA_CONSULTOR;
    case 'Fechado':
      return LEAD_STATUS.FECHADO_GANHO;
    case 'Em Follow-up':
      return LEAD_STATUS.FOLLOWUP;
    case 'Novo':
      return LEAD_STATUS.NOVO_LEAD;
    default:
      return oldStatus;
  }
}

// ============= PROSPECTION STATUS =============
export const PROSPECTION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error',
} as const;

export type ProspectionStatusValue = typeof PROSPECTION_STATUS[keyof typeof PROSPECTION_STATUS];

// ============= LEAD PRIORITY =============
export const LEAD_PRIORITY = {
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',
} as const;

export type LeadPriorityValue = typeof LEAD_PRIORITY[keyof typeof LEAD_PRIORITY];

// ============= LEAD ORIGIN =============
export const LEAD_ORIGIN = {
  PROSPECCAO_ATIVA: 'Prospecção Ativa',
  INDICACAO: 'Indicação',
  SITE: 'Site',
  REDES_SOCIAIS: 'Redes Sociais',
  EVENTO: 'Evento',
  OUTRO: 'Outro',
  GOOGLE_PLACES: 'Google Places',
} as const;

export type LeadOriginValue = typeof LEAD_ORIGIN[keyof typeof LEAD_ORIGIN];

// ============= STORAGE KEYS =============
export const STORAGE_KEYS = {
  PROSPECTION_SEARCHES: 'prospectionSearches',
  WEBHOOK_URL: 'leadfinder_webhook_url',
  MCP_WEBHOOK_URL: 'leadfinder_mcp_webhook_url',
  WHATSAPP_WEBHOOK_URL: 'leadfinder_whatsapp_webhook_url',
} as const;

// ============= API LIMITS =============
export const API_LIMITS = {
  MIN_QUANTITY: 1,
  MAX_QUANTITY: 500,
  DEFAULT_QUANTITY: 50,
} as const;

// ============= TOAST DURATIONS (ms) =============
export const TOAST_DURATION = {
  SUCCESS: 5000,
  ERROR: 6000,
  WARNING: 6000,
  INFO: 4000,
  LOADING: Infinity, // Infinito para toasts de loading
} as const;

// ============= PAGINATION =============
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
} as const;
