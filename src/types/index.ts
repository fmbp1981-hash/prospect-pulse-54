// src/types/index.ts
// Fonte única de verdade para tipos do domínio.
// Importe sempre daqui: import type { Lead, UserRole, ... } from '@/types'

// Re-exporta tipos de prospection (Lead, LeadStatus, ConversationStatus, etc.)
export * from './prospection'

// Re-exporta tipos de roles (UserRole, RolePermissions, ROLE_PERMISSIONS, etc.)
export * from './roles'

// ---------------------------------------------------------------------------
// Tipos de domínio adicionais (não definidos nos arquivos acima)
// ---------------------------------------------------------------------------

/**
 * Cliente / Tenant do sistema.
 * Representa a empresa que usa o LeadFinder Pro (ex.: XPAG Brasil).
 */
export interface Cliente {
  id: string
  nome: string
  cnpj?: string
  email?: string
  whatsapp?: string
  website?: string
  plano: 'trial' | 'starter' | 'pro' | 'enterprise'
  ativo: boolean
  createdAt: string
  updatedAt?: string
}

/**
 * Campanha de disparo em massa (WhatsApp ou Email).
 */
export interface Campaign {
  id: string
  user_id: string
  nome: string
  canal: 'whatsapp' | 'email'
  assunto?: string        // Apenas para email
  corpo: string
  status: 'rascunho' | 'agendada' | 'em_andamento' | 'concluida' | 'cancelada'
  total_leads: number
  enviados: number
  falhas: number
  agendado_para?: string | null
  iniciado_em?: string | null
  concluido_em?: string | null
  createdAt: string
  updatedAt?: string
}

/**
 * Filtro de audiência para campanhas.
 */
export interface CampaignAudienceFilter {
  categoria?: string
  cidade?: string
  estagio_pipeline?: string
  status_msg_wa?: string
}
