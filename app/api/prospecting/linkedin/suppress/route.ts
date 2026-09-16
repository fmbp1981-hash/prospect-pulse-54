/**
 * API: Direito ao apagamento/oposição (LGPD Art. 18) para contatos LinkedIn.
 *
 * POST /api/prospecting/linkedin/suppress
 * Apaga o contato do usuário autenticado e registra o slug na lista de
 * supressão, para que buscas futuras nunca o recriem.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ZodError } from 'zod';
import { linkedinSuppressSchema } from '@/lib/validations/linkedin-suppress.validation';
import { linkedinSuppressionService } from '@/lib/services/linkedin-suppression.service';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body: unknown = await req.json();
    const parsed = linkedinSuppressSchema.parse(body);
    await linkedinSuppressionService.suppressContact(user.id, parsed);
    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: { code: 'BAD_REQUEST', details: err.flatten() } }, { status: 400 });
    }
    console.error('[linkedin/suppress] Erro inesperado:', err);
    return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
  }
}
