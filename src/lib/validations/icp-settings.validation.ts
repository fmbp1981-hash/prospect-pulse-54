import * as z from 'zod';

// Perfil de Cliente Ideal (ICP) — configuração única por empresa, canal-agnóstica.
// Ver docs/PROSPECCAO-MULTICANAL.md e references/architecture.md.
export const icpSettingsSchema = z.object({
  targetCategories: z.array(z.string().trim().min(1)).default([]),
  targetCities: z.array(z.string().trim().min(1)).default([]),
  targetStates: z.array(z.string().trim().min(1)).default([]),
  targetSeniorities: z.array(z.string().trim().min(1)).default([]),
  targetDepartments: z.array(z.string().trim().min(1)).default([]),
  minEmployeeCount: z.number().int().nonnegative().nullable().optional(),
  maxEmployeeCount: z.number().int().nonnegative().nullable().optional(),
  requireContactChannel: z.boolean().default(true),
});

export type IcpSettingsFormData = z.infer<typeof icpSettingsSchema>;
