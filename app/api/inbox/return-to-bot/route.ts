/**
 * POST /api/inbox/return-to-bot
 * Returns a conversation from human mode back to bot mode.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { leadId?: string };
  if (!body.leadId) {
    return NextResponse.json({ error: 'leadId required' }, { status: 400 });
  }

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify lead belongs to user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (serviceSupabase as any)
    .from('leads_prospeccao')
    .select('id, modo_atendimento')
    .eq('id', body.leadId)
    .eq('user_id', user.id)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  if (lead.modo_atendimento === 'bot') {
    return NextResponse.json({ success: true, message: 'Already in bot mode' });
  }

  // Update lead to bot mode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (serviceSupabase as any)
    .from('leads_prospeccao')
    .update({
      modo_atendimento: 'bot',
      data_ultima_acao_consultor: new Date().toISOString(),
    })
    .eq('id', body.leadId);

  if (updateErr) {
    console.error('[inbox/return-to-bot] update failed:', updateErr);
    return NextResponse.json({ error: 'Failed to return to bot' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
