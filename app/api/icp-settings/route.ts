import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ZodError } from 'zod';
import { icpSettingsSchema } from '@/lib/validations/icp-settings.validation';
import { icpSettingsService } from '@/lib/services/icp-settings.service';

export const runtime = 'nodejs';

async function getAuthenticatedUser() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Erro desconhecido';
}

export async function GET(_req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await icpSettingsService.get(user.id);
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body: unknown = await req.json();
    const parsed = icpSettingsSchema.parse(body);
    const data = await icpSettingsService.update(user.id, parsed);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: { code: 'BAD_REQUEST', details: err.flatten() } }, { status: 400 });
    }
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
