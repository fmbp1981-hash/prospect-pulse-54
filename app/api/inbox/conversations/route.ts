import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@/integrations/supabase/types';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const filter = req.nextUrl.searchParams.get('filter') ?? 'transferred';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('leads_prospeccao')
    .select('id, lead, empresa, whatsapp, modo_atendimento, estagio_pipeline, data_ultima_interacao, data_transferencia')
    .eq('user_id', user.id)
    .order('data_ultima_interacao', { ascending: false })
    .limit(100);

  if (filter === 'transferred') {
    query = query.eq('modo_atendimento', 'humano');
  }

  const { data: leads, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!leads || leads.length === 0) return NextResponse.json([]);

  const serviceSupabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = await Promise.all((leads as any[]).map(async (lead: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: convo } = await (serviceSupabase as any)
      .from('whatsapp_conversations')
      .select('message_lead, message_agent, timestamp, created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const lastMessage = convo ? (convo.message_lead || convo.message_agent || '') : '';
    const lastMessageAt = convo
      ? (convo.timestamp || convo.created_at)
      : lead.data_ultima_interacao;

    return {
      leadId: lead.id,
      leadRef: lead.lead,
      name: lead.empresa,
      whatsapp: lead.whatsapp,
      modo_atendimento: lead.modo_atendimento,
      estagio_pipeline: lead.estagio_pipeline,
      dataTransferencia: lead.data_transferencia,
      lastMessage: (lastMessage as string).slice(0, 80),
      lastMessageAt,
    };
  }));

  const filtered = filter === 'all'
    ? results.filter(r => r.lastMessageAt)
    : results;

  return NextResponse.json(filtered);
}
