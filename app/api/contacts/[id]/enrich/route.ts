import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { contactEnrichmentService } from '@/lib/services/contact-enrichment.service';
import { requireWriter, forbiddenWriterResponse } from '@/lib/auth/require-writer';
import {
  PROSPECTING_SOURCE_NOT_CONFIGURED_ERROR,
  isProspectingSourceNotConfigured,
} from '@/lib/connectors/prospecting/source';

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
  if (!(await requireWriter(user.id))) return forbiddenWriterResponse();

  try {
    const result = await contactEnrichmentService.enrichFromCompanyWebsite(params.id, user.id);
    if (!result) return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    return NextResponse.json({ data: result });
  } catch (err) {
    if (isProspectingSourceNotConfigured(err)) {
      return NextResponse.json({ error: PROSPECTING_SOURCE_NOT_CONFIGURED_ERROR }, { status: 409 });
    }
    console.error('[contacts/enrich] Erro inesperado:', err);
    return NextResponse.json({ error: 'Falha ao processar solicitação' }, { status: 500 });
  }
}
