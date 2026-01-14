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

// Função para criar cliente apenas quando no browser
function createSupabaseClient(): SupabaseBrowserClient | null {
  // Apenas criar cliente se estiver no browser E variáveis configuradas
  if (typeof window === 'undefined') {
    // Durante SSR, retornar null - componentes devem lidar com isso
    return null;
  }

  // No browser, verificar configuração
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('⚠️ Supabase não configurado. Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return null;
  }

  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Função para obter cliente (lazy initialization)
export function getSupabaseClient(): SupabaseBrowserClient | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!browserClient) {
    browserClient = createSupabaseClient();
  }
  return browserClient;
}

// Função para criar novo cliente (útil em casos específicos)
export function createClient(): SupabaseBrowserClient | null {
  return createSupabaseClient();
}

// Export principal - LAZY, não cria no momento do import
// Usar getSupabaseClient() para obter o cliente quando necessário
export const supabase = {
  get auth() {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase client not initialized. Are you running on the server?');
    }
    return client.auth;
  },
  get from() {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase client not initialized. Are you running on the server?');
    }
    return client.from.bind(client);
  },
  get storage() {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase client not initialized. Are you running on the server?');
    }
    return client.storage;
  },
  get functions() {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase client not initialized. Are you running on the server?');
    }
    return client.functions;
  },
  get channel() {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase client not initialized. Are you running on the server?');
    }
    return client.channel.bind(client);
  },
  get removeChannel() {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase client not initialized. Are you running on the server?');
    }
    return client.removeChannel.bind(client);
  },
};
