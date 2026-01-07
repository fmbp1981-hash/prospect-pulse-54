import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/integrations/supabase/types';

// Criar cliente browser uma única vez
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );
}

// Singleton para usar em componentes client
let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (typeof window === 'undefined') {
    // Server side - criar novo cliente
    return createClient();
  }
  
  // Client side - reutilizar cliente existente
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}

// Export padrão para compatibilidade
export const supabase = typeof window !== 'undefined' 
  ? getSupabaseClient() 
  : null as unknown as ReturnType<typeof createClient>;
