/**
 * Leads gerados pela prospecção, gravados com o cliente da SESSÃO (RLS e
 * triggers de leads_prospeccao valem como para o usuário), sempre filtrando
 * pela organização da sessão.
 *
 * Exceção: `leads_prospeccao.lead` (`Lead-NNN`) é UNIQUE global, então o
 * último número é lido da tabela inteira com service_role — só a coluna
 * `lead` de uma linha, nada mais sai dessa consulta.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type ProspectedLeadInsert = Database['public']['Tables']['leads_prospeccao']['Insert'];

/** ok=false traz o código do Postgres e, em 23505, o índice violado. */
export interface InsertLeadResult {
  ok: boolean;
  code?: string;
  constraint?: string;
}

function getServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Nome do índice/constraint violado, extraído da mensagem do Postgres (23505). */
function constraintOf(message: string | undefined): string | undefined {
  return message?.match(/unique constraint "([^"]+)"/)?.[1];
}

export function createProspectedLeadsRepository(db: SupabaseClient<Database>) {
  return {
    /** Referência (`Lead-NNN`) do lead mais recente da tabela inteira (numeração global). */
    async findLastGlobalLeadRef(): Promise<string | null> {
      const { data, error } = await getServiceClient()
        .from('leads_prospeccao')
        .select('lead')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw new Error(`findLastGlobalLeadRef: ${error.code ?? 'db_error'}`);
      const rows = (data ?? []) as Array<{ lead: string | null }>;
      return rows[0]?.lead ?? null;
    },

    /** Ids já existentes na organização; null se a consulta falhar (código logado). */
    async findExistingIds(organizationId: string, ids: string[]): Promise<Set<string> | null> {
      if (ids.length === 0) return new Set();
      const { data, error } = await db
        .from('leads_prospeccao')
        .select('id')
        .eq('organization_id', organizationId)
        .in('id', ids);
      if (error) {
        console.error('[prospected-leads] findExistingIds falhou', { code: error.code ?? 'db_error' });
        return null;
      }
      return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
    },

    /** Insere um lead; em erro devolve o código (e o índice, em 23505), sem dados do lead. */
    async insert(lead: ProspectedLeadInsert): Promise<InsertLeadResult> {
      const { error } = await db.from('leads_prospeccao').insert(lead);
      if (!error) return { ok: true };
      return { ok: false, code: error.code ?? 'db_error', constraint: constraintOf(error.message) };
    },
  };
}

export type ProspectedLeadsRepository = ReturnType<typeof createProspectedLeadsRepository>;
