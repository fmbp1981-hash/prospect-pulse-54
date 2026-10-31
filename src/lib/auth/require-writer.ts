/**
 * RBAC dentro do tenant (F-13): quem pode ESCREVER.
 *
 * As rotas de escrita usam service_role (bypass de RLS), então o papel
 * 'visualizador' precisa ser barrado na própria rota.
 *
 * Regras:
 *  - admin da plataforma (public.platform_admins) → pode escrever;
 *  - com organização: organization_members.role in ('admin','operador');
 *  - sem organização: user_settings.role legado in ('admin','operador').
 *
 * Erro de consulta → false (falha fechada).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { isPlatformAdmin } from './platform-admin';

const WRITER_ROLES: readonly string[] = ['admin', 'operador'];
const ADMIN_ROLES: readonly string[] = ['admin'];

function getServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function requireWriter(userId: string): Promise<boolean> {
  return hasRole(userId, WRITER_ROLES);
}

/** Estrito: só admin da organização (ou da plataforma). Falha fechada. */
export async function requireOrgAdmin(userId: string): Promise<boolean> {
  return hasRole(userId, ADMIN_ROLES);
}

async function hasRole(userId: string, roles: readonly string[]): Promise<boolean> {
  if (!userId) return false;

  if (await isPlatformAdmin(userId)) return true;

  const db = getServiceClient();

  const { data: memberships, error: memberError } = await db
    .from('organization_members')
    .select('role')
    .eq('user_id', userId);

  if (memberError) {
    console.error('[require-writer] Falha ao consultar organization_members:', memberError.message);
    return false;
  }

  if (memberships && memberships.length > 0) {
    return memberships.some((m) => roles.includes(m.role));
  }

  const { data: settings, error: settingsError } = await db
    .from('user_settings')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (settingsError) {
    console.error('[require-writer] Falha ao consultar user_settings:', settingsError.message);
    return false;
  }

  return !!settings && roles.includes(settings.role);
}

/** Resposta padrão 403 para usuário sem permissão de escrita. */
export function forbiddenWriterResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'FORBIDDEN',
        message: 'Seu papel não permite esta ação.',
      },
    },
    { status: 403 }
  );
}

/** 403 para ações restritas a administradores da organização. */
export function forbiddenAdminResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'FORBIDDEN',
        message: 'Apenas administradores da organização podem alterar esta configuração.',
      },
    },
    { status: 403 }
  );
}
