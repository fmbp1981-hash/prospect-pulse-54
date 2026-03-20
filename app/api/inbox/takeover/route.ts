import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getWhatsAppProvider } from '@/lib/integrations/whatsapp/whatsapp.factory';
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (serviceSupabase as any)
    .from('leads_prospeccao')
    .select('id, whatsapp, modo_atendimento, data_ultima_acao_consultor')
    .eq('id', body.leadId)
    .eq('user_id', user.id)
    .single();

  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // Idempotency: skip WA notification if already taken over in last 60s
  const lastAction = lead.data_ultima_acao_consultor as string | null;
  const recentlyTakenOver = lastAction
    && (Date.now() - new Date(lastAction).getTime()) < 60_000;

  // Update lead: set humano + record consultant activity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceSupabase as any)
    .from('leads_prospeccao')
    .update({
      modo_atendimento: 'humano',
      data_ultima_acao_consultor: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.leadId);

  if (!recentlyTakenOver && lead.whatsapp) {
    const firstName =
      (user.user_metadata?.full_name as string | undefined)?.split(' ')[0]
      || user.email?.split('@')[0]
      || 'Consultor';

    const tagMessage = `[${firstName} entrou na conversa]`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: settings } = await (serviceSupabase as any)
      .from('user_settings')
      .select('evolution_instance_name')
      .eq('user_id', user.id)
      .single();

    const instanceName =
      settings?.evolution_instance_name || process.env.EVOLUTION_DEFAULT_INSTANCE!;

    const provider = getWhatsAppProvider();
    const sendResult = await provider.sendText(instanceName, lead.whatsapp, tagMessage);

    if (!sendResult.success) {
      console.warn('[Takeover] WA notification failed:', sendResult.error);
    }

    // Save tag message to conversation history
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (serviceSupabase as any)
      .from('whatsapp_conversations')
      .insert({
        lead_id: body.leadId,
        message_agent: tagMessage,
        from_lead: false,
        ai_generated: false,
        user_id: user.id,
        status: 'respondido',
        timestamp: new Date().toISOString(),
      });
  }

  return NextResponse.json({ success: true });
}
