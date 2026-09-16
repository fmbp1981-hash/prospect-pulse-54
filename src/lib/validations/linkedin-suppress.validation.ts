import { z } from 'zod';

export const linkedinSuppressSchema = z.object({
  linkedinSlug: z.string().min(1, 'linkedinSlug obrigatório'),
  reason: z.string().max(500).optional(),
});

export type LinkedinSuppressInput = z.infer<typeof linkedinSuppressSchema>;
