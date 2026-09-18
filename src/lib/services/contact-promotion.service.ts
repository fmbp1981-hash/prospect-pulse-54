/**
 * Ponte entre a área de estágio de prospecção (companies/contacts) e o CRM
 * (leads_prospeccao) — SEMPRE por ação explícita do usuário, nunca
 * automática. Ver references/architecture.md, seção "Por que a trava existe"
 * (discussão sobre automação vs. governança).
 */

import { createClient } from '@supabase/supabase-js';
import { contactsRepository } from '../repositories/contacts.repository';
import type { Database } from '@/integrations/supabase/types';

type LeadRow = Database['public']['Tables']['leads_prospeccao']['Row'];

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

async function getNextLeadSequence(userId: string): Promise<number> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('leads_prospeccao')
    .select('lead')
    .eq('user_id', userId)
    .like('lead', 'Lead-%')
    .order('created_at', { ascending: false })
    .limit(200);

  if (!data || data.length === 0) return 1;
  let max = 0;
  for (const row of data) {
    const match = row.lead?.match(/^Lead-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

export const contactPromotionService = {
  /**
   * Cria um lead em leads_prospeccao a partir de um contact do LinkedIn e
   * grava a ponte em contacts.converted_lead_id. Idempotente: se o contact
   * já tiver sido promovido, retorna o lead existente em vez de duplicar.
   */
  async promoteToLead(contactId: string, userId: string): Promise<LeadRow> {
    const contact = await contactsRepository.findById(contactId, userId);
    if (!contact) throw new Error('Contato não encontrado');

    const supabase = getServiceClient();

    if (contact.converted_lead_id) {
      const { data: existingLead, error } = await supabase
        .from('leads_prospeccao')
        .select('*')
        .eq('id', contact.converted_lead_id)
        .maybeSingle();
      if (error) throw new Error(`contactPromotion.promoteToLead: ${error.message}`);
      if (existingLead) return existingLead;
    }

    const company = contact.company_id
      ? await contactsRepository.findCompanyById(contact.company_id, userId)
      : null;

    const seq = await getNextLeadSequence(userId);
    const leadId = crypto.randomUUID();

    const { data: lead, error: insertError } = await supabase
      .from('leads_prospeccao')
      .insert({
        id: leadId,
        user_id: userId,
        lead: `Lead-${String(seq).padStart(3, '0')}`,
        empresa: company?.name ?? contact.name,
        contato: contact.name,
        categoria: company?.industry ?? contact.role_title ?? contact.headline ?? null,
        cidade: contact.city ?? contact.location_raw ?? null,
        website: company?.domain ? (company.domain.startsWith('http') ? company.domain : `https://${company.domain}`) : null,
        email: contact.email,
        telefone: contact.phone,
        linkedin: contact.linkedin_url,
        origem: 'LinkedIn',
        status: 'Novo Lead',
        estagio_pipeline: 'Novo Lead',
        status_msg_wa: 'not_sent',
        modo_atendimento: 'bot',
      })
      .select()
      .single();

    if (insertError) throw new Error(`contactPromotion.promoteToLead: ${insertError.message}`);

    await contactsRepository.update(contactId, userId, { converted_lead_id: lead.id });

    return lead;
  },
};
