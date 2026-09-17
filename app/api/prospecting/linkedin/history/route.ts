/**
 * API: histórico de buscas de prospecção LinkedIn do usuário autenticado.
 *
 * GET /api/prospecting/linkedin/history
 * Lê prospecting_jobs (channel = 'LinkedIn') sob RLS do usuário — sem
 * service role — e devolve um resumo por job para a UI unificada de
 * histórico de prospecção (GMN + LinkedIn na mesma lista).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

interface LinkedinJobParams {
  searchQuery?: string;
  locations?: string[];
  maxItems?: number;
}

interface LinkedinJobResultSummary {
  created?: number;
  skippedSuppressed?: number;
  skippedDuplicate?: number;
}

export async function GET(_req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('prospecting_jobs')
    .select('id, params, status, progress_found, result_summary, created_at')
    .eq('channel', 'LinkedIn')
    .eq('job_type', 'search_people')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[prospecting/linkedin/history] Erro ao buscar histórico:', error);
    return NextResponse.json({ error: 'Falha ao carregar histórico' }, { status: 500 });
  }

  const items = (data ?? []).map(job => {
    const params = (job.params ?? {}) as LinkedinJobParams;
    const summary = (job.result_summary ?? {}) as LinkedinJobResultSummary;
    const status = job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'error' : 'processing';

    return {
      id: job.id,
      searchQuery: params.searchQuery ?? '',
      locations: params.locations ?? [],
      quantity: params.maxItems ?? 20,
      status,
      found: job.progress_found ?? 0,
      created: summary.created ?? 0,
      skippedDuplicate: summary.skippedDuplicate ?? 0,
      skippedSuppressed: summary.skippedSuppressed ?? 0,
      createdAt: job.created_at,
    };
  });

  return NextResponse.json({ data: items });
}
