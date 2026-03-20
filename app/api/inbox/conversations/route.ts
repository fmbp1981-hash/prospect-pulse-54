/**
 * GET /api/inbox/conversations
 * Returns leads with conversations for the current user's tenant.
 * Query params: filter = 'transferred' | 'mine' | 'all' (default: 'transferred')
 */

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
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const filter = req.nextUrl.searchParams.get('filter') ?? 'all';

  // Service client for cross-table reads
  const serviceSupabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Build leads query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (serviceSupabase as any)
    .from('leads_prospeccao')
    .select('id, lead, empresa, whatsapp, modo_atendimento, estagio_pipeline, data_transferencia, data_ultima_acao_consultor, consultor_responsavel, contato')
    .eq('user_id', user.id)
    .order('data_ultima_interacao', { ascending: false })
    .limit(100);

  if (filter === 'transferred') {
    query = query.eq('modo_atendimento', 'humano');
  } else if (filter === 'mine') {
    // Leads where the current user is the active consultant
    const userName = user.user_metadata?.full_name || user.email || '';
    query = query.eq('modo_atendimento', 'humano').eq('consultor_responsavel', userName);
  }
  // 'all' — no additional filter, shows all leads

  const { data: leads, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({ leads: [] });
  }

  // For each lead, fetch the last conversation message
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (leads as any[]).map(async (lead: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lastMsg } = await (serviceSupabase as any)
        .from('whatsapp_conversations')
        .select('message_lead, message_agent, timestamp, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const msg = lastMsg?.[0];
      const lastMessage = msg
        ? (msg.message_lead || msg.message_agent || '')
        : null;
      const lastMessageAt = msg
        ? (msg.timestamp || msg.created_at || null)
        : null;

      return {
        leadId: lead.id,
        leadRef: lead.lead || '',
        name: lead.empresa || lead.contato || 'Sem nome',
        whatsapp: lead.whatsapp || '',
        modo_atendimento: lead.modo_atendimento || 'bot',
        estagio_pipeline: lead.estagio_pipeline || '',
        dataTransferencia: lead.data_transferencia || null,
        lastMessage,
        lastMessageAt,
      };
    })
  );

  // For 'all' filter, only return leads that have at least one conversation
  const filtered = filter === 'all'
    ? results.filter(r => r.lastMessageAt)
    : results;

  return NextResponse.json({ leads: filtered });
}
