// Cliente Supabase para uso no browser
// Adaptado para Next.js App Router com @supabase/ssr

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Verificar se as variáveis estão configuradas
const isConfigured = SUPABASE_URL && SUPABASE_ANON_KEY;

// Função para criar cliente (útil em Server Components)
export function createClient() {
  if (!isConfigured) {
    console.warn('⚠️ Supabase não configurado. Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local');
    // Retornar um mock client para evitar crashes durante desenvolvimento
    return null as unknown as ReturnType<typeof createBrowserClient<Database>>;
  }
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Singleton para componentes client (evita múltiplas instâncias)
let browserClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!isConfigured) {
    return null as unknown as ReturnType<typeof createBrowserClient<Database>>;
  }
  
  if (typeof window === 'undefined') {
    // Server-side: criar novo cliente
    return createClient();
  }
  
  // Client-side: reutilizar cliente existente
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}

// Export principal para uso em toda a aplicação
export const supabase = getSupabaseClient();
