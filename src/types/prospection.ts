export interface ProspectionSearch {
  id: string;
  niche: string;
  location: string;
  quantity: number;
  webhookUrl: string;
  timestamp: Date;
  status: 'pending' | 'processing' | 'completed' | 'error';
  whatsappStatus?: 'not_sent' | 'sent' | 'failed';
  whatsappSentAt?: Date;
}

export interface ProspectionFormData {
  niche: string;
  location: string;
  quantity: number;
  webhookUrl: string;
}

// Tipos completos do CRM (Google Sheets)
export type LeadStatus = 
  | 'Novo Lead'
  | 'Contato Inicial'
  | 'Qualificação'
  | 'Proposta Enviada'
  | 'Negociação'
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
  | 'Outro';

export interface Lead {
  id: string;
  lead: string; // Nome do lead
  status: LeadStatus;
  empresa: string;
  whatsapp: string;
  contatoPrincipal: string;
  segmento: string;
  regiao: string;
  ticketMedioEstimado: number;
  origem: LeadOrigin;
  dataContato: string; // ISO date string
  proximoFollowUp?: string; // ISO date string
  prioridade: LeadPriority;
  observacoes?: string;
  statusMsgWA: WhatsAppStatus;
  dataEnvioWA?: string; // ISO date string
  resultado?: string;
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
