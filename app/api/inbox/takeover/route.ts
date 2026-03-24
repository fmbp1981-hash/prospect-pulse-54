/**
 * POST /api/inbox/takeover
 * Consultant assumes a conversation — sets modo_atendimento='humano',
 * sends WA notification, records system message.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getWhatsAppProvider } from '@/lib/integrations/whatsapp/whatsapp.factory';

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

  // 1. Fetch lead
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (serviceSupabase as any)
    .from('leads_prospeccao')
    .select('id, whatsapp, modo_atendimento, data_ultima_acao_consultor, user_id')
    .eq('id', body.leadId)
    .eq('user_id', user.id)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  // 2. Idempotency: skip WA notification if recently taken over (< 60s)
  const lastAction = lead.data_ultima_acao_consultor as string | null;
  const recentlyTakenOver = lastAction
    && (Date.now() - new Date(lastAction).getTime()) < 60_000;

  // 3. Resolve consultant name
  const consultantName = user.user_metadata?.full_name
    || user.email?.split('@')[0]
    || 'Consultor';

  // 4. Update lead: set humano + record consultant activity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceSupabase as any)
    .from('leads_prospeccao')
    .update({
      modo_atendimento: 'humano',
      data_ultima_acao_consultor: new Date().toISOString(),
      consultor_responsavel: consultantName,
    })
    .eq('id', body.leadId);

  // 5. Send WA notification + save system message (only if not recently taken over)
  if (!recentlyTakenOver && lead.whatsapp) {
    try {
      // Get instance name from user settings
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: settings } = await (serviceSupabase as any)
        .from('user_settings')
        .select('evolution_instance_name')
        .eq('user_id', user.id)
        .single();

      const instanceName = settings?.evolution_instance_name
        || process.env.EVOLUTION_INSTANCE_NAME
        || '';

      if (instanceName) {
        const tagMessage = `[Consultor ${consultantName} entrou na conversa]`;
        const phone = String(lead.whatsapp).replace(/\D/g, '');

        const provider = getWhatsAppProvider();
        await provider.sendText(instanceName, phone, tagMessage);

        // Save system message to conversation history
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
    } catch (err) {
      console.error('[inbox/takeover] WA notification failed:', err);
      // Don't fail the takeover if WA notification fails
    }
  }

  return NextResponse.json({ success: true });
}
