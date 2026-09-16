/**
 * Enriquecimento de contato via Firecrawl (fallback quando o LinkedIn não
 * traz email/telefone) — gap-fill: só roda para o campo que estiver vazio.
 * Ver references/architecture.md, seção 9.
 *
 * Nunca marca o dado como "verificado" — telefone/email achados numa página
 * institucional são "declarados publicamente", não confirmados com o titular.
 */

import { contactsRepository } from '../repositories/contacts.repository';
import { enrichmentRawRepository } from '../repositories/enrichment-raw.repository';
import {
  firecrawlClient,
  filterCandidateContactPages,
  type FirecrawlMapLink,
} from '../integrations/firecrawl-client';
import { normalizePhone, normalizeEmail } from '../import/normalizer';
import { apiKeysService } from './api-keys.service';
import type { Database, Json } from '@/integrations/supabase/types';

type ContactRow = Database['public']['Tables']['contacts']['Row'];

export interface EnrichContactResult {
  contact: ContactRow;
  emailFound: boolean;
  phoneFound: boolean;
  pagesChecked: number;
}

const MAX_PAGES_TO_SCRAPE = 5;

function extractDomain(url: string): string | null {
  try {
    const withProtocol = url.startsWith('http') ? url : `https://${url}`;
    return new URL(withProtocol).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export const contactEnrichmentService = {
  /**
   * Tenta preencher email e/ou telefone de um contato via site institucional
   * da empresa vinculada. Não faz nada se o contato já tiver os dois campos,
   * ou se a empresa vinculada não tiver domínio conhecido.
   */
  async enrichFromCompanyWebsite(contactId: string, userId: string): Promise<EnrichContactResult | null> {
    const contact = await contactsRepository.findById(contactId, userId);
    if (!contact) return null;

    const needsEmail = !contact.email;
    const needsPhone = !contact.phone;
    if (!needsEmail && !needsPhone) {
      return { contact, emailFound: false, phoneFound: false, pagesChecked: 0 };
    }

    if (!contact.company_id) return { contact, emailFound: false, phoneFound: false, pagesChecked: 0 };
    const company = await contactsRepository.findCompanyById(contact.company_id, userId);
    const domain = company?.domain ? extractDomain(company.domain) : null;
    if (!domain) return { contact, emailFound: false, phoneFound: false, pagesChecked: 0 };

    const apiKey = await apiKeysService.getFirecrawlApiKey(userId);
    const links = await firecrawlClient.mapDomain(apiKey, domain);
    const candidates = filterCandidateContactPages(links).slice(0, MAX_PAGES_TO_SCRAPE);

    let foundEmail: string | null = null;
    let foundPhone: string | null = null;
    let sourceUrl: string | null = null;
    let rawExtraction: FirecrawlMapLink[] = [];

    for (const page of candidates) {
      const extracted = await firecrawlClient.extractContactInfo(apiKey, page.url);
      rawExtraction = [...rawExtraction, page];

      if (needsEmail && !foundEmail && extracted.email) {
        const normalized = normalizeEmail(extracted.email);
        if (normalized.value) {
          foundEmail = normalized.value;
          sourceUrl = page.url;
        }
      }
      if (needsPhone && !foundPhone && extracted.phone) {
        const normalized = normalizePhone(extracted.phone);
        if (normalized.value) {
          foundPhone = normalized.value;
          sourceUrl = sourceUrl ?? page.url;
        }
      }

      if ((!needsEmail || foundEmail) && (!needsPhone || foundPhone)) break;
    }

    if (foundEmail || foundPhone) {
      await enrichmentRawRepository.create({
        user_id: userId,
        contact_id: contactId,
        company_id: contact.company_id,
        source_tool: 'firecrawl_scrape',
        source_url: sourceUrl,
        raw_json: { candidates: rawExtraction, email: foundEmail, phone: foundPhone } as unknown as Json,
      });
    }

    const updates: Database['public']['Tables']['contacts']['Update'] = {};
    if (foundEmail) {
      updates.email = foundEmail;
      updates.email_source = 'firecrawl_company_site';
    }
    if (foundPhone) {
      updates.phone = foundPhone;
      updates.phone_source = 'firecrawl_company_site';
    }

    const updatedContact = Object.keys(updates).length > 0
      ? await contactsRepository.update(contactId, userId, updates)
      : contact;

    return {
      contact: updatedContact,
      emailFound: Boolean(foundEmail),
      phoneFound: Boolean(foundPhone),
      pagesChecked: candidates.length,
    };
  },
};
