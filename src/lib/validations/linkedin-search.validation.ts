import * as z from 'zod';

export const linkedinSearchSchema = z.object({
  searchQuery: z.string().trim().min(1, 'Termo de busca obrigatório').max(300),
  locations: z.array(z.string().trim().min(1)).max(70).optional(),
  currentCompanies: z.array(z.string().trim().min(1)).max(50).optional(),
  currentJobTitles: z.array(z.string().trim().min(1)).max(50).optional(),
  industryIds: z.array(z.number().int().positive()).max(30).optional(),
  maxItems: z.number().int().min(1).max(100).default(20),
});

export type LinkedinSearchInput = z.infer<typeof linkedinSearchSchema>;
