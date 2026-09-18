/**
 * Orquestra a busca de pessoas no LinkedIn (camada cookieless, Apify) e o
 * upsert em companies/contacts — nunca grava em leads_prospeccao diretamente
 * (a ponte pro CRM é só via contacts.converted_lead_id, ação separada).
 * Ver references/architecture.md, seção 9, e docs/PROSPECCAO-MULTICANAL.md.
 */

import { apifyClient, type LinkedInProfileResult } from '../integrations/apify-client';
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
  contacts: LinkedinSearchContact[];
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

async function upsertCompanyForProfile(
  userId: string,
  apiKey: string,
  position: LinkedInProfileResult['currentPositions'] extends (infer U)[] | undefined ? U : never
) {
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
      const profiles = await apifyClient.searchLinkedInPeople(apiKey, {
        searchQuery: input.searchQuery,
        locations: input.locations,
        currentCompanies: input.currentCompanies,
        currentJobTitles: input.currentJobTitles,
        industryIds: input.industryIds,
        maxItems: input.maxItems,
      });

      const suppressed = await linkedinSuppressionRepository.filterSuppressed(
        userId,
        profiles.map(p => p.id)
      );

      let created = 0;
      let skippedSuppressed = 0;
      let skippedDuplicate = 0;
      const contacts: LinkedinSearchContact[] = [];

      for (const profile of profiles) {
        if (suppressed.has(profile.id)) {
          skippedSuppressed++;
          continue;
        }

        const existing = await contactsRepository.findByLinkedinSlug(userId, profile.id);
        if (existing) {
          skippedDuplicate++;
          continue;
        }

        const currentPosition = profile.currentPositions?.find(p => p.current) ?? profile.currentPositions?.[0];
        const company = currentPosition ? await upsertCompanyForProfile(userId, apiKey, currentPosition) : null;

        const contact = await contactsRepository.create({
          user_id: userId,
          company_id: company?.id ?? null,
          channel: 'LinkedIn',
          name: `${profile.firstName} ${profile.lastName}`.trim(),
          linkedin_url: profile.linkedinUrl,
          linkedin_slug: profile.id,
          role_title: currentPosition?.title ?? null,
          headline: profile.headline ?? null,
          location_raw: profile.location?.linkedinText ?? null,
          city: profile.location?.parsed?.city ?? null,
          state_name: profile.location?.parsed?.state ?? null,
          country: profile.location?.parsed?.country ?? null,
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
          raw_json: profile as unknown as Json,
        });

        created++;
      }

      await prospectingJobsRepository.complete(job.id, {
        status: 'completed',
        progress_found: profiles.length,
        result_summary: { created, skippedSuppressed, skippedDuplicate } as unknown as Json,
      });

      return { jobId: job.id, found: profiles.length, created, skippedSuppressed, skippedDuplicate, contacts };
    } catch (err) {
      await prospectingJobsRepository.complete(job.id, {
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Erro desconhecido',
      });
      throw err;
    }
  },
};
