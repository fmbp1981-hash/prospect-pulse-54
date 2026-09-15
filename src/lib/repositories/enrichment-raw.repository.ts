/**
 * Repositório de enrichment_raw — proveniência bruta de conectores
 * não-LinkedIn (Firecrawl hoje), para auditoria/LGPD (retenção 90 dias).
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Json } from '@/integrations/supabase/types';

type EnrichmentRawInsert = Database['public']['Tables']['enrichment_raw']['Insert'];

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

export const enrichmentRawRepository = {
  async create(fields: Omit<EnrichmentRawInsert, 'raw_json'> & { raw_json: Json }): Promise<void> {
    const supabase = getServiceClient();
    const { error } = await supabase.from('enrichment_raw').insert(fields);
    if (error) throw new Error(`enrichmentRaw.create: ${error.message}`);
  },
};
