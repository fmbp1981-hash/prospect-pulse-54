// Match com o Perfil de Cliente Ideal (ICP) configurado em icp_settings — ver
// docs/PROSPECCAO-MULTICANAL.md. NÃO confundir com o estágio de pipeline
// "Qualificação" em LeadStatus, que é conversacional (conduzido pelo agente de SDR).
export type IcpFitStatus = 'pending' | 'fit' | 'no_fit' | 'disqualified' | 'quarantine';

export interface LocationData {
  country: string;
  state: string;
  city: string;
  neighborhood?: string;
  [key: string]: string | undefined;
}

// Canal de prospecção: Google Maps/Places (GMN) ou LinkedIn (camada pública, via Apify)
export type ProspectionChannel = 'gmn' | 'linkedin';

// Como o usuário formulou a busca no LinkedIn — só afeta rótulo/placeholder do
// campo principal; o backend sempre recebe um único `searchQuery` de texto livre.
export type LinkedinSearchBy = 'pessoa' | 'empresa' | 'cargo';

export interface ProspectionSearch {
  id: string;
  channel?: ProspectionChannel; // ausente = 'gmn' (retrocompatibilidade com histórico antigo)
  niche: string; // GMN: nicho/produto. LinkedIn: termo de busca (searchQuery)
  location: string | LocationData;
  quantity: number;
  webhookUrl?: string;
  timestamp: Date;
  status: 'pending' | 'processing' | 'completed' | 'error';
  whatsappStatus?: 'not_sent' | 'sent' | 'failed';
  whatsappSentAt?: Date;
  savedCount?: number; // Number of leads saved in this search
  // Resumo específico de jobs de LinkedIn (prospecting_jobs.result_summary)
  linkedinJobId?: string;
  linkedinSummary?: {
    found: number;
    created: number;
    skippedDuplicate: number;
    skippedSuppressed: number;
  };
}

export interface ProspectionFormData {
  niche: string;
  location: LocationData;
  quantity: number;
  webhookUrl?: string;
  businessName?: string; // Nome específico do estabelecimento (opcional)
  searchMode?: 'niche' | 'product'; // Modo de busca: nicho/categoria ou produto/serviço
}

// Item individual de contato retornado por uma busca no LinkedIn
export interface LinkedinSearchContact {
  id: string;
  name: string;
  roleTitle: string | null;
  linkedinUrl: string;
  locationRaw: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  convertedLeadId: string | null;
}

export interface LinkedinSearchSummary {
  jobId: string;
  found: number;
  created: number;
  skippedSuppressed: number;
  skippedDuplicate: number;
  // Perfis descartados por filtro de relevância de cargo (modo "cargo") —
  // cargo atual resolvido não bateu o suficiente com o termo buscado.
  skippedTitleMismatch: number;
  contacts: LinkedinSearchContact[];
}

// Tipos completos do CRM - Novo Pipeline (7 estágios)
export type LeadStatus =
  // Pipeline Principal (7 estágios - reorganizado em 2025)
  | 'Novo Lead'                    // #1 - Prospecção via sistema
  | 'Contato Inicial'              // #2 - MSG WhatsApp disparada
  | 'Qualificação'                 // #3 - Agente IA qualificando (faturamento >= R$50k)
  | 'Transferido para Consultor'   // #4 - Lead qualificado, transferido
  | 'Fechado Ganho'                // #5 - Negócio fechado com sucesso
  | 'Fechado Perdido'              // #6 - Negócio não fechou
  | 'Follow-up'                    // #7 - Não qualificados ou estagnados >= 7 dias
  // Deprecated (para retrocompatibilidade com dados antigos)
  | 'Proposta Enviada'  // Migra → Qualificação
  | 'Negociação'        // Migra → Transferido para Consultor
  | 'Fechado'           // Migra → Fechado Ganho
  | 'Em Follow-up'      // Migra → Follow-up
  | 'Novo';             // Migra → Novo Lead

export type LeadPriority = 'Alta' | 'Média' | 'Baixa';

// Status de envio de mensagem WhatsApp
export type WhatsAppStatus = 'not_sent' | 'sent' | 'failed';

// Status de conversação do agente de IA (compatível com n8n workflow)
export type ConversationStatus =
  | 'Em Conversa'      // Lead respondeu e está em conversa ativa
  | 'Qualificando'     // Em processo de qualificação (diagnóstico)
  | 'Qualificado'      // Faturamento >= R$ 50k, pronto para transferência
  | 'Follow-up'        // Não qualificado, manter contato futuro
  | 'Transferido';     // Transferido para consultor humano

export type LeadOrigin =
  | 'Prospecção Ativa'
  | 'Indicação'
  | 'Site'
  | 'Redes Sociais'
  | 'Evento'
  | 'Google Places'
  | 'LinkedIn'
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
  linkedin?: string | null;
  cidade?: string;
  endereco?: string;
  bairro?: string; // Novo campo mapeado diretamente
  bairroRegiao?: string; // Mapeado de bairro_regiao (deprecated)
  linkGMN?: string; // Mapeado de link_gmn
  aceitaCartao?: string; // Mapeado de aceita_cartao
  cnpj?: string;
  mensagemWhatsApp?: string; // Mapeado de mensagem_whatsapp
  statusMsgWA?: WhatsAppStatus; // Mapeado de status_msg_wa
  dataEnvioWA?: string | null; // Mapeado de data_envio_wa
  resumoAnalitico?: string; // Mapeado de resumo_analitico
  createdAt?: string; // created_at
  updatedAt?: string; // updated_at

  // Match com o Perfil de Cliente Ideal (ICP) — docs/PROSPECCAO-MULTICANAL.md
  icpFitStatus?: IcpFitStatus; // Mapeado de icp_fit_status
  icpFitReason?: string | null; // Mapeado de icp_fit_reason
  icpFitEvaluatedAt?: string | null; // Mapeado de icp_fit_evaluated_at

  // Email marketing
  statusEmail?: 'not_sent' | 'sent' | 'failed'; // Mapeado de status_email
  dataEnvioEmail?: string | null; // Mapeado de data_envio_email

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
