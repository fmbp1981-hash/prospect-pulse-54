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
  webhookUrl: string;
  timestamp: Date;
  status: 'pending' | 'processing' | 'completed' | 'error';
  whatsappStatus?: 'not_sent' | 'sent' | 'failed';
  whatsappSentAt?: Date;
}

export interface ProspectionFormData {
  niche: string;
  location: LocationData;
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
  
  // Campos básicos do Excel
  lead: string; // Nome do lead (Coluna A)
  data?: string; // Data (Coluna B) - ISO date
  status: LeadStatus; // Status (Coluna C)
  categoria?: string; // Categoria (Coluna D)
  empresa: string; // Empresa (Coluna E)
  cidade?: string; // Cidade (Coluna F)
  endereco?: string; // Endereço (Coluna G)
  
  // Contato
  whatsapp: string; // WhatsApp (Coluna H)
  email?: string; // Email (Coluna I)
  website?: string; // Website (Coluna J)
  instagram?: string; // Instagram (Coluna K)
  linkGMN?: string; // Link GMN (Coluna L)
  aceitaCartao?: boolean; // Aceita Cartão (Coluna M)
  
  // CRM fields (mapeados ou adicionais)
  contatoPrincipal: string;
  segmento: string;
  regiao: string;
  ticketMedioEstimado: number;
  origem: LeadOrigin;
  dataContato: string; // ISO date string
  proximoFollowUp?: string; // ISO date string
  prioridade: LeadPriority;
  observacoes?: string;
  
  // WhatsApp tracking
  mensagemWhatsApp?: string; // Mensagem WhatsApp (Coluna O)
  statusMsgWA: WhatsAppStatus; // Status Msg. WA (Coluna P)
  dataEnvioWA?: string; // Data Envio WA (Coluna Q) - ISO date
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
