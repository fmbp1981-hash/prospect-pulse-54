/**
 * Repositório de icp_settings — Perfil de Cliente Ideal (ICP), uma linha por
 * usuário/empresa, reaproveitada por todos os canais de prospecção.
 * Ver docs/PROSPECCAO-MULTICANAL.md e references/architecture.md.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type IcpSettingsRow = Database['public']['Tables']['icp_settings']['Row'];
type IcpSettingsUpsert = Database['public']['Tables']['icp_settings']['Insert'];

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

export const icpSettingsRepository = {
  /**
   * Busca a configuração de ICP do usuário. Retorna null se ainda não foi
   * configurada (o trigger de icp_fit_status trata a ausência como "sem
   * restrição", não como erro).
   */
  async findByUserId(userId: string): Promise<IcpSettingsRow | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('icp_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error(`icpSettings.findByUserId: ${error.message}`);
    return data;
  },

  /**
   * Cria ou atualiza a configuração de ICP do usuário (singleton por user_id).
   */
  async upsert(userId: string, fields: Omit<IcpSettingsUpsert, 'user_id'>): Promise<IcpSettingsRow> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('icp_settings')
      .upsert(
        { ...fields, user_id: userId, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) throw new Error(`icpSettings.upsert: ${error.message}`);
    return data;
  },
};
