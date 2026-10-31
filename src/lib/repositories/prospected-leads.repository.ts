/**
 * Leads gerados pela prospecção, gravados com o cliente da SESSÃO (RLS e
 * triggers de leads_prospeccao valem como para o usuário), sempre filtrando
 * pela organização da sessão.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type ProspectedLeadInsert = Database['public']['Tables']['leads_prospeccao']['Insert'];

export function createProspectedLeadsRepository(db: SupabaseClient<Database>) {
  return {
    /** Referência (`Lead-NNN`) do lead mais recente da organização; null se não houver. */
    async findLastLeadRef(organizationId: string): Promise<string | null> {
      const { data, error } = await db
        .from('leads_prospeccao')
        .select('lead')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw new Error(`findLastLeadRef: ${error.code ?? 'db_error'}`);
      const rows = (data ?? []) as Array<{ lead: string | null }>;
      return rows[0]?.lead ?? null;
    },

    /** Ids já existentes na organização; null se a consulta falhar. */
    async findExistingIds(organizationId: string, ids: string[]): Promise<Set<string> | null> {
      if (ids.length === 0) return new Set();
      const { data, error } = await db
        .from('leads_prospeccao')
        .select('id')
        .eq('organization_id', organizationId)
        .in('id', ids);
      if (error) return null;
      return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
    },

    /** Insere um lead; devolve false se o banco recusar. */
    async insert(lead: ProspectedLeadInsert): Promise<boolean> {
      const { error } = await db.from('leads_prospeccao').insert(lead);
      return !error;
    },
  };
}

export type ProspectedLeadsRepository = ReturnType<typeof createProspectedLeadsRepository>;
