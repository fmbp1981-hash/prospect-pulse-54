/**
 * Repositório de linkedin_raw — proveniência bruta do scraping de LinkedIn,
 * para auditoria/LGPD (retenção 90 dias, já default no schema).
 */

import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';

type LinkedinRawInsert = Database['public']['Tables']['linkedin_raw']['Insert'];

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

export const linkedinRawRepository = {
  async create(fields: Omit<LinkedinRawInsert, 'raw_json'> & { raw_json: Json }): Promise<void> {
    const supabase = getServiceClient();
    const { error } = await supabase.from('linkedin_raw').insert(fields);
    if (error) throw new Error(`linkedinRaw.create: ${error.message}`);
  },
};
