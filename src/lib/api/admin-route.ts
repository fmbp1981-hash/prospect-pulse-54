/**
 * Utilitários das rotas /api/admin/* de conexões (Sprint 2b).
 *
 * - authorizePlatformAdmin: 401 sem sessão, 403 se não é admin da PLATAFORMA.
 * - adminErrorResponse: mapeia ConnectionsAdminError e erros inesperados para
 *   `{ error: { code, message } }` sem detalhes internos.
 */
import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform-admin';
import { ConnectionsAdminError } from '@/lib/services/connections-admin.service';

export function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function validationErrorResponse(error: ZodError) {
  const first = error.issues[0];
  const path = first?.path.join('.') ?? '';
  const message = first ? `${path ? `${path}: ` : ''}${first.message}` : 'Dados inválidos.';
  return errorResponse(400, 'VALIDATION_ERROR', message);
}

export async function authorizePlatformAdmin(): Promise<
  { userId: string; response?: undefined } | { userId?: undefined; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { response: errorResponse(401, 'UNAUTHORIZED', 'Autenticação necessária.') };
  if (!(await isPlatformAdmin(user.id))) {
    return { response: errorResponse(403, 'FORBIDDEN', 'Acesso restrito ao admin da plataforma.') };
  }
  return { userId: user.id };
}

export function adminErrorResponse(err: unknown, label: string) {
  if (err instanceof ConnectionsAdminError) return errorResponse(err.status, err.code, err.message);
  console.error(`[${label}] internal_error`, { name: err instanceof Error ? err.name : 'erro' });
  return errorResponse(500, 'INTERNAL_ERROR', 'Falha ao processar a solicitação.');
}
