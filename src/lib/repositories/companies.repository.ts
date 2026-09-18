/**
 * Repositório de companies — empresas descobertas via canais de prospecção
 * (LinkedIn hoje). Nunca grava em leads_prospeccao diretamente — ver
 * references/architecture.md.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type CompanyRow = Database['public']['Tables']['companies']['Row'];
type CompanyInsert = Database['public']['Tables']['companies']['Insert'];
type CompanyUpdate = Database['public']['Tables']['companies']['Update'];

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

export const companiesRepository = {
  async findByLinkedinSlug(userId: string, linkedinSlug: string): Promise<CompanyRow | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('user_id', userId)
      .eq('linkedin_slug', linkedinSlug)
      .maybeSingle();

    if (error) throw new Error(`companies.findByLinkedinSlug: ${error.message}`);
    return data;
  },

  async create(fields: CompanyInsert): Promise<CompanyRow> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('companies')
      .insert(fields)
      .select()
      .single();

    if (error) throw new Error(`companies.create: ${error.message}`);
    return data;
  },

  async update(id: string, userId: string, fields: CompanyUpdate): Promise<CompanyRow> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('companies')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new Error(`companies.update: ${error.message}`);
    return data;
  },

  /**
   * Busca por linkedin_slug (dedup real, tem índice único); se não achar e
   * não tiver slug pra deduplicar, cria uma empresa nova. Aceita alguma
   * duplicidade por nome quando não há slug — mesma decisão já registrada
   * em references/architecture.md sobre "chaves fracas" não fundirem
   * automaticamente (ver docs/PROSPECCAO-MULTICANAL.md, seção 6.2).
   */
  async findOrCreate(userId: string, fields: Omit<CompanyInsert, 'user_id'>): Promise<CompanyRow> {
    if (fields.linkedin_slug) {
      const existing = await this.findByLinkedinSlug(userId, fields.linkedin_slug);
      if (existing) return existing;
    }
    return this.create({ ...fields, user_id: userId });
  },
};
