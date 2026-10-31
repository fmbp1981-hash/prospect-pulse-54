/**
 * POST /api/inbox/takeover
 * Consultant assumes a conversation — sets modo_atendimento='humano',
 * sends WA notification, records system message.
 *
 * Sprint 2b: o lead tem de ser da organização do usuário (senão 404). A
 * notificação sai pela conexão de WhatsApp ativa da organização; sem conexão,
 * assume a conversa sem notificar o lead (log whatsapp_not_configured).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getWhatsAppForOrganization } from '@/lib/integrations/whatsapp/org-whatsapp';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';
import { resolveLeadOrganizationId, resolveOrganizationIdForUser } from '@/lib/connectors/org-context';
import { requireWriter, forbiddenWriterResponse } from '@/lib/auth/require-writer';

const bodySchema = z.object({ leadId: z.string().trim().min(1) });

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

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'leadId required' } },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Fetch lead
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (serviceSupabase as any)
    .from('leads_prospeccao')
    .select('id, whatsapp, modo_atendimento, data_ultima_acao_consultor, user_id, organization_id')
    .eq('id', body.leadId)
    .eq('user_id', user.id)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  // Organização do usuário; o lead tem de ser dela.
  const organizationId = await resolveOrganizationIdForUser(user.id);
  if ((await resolveLeadOrganizationId(lead)) !== organizationId) {
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
  if (!recentlyTakenOver && lead.whatsapp && organizationId) {
    try {
      const whatsapp = await getWhatsAppForOrganization(organizationId);
      const tagMessage = `[Consultor ${consultantName} entrou na conversa]`;
      const phone = String(lead.whatsapp).replace(/\D/g, '');

      const result = await whatsapp.provider.sendText(whatsapp.target, phone, tagMessage);
      if (!result.success) {
        console.error('[inbox/takeover] notificação não enviada', {
          organization_id: organizationId,
          code: 'whatsapp_send_failed',
        });
      } else {
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
      // Não falha o takeover se a notificação não sair.
      const code = err instanceof ConnectionNotConfiguredError ? 'whatsapp_not_configured' : 'whatsapp_notification_error';
      console.warn('[inbox/takeover] notificação WhatsApp não enviada', { organization_id: organizationId, code });
    }
  } else if (!organizationId) {
    console.warn('[inbox/takeover] notificação WhatsApp não enviada', {
      organization_id: null,
      code: 'whatsapp_not_configured',
    });
  }

  return NextResponse.json({ success: true });
}
