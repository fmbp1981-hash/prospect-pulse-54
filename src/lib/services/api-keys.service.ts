/**
 * Resolve chaves de API de integrações de prospecção por tenant, com
 * fallback para variável de ambiente (útil em dev/self-host). Mesmo padrão
 * já usado para openai_api_key/resend_api_key em src/lib/userSettings.ts.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

async function resolveKey(userId: string, column: 'firecrawl_api_key' | 'apify_api_key'): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('user_settings')
    .select(column)
    .eq('user_id', userId)
    .maybeSingle();

  return (data?.[column] as string | null) ?? null;
}

export const apiKeysService = {
  async getFirecrawlApiKey(userId: string): Promise<string> {
    const tenantKey = await resolveKey(userId, 'firecrawl_api_key');
    const key = tenantKey || process.env.FIRECRAWL_API_KEY;
    if (!key) throw new Error('FIRECRAWL_API_KEY não configurada (nem por tenant, nem por env var)');
    return key;
  },

  async getApifyApiKey(userId: string): Promise<string> {
    const tenantKey = await resolveKey(userId, 'apify_api_key');
    const key = tenantKey || process.env.APIFY_API_KEY;
    if (!key) throw new Error('APIFY_API_KEY não configurada (nem por tenant, nem por env var)');
    return key;
  },
};
