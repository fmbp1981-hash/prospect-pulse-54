/**
 * Cliente Apify — conector LinkedIn, camada cookieless (public_web_research).
 * NUNCA usa cookie/conta LinkedIn autenticada — ver references/architecture.md,
 * seção 9, e docs/PROSPECCAO-MULTICANAL.md, seção 3.2 (classificação de risco).
 *
 * Actors escolhidos (schemas validados em 2026-09-15/17 consultando o schema
 * real via API do Apify, não assumidos de memória):
 * - harvestapi/linkedin-profile-search — busca de pessoas
 * - harvestapi/linkedin-company — detalhe de empresa (industry, site, porte),
 *   usado para enriquecer a empresa vinculada a cada perfil encontrado.
 */

import { z } from 'zod';

const APIFY_BASE_URL = 'https://api.apify.com/v2';
const PEOPLE_ACTOR_ID = 'harvestapi~linkedin-profile-search';
const COMPANY_ACTOR_ID = 'harvestapi~linkedin-company';

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
  headline: z.string().optional(),
  summary: z.string().optional(),
  // Campo real do actor é "currentPosition" (singular) — e NÃO tem título de
  // cargo, só empresa (companyId/companyLinkedinUrl/companyName/dateRange).
  // O título/cargo mora em `experience[0].position` (a experiência do topo =
  // mais recente). Confirmado consultando o schema real do actor.
  currentPosition: z
    .array(
      z.object({
        companyName: z.string().optional(),
        companyLinkedinUrl: z.string().optional(),
        companyId: z.string().optional(),
      })
    )
    .optional(),
  experience: z
    .array(
      z.object({
        position: z.string().optional(),
        companyName: z.string().optional(),
        companyLinkedinUrl: z.string().optional(),
        companyId: z.string().optional(),
      })
    )
    .optional(),
  location: z
    .object({
      linkedinText: z.string().optional(),
      parsed: z
        .object({
          city: z.string().optional(),
          state: z.string().optional(),
          country: z.string().optional(),
          countryCode: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  pictureUrl: z.string().optional(),
  // Modo "Full + email search": nome exato do(s) campo(s) de email não é
  // documentado publicamente pela HarvestAPI — aceitamos os formatos mais
  // prováveis (todos opcionais, não quebram o parse se o nome real for
  // outro). O item bruto original também é preservado à parte (ver
  // searchLinkedInPeople) justamente para permitir descobrir o nome real
  // depois, sem precisar rodar o actor de novo às cegas.
  email: z.string().optional(),
  workEmail: z.string().optional(),
  emails: z.array(z.string()).optional(),
});

export type LinkedInProfileResult = z.infer<typeof linkedInProfileResultSchema>;

/** Extrai o email descoberto tolerando os nomes de campo candidatos acima. */
export function extractDiscoveredEmail(profile: LinkedInProfileResult): string | null {
  return profile.email ?? profile.workEmail ?? profile.emails?.[0] ?? null;
}

// Schema do item retornado pelo actor de detalhe de empresa — só os campos
// que usamos para enriquecer companies (industry/site/porte/localização).
const linkedInCompanyResultSchema = z.object({
  linkedinUrl: z.string().optional(),
  universalName: z.string().optional(),
  name: z.string().optional(),
  industries: z.array(z.string()).optional(),
  website: z.string().optional(),
  employeeCount: z.number().optional(),
  employeeCountRange: z.object({ start: z.number().optional(), end: z.number().optional() }).optional(),
  description: z.string().optional(),
  locations: z
    .array(
      z.object({
        headquarter: z.boolean().optional(),
        parsed: z
          .object({
            city: z.string().optional(),
            country: z.string().optional(),
            countryCode: z.string().optional(),
          })
          .optional(),
      })
    )
    .optional(),
});

export type LinkedInCompanyResult = z.infer<typeof linkedInCompanyResultSchema>;

export interface LinkedInProfileSearchResult {
  profile: LinkedInProfileResult;
  /** Item bruto (não filtrado pelo schema) — guardar pra depuração futura de campos novos/renomeados. */
  raw: unknown;
}

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
  ): Promise<LinkedInProfileSearchResult[]> {
    const res = await fetch(
      `${APIFY_BASE_URL}/acts/${PEOPLE_ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 'Full' abre cada perfil (custo extra de ~US$0,004/perfil) para
          // trazer headline, localização estruturada e experiência completa —
          // 'Short' só devolve nome/id/localização básica.
          profileScraperMode: params.mode ?? 'Full',
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
      throw new Error(`Apify ${PEOPLE_ACTOR_ID} falhou: ${res.status} ${text}`);
    }

    const raw: unknown = await res.json();
    if (!Array.isArray(raw)) return [];

    const results: LinkedInProfileSearchResult[] = [];
    let dropped = 0;
    for (const item of raw) {
      const parsed = linkedInProfileResultSchema.safeParse(item);
      if (parsed.success) {
        results.push({ profile: parsed.data, raw: item });
      } else {
        dropped++;
      }
    }
    // Item descartado pelo schema quase sempre é o actor tendo mudado o
    // formato de saída (como aconteceu com currentPosition) — isso é
    // silencioso por design (não derruba a busca), mas precisa aparecer nos
    // logs pra não passar despercebido de novo.
    if (dropped > 0) {
      console.warn(`[apify-client] ${dropped}/${raw.length} perfis descartados por não baterem com o schema esperado — o actor pode ter mudado o formato de saída.`);
    }
    return results;
  },

  /**
   * Busca detalhes de UMA empresa no LinkedIn (industry, site, porte,
   * localização) a partir da URL do perfil da empresa. Best-effort: quem
   * chama deve tratar falha/ausência sem quebrar o fluxo principal de busca
   * de pessoas.
   */
  async getCompanyDetails(apiKey: string, companyLinkedinUrl: string): Promise<LinkedInCompanyResult | null> {
    const res = await fetch(
      `${APIFY_BASE_URL}/acts/${COMPANY_ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies: [companyLinkedinUrl] }),
      }
    );

    if (!res.ok) return null;

    const raw: unknown = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const parsed = linkedInCompanyResultSchema.safeParse(raw[0]);
    return parsed.success ? parsed.data : null;
  },
};
