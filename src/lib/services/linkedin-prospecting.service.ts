/**
 * Orquestra a busca de pessoas no LinkedIn (camada cookieless, Apify) e o
 * upsert em companies/contacts — nunca grava em leads_prospeccao diretamente
 * (a ponte pro CRM é só via contacts.converted_lead_id, ação separada).
 * Ver references/architecture.md, seção 9, e docs/PROSPECCAO-MULTICANAL.md.
 */

import { apifyClient, extractDiscoveredEmail, type LinkedInProfileResult } from '../integrations/apify-client';
import { apiKeysService } from './api-keys.service';
import { companiesRepository } from '../repositories/companies.repository';
import { contactsRepository } from '../repositories/contacts.repository';
import { linkedinRawRepository } from '../repositories/linkedin-raw.repository';
import { linkedinSuppressionRepository } from '../repositories/linkedin-suppression.repository';
import { prospectingJobsRepository } from '../repositories/prospecting-jobs.repository';
import { linkedinSearchSchema, type LinkedinSearchInput } from '../validations/linkedin-search.validation';
import type { Json } from '@/integrations/supabase/types';

export interface LinkedinSearchContact {
  id: string;
  name: string;
  roleTitle: string | null;
  linkedinUrl: string;
  locationRaw: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  convertedLeadId: string | null;
}

export interface LinkedinSearchSummary {
  jobId: string;
  found: number;
  created: number;
  skippedSuppressed: number;
  skippedDuplicate: number;
  skippedTitleMismatch: number;
  contacts: LinkedinSearchContact[];
}

// Preposições/artigos comuns em cargos PT-BR — ignorados no match de
// relevância para não exigir que apareçam literalmente no título do perfil.
const TITLE_STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'para', 'com',
]);

function normalizeTitleText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .trim();
}

function significantWords(text: string): string[] {
  return normalizeTitleText(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !TITLE_STOPWORDS.has(w));
}

/**
 * Verifica se o cargo atual resolvido do perfil é relevante para o termo de
 * cargo buscado. Existe porque o filtro nativo `currentJobTitles` do ator
 * Apify (LinkedIn "Current title" filter) é restritivo demais para frases
 * longas em português — muitas vezes zera a busca inteira — então filtramos
 * por relevância nós mesmos, depois de já ter os perfis em mãos: exige que a
 * maioria das palavras significativas do termo buscado apareça no título
 * atual (ordem livre, tolera variações como "Gerente Comercial Regional" vs.
 * "Gerente Regional Comercial").
 */
function isRelevantToTitleQuery(currentTitle: string | undefined, titleFilterQuery: string): boolean {
  if (!currentTitle) return false;
  const queryWords = significantWords(titleFilterQuery);
  if (queryWords.length === 0) return true;

  const normalizedTitle = normalizeTitleText(currentTitle);
  const matchedCount = queryWords.filter((w) => normalizedTitle.includes(w)).length;
  const requiredMatches = Math.max(1, Math.ceil(queryWords.length / 2));
  return matchedCount >= requiredMatches;
}

function companySlugFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || null;
  } catch {
    return null;
  }
}

interface CurrentRole {
  title?: string;
  companyName?: string;
  companyLinkedinUrl?: string;
  companyId?: string;
}

/**
 * Empresa e cargo atuais do perfil. `currentPosition` do actor só tem
 * empresa (sem título de cargo) — o cargo mora em `experience[0].position`
 * (a experiência do topo = mais recente). Por isso combinamos as duas: o
 * topo de `experience` dá empresa+cargo juntos; `currentPosition[0]` é usado
 * só como reforço quando `experience` vier vazio.
 */
function resolveCurrentRole(profile: LinkedInProfileResult): CurrentRole | null {
  const topExperience = profile.experience?.[0];
  const currentPosition = profile.currentPosition?.[0];

  if (!topExperience && !currentPosition) return null;

  return {
    title: topExperience?.position,
    companyName: topExperience?.companyName ?? currentPosition?.companyName,
    companyLinkedinUrl: topExperience?.companyLinkedinUrl ?? currentPosition?.companyLinkedinUrl,
    companyId: topExperience?.companyId ?? currentPosition?.companyId,
  };
}

async function upsertCompanyForProfile(userId: string, apiKey: string, position: CurrentRole) {
  if (!position?.companyName) return null;
  const slug = companySlugFromUrl(position.companyLinkedinUrl);
  const company = await companiesRepository.findOrCreate(userId, {
    name: position.companyName,
    linkedin_url: position.companyLinkedinUrl ?? null,
    linkedin_slug: slug,
    channel: 'LinkedIn',
  });

  // Enriquece industry/site/porte só na primeira vez que vemos essa empresa
  // (evita gastar chamadas do actor de company em toda repetição de busca).
  if (!company.industry && position.companyLinkedinUrl) {
    try {
      const details = await apifyClient.getCompanyDetails(apiKey, position.companyLinkedinUrl);
      if (details) {
        const hq = details.locations?.find(l => l.headquarter) ?? details.locations?.[0];
        return await companiesRepository.update(company.id, userId, {
          industry: details.industries?.[0] ?? null,
          domain: details.website ?? null,
          city: hq?.parsed?.city ?? null,
          country: hq?.parsed?.country ?? null,
          size_label: details.employeeCountRange
            ? `${details.employeeCountRange.start ?? ''}${details.employeeCountRange.end ? `-${details.employeeCountRange.end}` : '+'}`
            : null,
          size_min: details.employeeCountRange?.start ?? null,
          size_max: details.employeeCountRange?.end ?? null,
        });
      }
    } catch {
      // Best-effort: falha no enriquecimento de empresa não pode derrubar a busca de pessoas.
    }
  }

  return company;
}

export const linkedinProspectingService = {
  async searchPeople(userId: string, rawInput: unknown): Promise<LinkedinSearchSummary> {
    const input: LinkedinSearchInput = linkedinSearchSchema.parse(rawInput);
    const apiKey = await apiKeysService.getApifyApiKey(userId);

    const job = await prospectingJobsRepository.create(userId, input as unknown as Json);

    try {
      const results = await apifyClient.searchLinkedInPeople(apiKey, {
        searchQuery: input.searchQuery,
        locations: input.locations,
        currentCompanies: input.currentCompanies,
        currentJobTitles: input.currentJobTitles,
        industryIds: input.industryIds,
        maxItems: input.maxItems,
        mode: input.findEmail ? 'Full + email search' : 'Full',
      });

      const suppressed = await linkedinSuppressionRepository.filterSuppressed(
        userId,
        results.map(r => r.profile.id)
      );

      let created = 0;
      let skippedSuppressed = 0;
      let skippedDuplicate = 0;
      let skippedTitleMismatch = 0;
      const contacts: LinkedinSearchContact[] = [];

      for (const { profile, raw } of results) {
        if (suppressed.has(profile.id)) {
          skippedSuppressed++;
          continue;
        }

        const existing = await contactsRepository.findByLinkedinSlug(userId, profile.id);
        if (existing) {
          skippedDuplicate++;
          continue;
        }

        const currentRole = resolveCurrentRole(profile);

        if (input.titleFilterQuery && !isRelevantToTitleQuery(currentRole?.title, input.titleFilterQuery)) {
          skippedTitleMismatch++;
          continue;
        }

        const company = currentRole ? await upsertCompanyForProfile(userId, apiKey, currentRole) : null;
        const discoveredEmail = input.findEmail ? extractDiscoveredEmail(profile) : null;

        const contact = await contactsRepository.create({
          user_id: userId,
          company_id: company?.id ?? null,
          channel: 'LinkedIn',
          name: `${profile.firstName} ${profile.lastName}`.trim(),
          linkedin_url: profile.linkedinUrl,
          linkedin_slug: profile.id,
          role_title: currentRole?.title ?? null,
          headline: profile.headline ?? null,
          location_raw: profile.location?.linkedinText ?? null,
          city: profile.location?.parsed?.city ?? null,
          state_name: profile.location?.parsed?.state ?? null,
          country: profile.location?.parsed?.country ?? null,
          email: discoveredEmail,
          email_source: discoveredEmail ? 'apify_email_search' : null,
          job_id: job.id,
          status: 'novo',
        });

        contacts.push({
          id: contact.id,
          name: contact.name,
          roleTitle: contact.role_title,
          linkedinUrl: contact.linkedin_url ?? profile.linkedinUrl,
          locationRaw: contact.location_raw,
          companyName: company?.name ?? null,
          email: contact.email,
          phone: contact.phone,
          convertedLeadId: contact.converted_lead_id,
        });

        await linkedinRawRepository.create({
          user_id: userId,
          contact_id: contact.id,
          company_id: company?.id ?? null,
          job_id: job.id,
          source_tool: 'linkedin_scraper',
          source_url: profile.linkedinUrl,
          raw_json: raw as Json,
        });

        created++;
      }

      const resultSummary: {
        created: number;
        skippedSuppressed: number;
        skippedDuplicate: number;
        skippedTitleMismatch: number;
      } = { created, skippedSuppressed, skippedDuplicate, skippedTitleMismatch };

      await prospectingJobsRepository.complete(job.id, {
        status: 'completed',
        progress_found: results.length,
        result_summary: resultSummary as unknown as Json,
      });

      return {
        jobId: job.id,
        found: results.length,
        created,
        skippedSuppressed,
        skippedDuplicate,
        skippedTitleMismatch,
        contacts,
      };
    } catch (err) {
      await prospectingJobsRepository.complete(job.id, {
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Erro desconhecido',
      });
      throw err;
    }
  },
};
