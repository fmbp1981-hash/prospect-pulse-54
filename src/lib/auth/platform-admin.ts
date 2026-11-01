/**
 * Admin da PLATAFORMA (dono do SaaS) = linha em public.platform_admins.
 *
 * É a mesma definição usada no banco por public.is_platform_admin() /
 * public.is_admin() (migration 20261030130000). `user_settings.role = 'admin'`
 * NÃO basta: admin de organização também tem esse role.
 *
 * Consulta com service_role (platform_admins não tem acesso para
 * anon/authenticated). Erro de consulta → false (falha fechada).
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

function getServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;

  const { data, error } = await getServiceClient()
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[platform-admin] Falha ao consultar platform_admins:', error.message);
    return false;
  }

  return data?.user_id === userId;
}
