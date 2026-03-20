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

  const body = await req.json() as { leadId?: string; message?: string };
  if (!body.leadId || !body.message?.trim()) {
    return NextResponse.json({ error: 'leadId and message required' }, { status: 400 });
  }

  const serviceSupabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (serviceSupabase as any)
    .from('leads_prospeccao')
    .select('id, whatsapp')
    .eq('id', body.leadId)
    .eq('user_id', user.id)
    .single();

  if (leadErr || !lead?.whatsapp) {
    return NextResponse.json({ error: 'Lead not found or no WhatsApp' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await (serviceSupabase as any)
    .from('user_settings')
    .select('evolution_instance_name')
    .eq('user_id', user.id)
    .single();

  const instanceName =
    settings?.evolution_instance_name || process.env.EVOLUTION_DEFAULT_INSTANCE!;

  const provider = getWhatsAppProvider();
  const sendResult = await provider.sendText(instanceName, lead.whatsapp, body.message);

  if (!sendResult.success) {
    return NextResponse.json({ error: `WhatsApp send failed: ${sendResult.error}` }, { status: 500 });
  }

  const now = new Date().toISOString();

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
      timestamp: now,
    });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceSupabase as any)
    .from('leads_prospeccao')
    .update({
      data_ultima_acao_consultor: now,
      data_ultima_interacao: now,
      updated_at: now,
    })
    .eq('id', body.leadId);

  return NextResponse.json({ success: true });
}
