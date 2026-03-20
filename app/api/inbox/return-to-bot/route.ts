import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { leadService } from '@/lib/services/lead.service';
import type { Database } from '@/integrations/supabase/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { leadId?: string };
  if (!body.leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const serviceSupabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify lead belongs to the authenticated user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (serviceSupabase as any)
    .from('leads_prospeccao')
    .select('id')
    .eq('id', body.leadId)
    .eq('user_id', user.id)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  await leadService.returnToBot(body.leadId);

  return NextResponse.json({ success: true });
}
