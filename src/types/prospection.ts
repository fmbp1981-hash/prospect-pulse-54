export interface LocationData {
  country: string;
  state: string;
  city: string;
  neighborhood?: string;
}

export interface ProspectionSearch {
  id: string;
  niche: string;
  location: string | LocationData;
  quantity: number;
  webhookUrl?: string;
  timestamp: Date;
  status: 'pending' | 'processing' | 'completed' | 'error';
  whatsappStatus?: 'not_sent' | 'sent' | 'failed';
  whatsappSentAt?: Date;
}

export interface ProspectionFormData {
  niche: string;
  location: LocationData;
  quantity: number;
  webhookUrl?: string;
}

// Tipos completos do CRM (Google Sheets)
export type LeadStatus =
  | 'Novo Lead'          // Assim que o lead for prospectado
  | 'Contato Inicial'    // Assim que a mensagem de prospecção for enviada via WhatsApp
  | 'Proposta Enviada'   // Quando proposta comercial for enviada
  | 'Negociação'         // Após proposta ser enviada e lead responder
  | 'Fechado'            // Quando negociação for fechada (ganho)
  | 'Follow-up'          // Quando lead ficar estagnado ou não responder
  // Deprecated (para retrocompatibilidade)
  | 'Qualificação'
  | 'Fechado Ganho'
  | 'Fechado Perdido'
  | 'Em Follow-up';

export type LeadPriority = 'Alta' | 'Média' | 'Baixa';

export type WhatsAppStatus = 'not_sent' | 'sent' | 'failed';

export type LeadOrigin = 
  | 'Prospecção Ativa'
  | 'Indicação'
  | 'Site'
  | 'Redes Sociais'
  | 'Evento'
  | 'Google Places'
  | 'Outro';

export interface Lead {
  id: string;
  
  // ✅ Campos que EXISTEM na tabela leads_prospeccao (nova estrutura)
  lead: string; // Lead-001, Lead-002, etc. (identificação sequencial)
  status: LeadStatus;
  data?: string; // Data formatada
  empresa?: string;
  categoria?: string;
  contato?: string;
  whatsapp?: string; // Campo whatsapp (separado)
  telefone?: string; // Campo telefone (separado)
  email?: string;
  website?: string;
  instagram?: string;
  cidade?: string;
  endereco?: string;
  bairroRegiao?: string; // Mapeado de bairro_regiao
  linkGMN?: string; // Mapeado de link_gmn
  aceitaCartao?: string; // Mapeado de aceita_cartao
  cnpj?: string;
  mensagemWhatsApp?: string; // Mapeado de mensagem_whatsapp
  statusMsgWA?: WhatsAppStatus; // Mapeado de status_msg_wa
  dataEnvioWA?: string | null; // Mapeado de data_envio_wa
  resumoAnalitico?: string; // Mapeado de resumo_analitico
  createdAt?: string; // created_at
  updatedAt?: string; // updated_at
  
  // ❌ Campos VIRTUAIS (calculados, não salvam no banco)
  origem?: LeadOrigin; // Derivado de categoria
  prioridade?: LeadPriority; // Calculado via lógica
  regiao?: string; // Alias de cidade
  segmento?: string; // Alias de categoria
  ticketMedioEstimado?: number; // Calculado ou 0
  contatoPrincipal?: string; // Alias de contato
  dataContato?: string; // Alias de created_at
  observacoes?: string; // Não usado
  proximoFollowUp?: string; // Não usado
  resultado?: string; // Não usado
}

export interface DashboardMetrics {
  totalLeads: number;
  novoLeads: number;
  emNegociacao: number;
  fechadoGanho: number;
  fechadoPerdido: number;
  taxaConversao: number;
  ticketMedioTotal: number;
  leadsPorStatus: Record<LeadStatus, number>;
  leadsPorOrigem: Record<string, number>;
  leadsPorRegiao: Record<string, number>;
  leadsPorSegmento: Record<string, number>;
  mensagensEnviadas: number;
  mensagensPendentes: number;
  proximosFollowUps: Array<{
    leadId: string;
    leadName: string;
    empresa: string;
    data: string;
  }>;
}

// Estilos de mensagem disponíveis
export type MessageStyle =
  | 'formal'
  | 'casual'
  | 'direto'
  | 'consultivo'
  | 'amigavel'
  | 'executivo';

export const MESSAGE_STYLES: Record<MessageStyle, { label: string; emoji: string; description: string }> = {
  formal: {
    label: 'Formal',
    emoji: '👔',
    description: 'Tom profissional e cordial'
  },
  casual: {
    label: 'Casual',
    emoji: '😊',
    description: 'Tom descontraído e amigável'
  },
  direto: {
    label: 'Direto',
    emoji: '🎯',
    description: 'Objetivo e sem rodeios'
  },
  consultivo: {
    label: 'Consultivo',
    emoji: '💡',
    description: 'Tom educativo e orientador'
  },
  amigavel: {
    label: 'Amigável',
    emoji: '🤝',
    description: 'Próximo e acolhedor'
  },
  executivo: {
    label: 'Executivo',
    emoji: '💼',
    description: 'Conciso e corporativo'
  },
};

// Variação de mensagem (cada template tem 3 variações)
export interface MessageVariation {
  style: MessageStyle;
  message: string;
}

// Templates de Mensagens WhatsApp
export interface MessageTemplate {
  id: string;
  name: string;
  category: string; // "Primeiro Contato", "Follow-up", "Proposta", etc.

  // Suporte a formato legado (templates antigos)
  message?: string; // Template com variáveis {{empresa}}, {{cidade}}, {{categoria}}

  // Novo formato com 3 variações
  variations?: MessageVariation[]; // Array de 3 variações com estilos diferentes

  isDefault?: boolean;
  createdAt: string;
  updatedAt?: string;
}

// Variáveis disponíveis para templates
export const TEMPLATE_VARIABLES = [
  { key: '{{minha_empresa}}', description: 'Sua empresa (quem envia)' },
  { key: '{{empresa}}', description: 'Nome da empresa prospectada' },
  { key: '{{categoria}}', description: 'Categoria/nicho do negócio' },
  { key: '{{cidade}}', description: 'Cidade do lead' },
  { key: '{{contato}}', description: 'Nome do contato' },
  { key: '{{lead}}', description: 'ID do lead (Lead-001, etc.)' },
] as const;
