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

  /**
   * Adiciona um slug à lista de supressão — efetiva o direito ao apagamento/
   * oposição (LGPD Art. 18). Idempotente: chamar de novo para o mesmo slug
   * não duplica a entrada.
   */
  async suppress(userId: string, linkedinSlug: string, reason?: string): Promise<void> {
    const supabase = getServiceClient();
    const { data: existing } = await supabase
      .from('linkedin_suppression_list')
      .select('id')
      .eq('user_id', userId)
      .eq('linkedin_slug', linkedinSlug)
      .maybeSingle();

    if (existing) return;

    const { error } = await supabase
      .from('linkedin_suppression_list')
      .insert({ user_id: userId, linkedin_slug: linkedinSlug, reason: reason ?? null });

    if (error) throw new Error(`linkedinSuppression.suppress: ${error.message}`);
  },
};
