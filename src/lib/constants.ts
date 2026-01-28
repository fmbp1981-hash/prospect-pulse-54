/**
 * Constantes do sistema para evitar magic strings e centralizar valores
 */

// ============= LEAD STATUS =============
export const LEAD_STATUS = {
  NOVO: 'Novo',
  NOVO_LEAD: 'Novo Lead',
  CONTATO_INICIAL: 'Contato Inicial',
  QUALIFICACAO: 'Qualificação',
  PROPOSTA_ENVIADA: 'Proposta Enviada',
  NEGOCIACAO: 'Negociação',
  TRANSFERIDO_PARA_CONSULTOR: 'Transferido para Consultor',
  FECHADO_GANHO: 'Fechado Ganho',
  FECHADO_PERDIDO: 'Fechado Perdido',
  FECHADO: 'Fechado',
  EM_FOLLOWUP: 'Em Follow-up',
  FOLLOWUP: 'Follow-up',
  RECORRENTE: 'Recorrente',
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
      return LEAD_STATUS.NEGOCIACAO;
    case CONVERSATION_STATUS.FOLLOW_UP:
      return LEAD_STATUS.FOLLOWUP;
    case CONVERSATION_STATUS.TRANSFERIDO:
      return LEAD_STATUS.TRANSFERIDO_PARA_CONSULTOR;
    default:
      return agentStatus;
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
