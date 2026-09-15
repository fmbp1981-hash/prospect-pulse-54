/**
 * Repositório de contacts — pessoas descobertas via canais de prospecção
 * (LinkedIn hoje). Ver references/architecture.md.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type ContactRow = Database['public']['Tables']['contacts']['Row'];
type CompanyRow = Database['public']['Tables']['companies']['Row'];
type ContactInsert = Database['public']['Tables']['contacts']['Insert'];
type ContactUpdate = Database['public']['Tables']['contacts']['Update'];

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

export const contactsRepository = {
  async findById(id: string, userId: string): Promise<ContactRow | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error(`contacts.findById: ${error.message}`);
    return data;
  },

  async findCompanyById(companyId: string, userId: string): Promise<CompanyRow | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error(`contacts.findCompanyById: ${error.message}`);
    return data;
  },

  async findByLinkedinSlug(userId: string, linkedinSlug: string): Promise<ContactRow | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .eq('linkedin_slug', linkedinSlug)
      .maybeSingle();

    if (error) throw new Error(`contacts.findByLinkedinSlug: ${error.message}`);
    return data;
  },

  async create(fields: ContactInsert): Promise<ContactRow> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('contacts')
      .insert(fields)
      .select()
      .single();

    if (error) throw new Error(`contacts.create: ${error.message}`);
    return data;
  },

  async update(id: string, userId: string, fields: ContactUpdate): Promise<ContactRow> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('contacts')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new Error(`contacts.update: ${error.message}`);
    return data;
  },
};
