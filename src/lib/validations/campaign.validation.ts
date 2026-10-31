import * as z from 'zod';

// PATCH /api/campaigns/[id] — allowlist do que o dono pode editar num rascunho.
// .strict(): qualquer outro campo (organization_id, user_id, status, channel,
// contadores, datas internas) → 400. A rota grava com service_role, então o
// banco não filtra nada por ela (achado F-06).
const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)])
);

export const campaignPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2000).nullable(),
    subject: z.string().max(500).nullable(),
    body: z.string().min(1).max(20000),
    audience_filter: z.record(jsonValue).nullable(),
    scheduled_at: z.string().datetime({ offset: true }).nullable(),
  })
  .partial()
  .strict();

export type CampaignPatch = z.infer<typeof campaignPatchSchema>;
