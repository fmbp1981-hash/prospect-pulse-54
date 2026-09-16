import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { contactPromotionService } from '@/lib/services/contact-promotion.service';

export const runtime = 'nodejs';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Erro desconhecido';
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const lead = await contactPromotionService.promoteToLead(params.id, user.id);
    return NextResponse.json({ data: lead });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
