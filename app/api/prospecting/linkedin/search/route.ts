import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ZodError } from 'zod';
import { linkedinSearchSchema } from '@/lib/validations/linkedin-search.validation';
import { linkedinProspectingService } from '@/lib/services/linkedin-prospecting.service';

export const runtime = 'nodejs';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Erro desconhecido';
}

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
    const parsed = linkedinSearchSchema.parse(body);
    const summary = await linkedinProspectingService.searchPeople(user.id, parsed);
    return NextResponse.json({ data: summary });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: { code: 'BAD_REQUEST', details: err.flatten() } }, { status: 400 });
    }
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
