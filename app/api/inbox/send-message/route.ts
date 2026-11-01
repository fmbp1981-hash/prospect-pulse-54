/**
 * POST /api/inbox/send-message
 * Consultant sends a text message to a lead via WhatsApp,
 * saves to conversation history, and updates timestamps.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getWhatsAppProvider } from '@/lib/integrations/whatsapp/whatsapp.factory';
import { resolveInstanceForUser } from '@/lib/services/tenant-resolver.service';
import { requireWriter, forbiddenWriterResponse } from '@/lib/auth/require-writer';

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
  if (!(await requireWriter(user.id))) return forbiddenWriterResponse();

  const body = await req.json() as { leadId?: string; message?: string };
  if (!body.leadId || !body.message?.trim()) {
    return NextResponse.json({ error: 'leadId and message required' }, { status: 400 });
  }

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Fetch lead (verify ownership)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (serviceSupabase as any)
    .from('leads_prospeccao')
    .select('id, whatsapp, user_id')
    .eq('id', body.leadId)
    .eq('user_id', user.id)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  if (!lead.whatsapp) {
    return NextResponse.json({ error: 'Lead has no WhatsApp number' }, { status: 400 });
  }

  // 2. Instância do próprio usuário. Sem fallback para EVOLUTION_INSTANCE_NAME:
  //    a mensagem sairia pelo número de outra organização (achado F-12).
  const instanceName = await resolveInstanceForUser(user.id);

  if (!instanceName) {
    return NextResponse.json({
      error: 'WhatsApp instance not configured. Go to Settings → WhatsApp Integration.',
    }, { status: 400 });
  }

  // 3. Send message via WhatsApp
  const phone = String(lead.whatsapp).replace(/\D/g, '');
  let provider: ReturnType<typeof getWhatsAppProvider>;
  try {
    provider = getWhatsAppProvider();
  } catch (err) {
    console.error('[inbox/send-message] Provider indisponível:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'Provider de WhatsApp indisponível' } }, { status: 503 });
  }

  try {
    await provider.sendText(instanceName, phone, body.message);
  } catch (err) {
    console.error('[inbox/send-message] WA send failed:', err);
    return NextResponse.json({ error: 'Failed to send WhatsApp message' }, { status: 500 });
  }

  // 4. Save to conversation history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceSupabase as any)
    .from('whatsapp_conversations')
    .insert({
      lead_id: body.leadId,
      message_agent: body.message,
      from_lead: false,
      ai_generated: false,
      user_id: user.id,
      status: 'respondido',
      timestamp: new Date().toISOString(),
    });

  // 5. Update lead timestamps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceSupabase as any)
    .from('leads_prospeccao')
    .update({
      data_ultima_acao_consultor: new Date().toISOString(),
      data_ultima_interacao: new Date().toISOString(),
    })
    .eq('id', body.leadId);

  return NextResponse.json({ success: true });
}
