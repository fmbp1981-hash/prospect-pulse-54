// src/validations/campaign.schema.ts
import { z } from 'zod'

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  channel: z.enum(['whatsapp', 'email']),
  subject: z.string().max(200).optional(),
  body: z.string().min(1, 'Conteúdo da campanha obrigatório'),
})

export const sendCampaignSchema = z.object({
  audienceFilter: z.object({
    categoria: z.string().optional(),
    cidade: z.string().optional(),
    estagio_pipeline: z.string().optional(),
    status_msg_wa: z.string().optional(),
  }).optional(),
})

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>
export type SendCampaignInput = z.infer<typeof sendCampaignSchema>
