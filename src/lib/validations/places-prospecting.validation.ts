import { z } from 'zod';

export const PLACES_MAX_QUANTITY = 60;

const text = (max: number) => z.string().trim().max(max);

const locationSchema = z.union([
  text(300),
  z.object({
    country: text(100).optional().default(''),
    state: text(100).optional().default(''),
    city: text(150).optional().default(''),
    neighborhood: text(150).optional(),
  }),
]);

/**
 * Corpo de POST /api/prospecting/places (mesmo formato do antigo
 * `ProspectionRequest` da edge function, sem `user_id`: o usuário vem da sessão).
 * Sem nome do estabelecimento, nicho e localização são obrigatórios.
 */
export const placesProspectingSchema = z
  .object({
    niche: text(200).optional().default(''),
    location: locationSchema.optional(),
    quantity: z.number().int().min(1).max(PLACES_MAX_QUANTITY).optional().default(50),
    businessName: text(200).optional(),
    bairros: z.array(text(150)).max(50).optional(),
    searchMode: z.enum(['niche', 'product']).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.businessName) return;
    if (!input.niche) {
      ctx.addIssue({ code: 'custom', path: ['niche'], message: 'Informe o nicho ou o nome do estabelecimento' });
    }
    const loc = input.location;
    const hasLocation = typeof loc === 'string' ? loc.length > 0 : Boolean(loc?.city);
    if (!hasLocation) {
      ctx.addIssue({ code: 'custom', path: ['location'], message: 'Informe a localização para busca por nicho' });
    }
  });

export type PlacesProspectingInput = z.infer<typeof placesProspectingSchema>;
