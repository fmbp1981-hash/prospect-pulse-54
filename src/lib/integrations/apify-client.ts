/**
 * Cliente Apify — conector LinkedIn, camada cookieless (public_web_research).
 * NUNCA usa cookie/conta LinkedIn autenticada — ver references/architecture.md,
 * seção 9, e docs/PROSPECCAO-MULTICANAL.md, seção 3.2 (classificação de risco).
 *
 * Actor escolhido: harvestapi/linkedin-profile-search — validado em 2026-09-15
 * consultando o schema real via API do Apify (não assumido de memória).
 */

import { z } from 'zod';

const APIFY_BASE_URL = 'https://api.apify.com/v2';
const ACTOR_ID = 'harvestapi~linkedin-profile-search';

export type ProfileScraperMode = 'Short' | 'Full' | 'Full + email search';

export interface LinkedInPeopleSearchParams {
  searchQuery: string;
  locations?: string[];
  currentCompanies?: string[];
  currentJobTitles?: string[];
  industryIds?: number[];
  maxItems?: number;
  mode?: ProfileScraperMode;
}

// Schema do item retornado pelo actor (campos que realmente usamos — o
// dataset real tem mais campos, ignorados aqui). Validado contra chamada
// real ao actor, não assumido de memória.
const linkedInProfileResultSchema = z.object({
  id: z.string(),
  linkedinUrl: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  summary: z.string().optional(),
  currentPositions: z
    .array(
      z.object({
        title: z.string().optional(),
        companyName: z.string().optional(),
        companyLinkedinUrl: z.string().optional(),
        companyId: z.string().optional(),
        current: z.boolean().optional(),
      })
    )
    .optional(),
  location: z.object({ linkedinText: z.string().optional() }).optional(),
  pictureUrl: z.string().optional(),
});

export type LinkedInProfileResult = z.infer<typeof linkedInProfileResultSchema>;

export const apifyClient = {
  /**
   * Busca pessoas no LinkedIn via camada cookieless (sem login, sem risco de
   * banimento de conta). Itens que não batem com o schema esperado são
   * descartados silenciosamente (não derruba a busca inteira por um item
   * malformado ou por o actor ter mudado o formato de saída).
   */
  async searchLinkedInPeople(
    apiKey: string,
    params: LinkedInPeopleSearchParams
  ): Promise<LinkedInProfileResult[]> {
    const res = await fetch(
      `${APIFY_BASE_URL}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileScraperMode: params.mode ?? 'Short',
          searchQuery: params.searchQuery,
          locations: params.locations,
          currentCompanies: params.currentCompanies,
          currentJobTitles: params.currentJobTitles,
          industryIds: params.industryIds,
          maxItems: params.maxItems ?? 20,
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Apify ${ACTOR_ID} falhou: ${res.status} ${text}`);
    }

    const raw: unknown = await res.json();
    if (!Array.isArray(raw)) return [];

    const results: LinkedInProfileResult[] = [];
    for (const item of raw) {
      const parsed = linkedInProfileResultSchema.safeParse(item);
      if (parsed.success) results.push(parsed.data);
    }
    return results;
  },
};
