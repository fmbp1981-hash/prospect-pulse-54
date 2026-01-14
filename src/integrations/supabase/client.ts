// Cliente Supabase para uso no browser
// Adaptado para Next.js App Router com @supabase/ssr

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Tipo do cliente browser
type SupabaseBrowserClient = ReturnType<typeof createBrowserClient<Database>>;

// Singleton para componentes client (evita múltiplas instâncias)
let browserClient: SupabaseBrowserClient | null = null;

// Função para criar cliente
function createSupabaseClient(): SupabaseBrowserClient {
  return createBrowserClient<Database>(
    SUPABASE_URL || 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY || 'placeholder-key'
  );
}

// Função para obter cliente (lazy initialization)
export function getSupabaseClient(): SupabaseBrowserClient {
  if (!browserClient) {
    browserClient = createSupabaseClient();
  }
  return browserClient;
}

// Função para criar novo cliente (útil em casos específicos)
export function createClient(): SupabaseBrowserClient {
  return createSupabaseClient();
}

// Export principal - sempre retorna um cliente válido (pode usar placeholders durante SSR)
// O cliente com placeholders falhará nas operações, mas não causa erro de tipo
export const supabase: SupabaseBrowserClient = getSupabaseClient();
