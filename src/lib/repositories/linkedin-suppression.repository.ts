/**
 * Repositório de linkedin_suppression_list — direito ao apagamento (LGPD).
 * Consultado antes de todo upsert em contacts para não ressuscitar quem
 * pediu exclusão (comentário original da migration linkedin_lgpd).
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

export const linkedinSuppressionRepository = {
  /**
   * Retorna o subconjunto de slugs que estão na lista de supressão do
   * usuário — esses NUNCA devem ser (re)criados como contact.
   */
  async filterSuppressed(userId: string, linkedinSlugs: string[]): Promise<Set<string>> {
    if (linkedinSlugs.length === 0) return new Set();

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('linkedin_suppression_list')
      .select('linkedin_slug')
      .eq('user_id', userId)
      .in('linkedin_slug', linkedinSlugs);

    if (error) throw new Error(`linkedinSuppression.filterSuppressed: ${error.message}`);
    return new Set((data ?? []).map(row => row.linkedin_slug));
  },
};
