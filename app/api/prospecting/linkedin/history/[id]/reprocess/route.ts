/**
 * API: reprocessa uma busca de prospecção LinkedIn já existente
 * (prospecting_jobs.params) — equivalente ao "reprocessar" do histórico GMN.
 *
 * POST /api/prospecting/linkedin/history/[id]/reprocess
 * Lê os parâmetros originais do job (sob RLS do usuário, sem service role) e
 * roda o mesmo fluxo de searchPeople de novo com eles, criando um job novo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { linkedinProspectingService } from '@/lib/services/linkedin-prospecting.service';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: job, error: fetchError } = await supabase
    .from('prospecting_jobs')
    .select('params')
    .eq('id', params.id)
    .eq('channel', 'LinkedIn')
    .eq('job_type', 'search_people')
    .maybeSingle();

  if (fetchError || !job) {
    return NextResponse.json({ error: 'Busca não encontrada' }, { status: 404 });
  }

  try {
    const summary = await linkedinProspectingService.searchPeople(user.id, job.params);
    return NextResponse.json({ data: summary });
  } catch (err) {
    console.error('[prospecting/linkedin/history/reprocess] Erro inesperado:', err);
    return NextResponse.json({ error: 'Falha ao reprocessar busca' }, { status: 500 });
  }
}
