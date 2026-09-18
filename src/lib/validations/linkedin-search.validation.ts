import * as z from 'zod';

export const linkedinSearchSchema = z.object({
  searchQuery: z.string().trim().min(1, 'Termo de busca obrigatório').max(300),
  locations: z.array(z.string().trim().min(1)).max(70).optional(),
  currentCompanies: z.array(z.string().trim().min(1)).max(50).optional(),
  currentJobTitles: z.array(z.string().trim().min(1)).max(50).optional(),
  industryIds: z.array(z.number().int().positive()).max(30).optional(),
  // Termo de cargo usado só para filtrar por relevância os resultados
  // DEPOIS de recebidos do Apify (não é enviado ao actor) — ver
  // linkedin-prospecting.service.ts. Existe porque o filtro nativo
  // currentJobTitles do LinkedIn é restritivo demais para frases longas em
  // português e pode zerar os resultados.
  titleFilterQuery: z.string().trim().max(300).optional(),
  maxItems: z.number().int().min(1).max(100).default(20),
  // Ativa o modo "Full + email search" do actor (custo extra por perfil) —
  // descoberta/validação de email por SMTP, independente do LinkedIn.
  findEmail: z.boolean().optional().default(false),
});

export type LinkedinSearchInput = z.infer<typeof linkedinSearchSchema>;
