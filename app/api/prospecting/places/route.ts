/**
 * POST /api/prospecting/places
 *
 * Prospecção Google Places pela conexão `prospecting/google_places` da
 * organização da sessão (substitui a edge function `prospection`).
 * Usuário e organização vêm da sessão; leads gravados com o cliente da sessão.
 *
 * 400 VALIDATION_ERROR · 409 PROSPECTING_SOURCE_NOT_CONFIGURED ·
 * 502 PROSPECTING_PROVIDER_ERROR · 500 INTERNAL_ERROR (sem detalhes internos).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireWriter, forbiddenWriterResponse } from '@/lib/auth/require-writer';
import { resolveOrganizationIdForUser } from '@/lib/connectors/org-context';
import {
  PROSPECTING_SOURCE_NOT_CONFIGURED_ERROR,
  isProspectingSourceNotConfigured,
} from '@/lib/connectors/prospecting/source';
import { GooglePlacesError } from '@/lib/connectors/prospecting/google-places.adapter';
import { placesProspectingSchema } from '@/lib/validations/places-prospecting.validation';
import { createProspectedLeadsRepository } from '@/lib/repositories/prospected-leads.repository';
import { prospectPlaces } from '@/lib/services/places-prospecting.service';

export const runtime = 'nodejs';

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Autenticação necessária.');
    if (!(await requireWriter(user.id))) return forbiddenWriterResponse();

    const parsed = placesProspectingSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const message = first?.code === 'custom' ? first.message : 'Parâmetros de prospecção inválidos (quantidade de 1 a 60).';
      return errorResponse(400, 'VALIDATION_ERROR', message);
    }

    const organizationId = await resolveOrganizationIdForUser(user.id);
    if (!organizationId) {
      return NextResponse.json({ error: PROSPECTING_SOURCE_NOT_CONFIGURED_ERROR }, { status: 409 });
    }

    const result = await prospectPlaces({
      organizationId,
      userId: user.id,
      input: parsed.data,
      leads: createProspectedLeadsRepository(supabase),
    });
    return NextResponse.json({ data: result, meta: {} });
  } catch (err) {
    if (isProspectingSourceNotConfigured(err)) {
      return NextResponse.json({ error: PROSPECTING_SOURCE_NOT_CONFIGURED_ERROR }, { status: 409 });
    }
    if (err instanceof GooglePlacesError) {
      console.error('[prospecting/places] provider_error', { status: err.status });
      return errorResponse(502, 'PROSPECTING_PROVIDER_ERROR', 'Falha ao consultar o Google Places. Tente novamente em instantes.');
    }
    console.error('[prospecting/places] internal_error', { name: err instanceof Error ? err.name : 'erro' });
    return errorResponse(500, 'INTERNAL_ERROR', 'Falha ao realizar a prospecção.');
  }
}
