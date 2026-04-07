// src/validations/lead.schema.ts
import { z } from 'zod'

export const createLeadSchema = z.object({
  empresa: z.string().min(1, 'Nome da empresa obrigatório').max(200),
  contato: z.string().max(100).optional(),
  whatsapp: z.string()
    .regex(/^\+55\d{10,11}$/, 'WhatsApp inválido (formato: +55XXXXXXXXXXX)')
    .optional()
    .or(z.literal('')),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  cidade: z.string().max(100).optional(),
  categoria: z.string().max(100).optional(),
})

export const updateLeadSchema = createLeadSchema.partial().extend({
  estagio_pipeline: z.enum([
    'Novo',
    'Contato Inicial',
    'Qualificação',
    'Follow-up',
    'Transferido para Consultor',
    'Fechado Ganho',
    'Fechado Perdido',
  ]).optional(),
  status_msg_wa: z.enum([
    'Em Conversa',
    'Qualificando',
    'Qualificado',
    'Follow-up',
    'Transferido',
  ]).optional(),
  modo_atendimento: z.enum(['bot', 'humano']).optional(),
})

export const emailCampaignSchema = z.object({
  leadIds: z.array(z.string()).min(1, 'Selecione ao menos um lead'),
  subject: z.string().min(1, 'Assunto obrigatório').max(200),
  body: z.string().min(1, 'Corpo do email obrigatório'),
})

export type CreateLeadInput = z.infer<typeof createLeadSchema>
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>
export type EmailCampaignInput = z.infer<typeof emailCampaignSchema>
