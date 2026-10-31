/**
 * POST /api/inbox/send-message
 * Consultant sends a text message to a lead via WhatsApp,
 * saves to conversation history, and updates timestamps.
 *
 * Sprint 2b: a organização vem de resolveOrganizationIdForUser(user.id) e o
 * lead tem de ser dela (senão 404). O envio sai pela conexão de WhatsApp ativa
 * da organização; sem conexão → 409 WHATSAPP_NOT_CONFIGURED (sem fallback).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';
import {
  getWhatsAppForOrganization,
  WHATSAPP_NOT_CONFIGURED_ERROR,
  type OrgWhatsApp,
} from '@/lib/integrations/whatsapp/org-whatsapp';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';
import { resolveLeadOrganizationId, resolveOrganizationIdForUser } from '@/lib/connectors/org-context';
import { requireWriter, forbiddenWriterResponse } from '@/lib/auth/require-writer';

const bodySchema = z.object({
  leadId: z.string().trim().min(1),
  message: z.string().max(4096).refine((m) => m.trim().length > 0),
});

function notConfigured() {
  return NextResponse.json({ error: WHATSAPP_NOT_CONFIGURED_ERROR }, { status: 409 });
}

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
      { error: { code: 'INVALID_INPUT', message: 'leadId and message required' } },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Fetch lead (verify ownership)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (serviceSupabase as any)
    .from('leads_prospeccao')
    .select('id, whatsapp, user_id, organization_id')
    .eq('id', body.leadId)
    .eq('user_id', user.id)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  // 2. Organização do usuário; o lead tem de ser dela.
  const organizationId = await resolveOrganizationIdForUser(user.id);
  const leadOrganizationId = await resolveLeadOrganizationId(lead);
  if (leadOrganizationId !== organizationId) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }
  if (!organizationId) return notConfigured();

  if (!lead.whatsapp) {
    return NextResponse.json({ error: 'Lead has no WhatsApp number' }, { status: 400 });
  }

  // 3. Envia pela conexão de WhatsApp da organização
  let whatsapp: OrgWhatsApp;
  try {
    whatsapp = await getWhatsAppForOrganization(organizationId);
  } catch (err) {
    if (err instanceof ConnectionNotConfiguredError) {
      console.warn('[inbox/send-message] WhatsApp não configurado', {
        organization_id: organizationId,
        code: 'whatsapp_not_configured',
      });
      return notConfigured();
    }
    console.error('[inbox/send-message] falha ao resolver conexão', {
      organization_id: organizationId,
      code: 'whatsapp_connection_error',
    });
    return NextResponse.json(
      { error: { code: 'PROVIDER_UNAVAILABLE', message: 'Provider de WhatsApp indisponível' } },
      { status: 503 }
    );
  }

  const phone = String(lead.whatsapp).replace(/\D/g, '');
  const result = await whatsapp.provider.sendText(whatsapp.target, phone, body.message);
  if (!result.success) {
    console.error('[inbox/send-message] envio falhou', {
      organization_id: organizationId,
      code: 'whatsapp_send_failed',
    });
    return NextResponse.json(
      { error: { code: 'WHATSAPP_SEND_FAILED', message: 'Falha ao enviar a mensagem de WhatsApp' } },
      { status: 502 }
    );
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
