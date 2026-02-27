/**
 * WEBHOOK UNIFICADO — Evolution API e Meta Cloud API
 *
 * Evolution: POST /api/webhooks/evolution
 * Meta:      POST /api/webhooks/evolution  (mesmo endpoint, payload diferente)
 *            GET  /api/webhooks/evolution  (verificação Meta)
 *
 * Fluxo especial: mensagens fromMe=true durante modo humano são salvas
 * como mensagens do consultor, preservando contexto para quando o agente retomar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { normalizeMessage } from '@/lib/services/message-normalizer.service';
import { runXpagWorkflow } from '@/lib/workflows/xpag-lead-handler.workflow';
import { getWhatsAppProvider } from '@/lib/integrations/whatsapp/whatsapp.factory';
import { resolveTenantByInstance } from '@/lib/services/tenant-resolver.service';
import { leadRepository } from '@/lib/repositories/lead.repository';
import { conversationRepository } from '@/lib/repositories/conversation.repository';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Tenta salvar mensagem do consultor quando fromMe=true e lead em modo humano.
 * Roda em fire-and-forget — nunca bloqueia o retorno 200.
 */
async function tryCapturConsultantMessage(normalized: ReturnType<typeof normalizeMessage>): Promise<void> {
  try {
    const tenant = await resolveTenantByInstance(normalized.instanceName);
    if (!tenant) return;

    const lead = await leadRepository.findByWhatsApp(normalized.clienteWhatsApp, tenant.userId);
    if (!lead || lead.modo_atendimento !== 'humano') return;

    // Salva a mensagem do consultor no histórico da conversa
    await conversationRepository.saveLeadMessage({
      lead_id: lead.id,
      message: `[Consultor] ${normalized.mensagem}`,
      from_lead: false,
      ai_generated: false,
      user_id: tenant.userId,
    });

    console.log(`[Webhook] Mensagem do consultor salva — lead ${lead.id}`);
  } catch (err) {
    console.warn('[Webhook] Falha ao capturar mensagem do consultor:', err);
  }
}

// ── POST: Recebe eventos (Evolution ou Meta) ─────────────────────────────────
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const provider = getWhatsAppProvider();

  // Usa o provider para normalizar o payload (cada um tem seu formato)
  const normalizedPayload = provider.normalizeWebhookPayload(body);

  if (!normalizedPayload) {
    // Evento de status de mensagem (ack, delivery) — ignorar silenciosamente
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  // Evolution API v2 envolve em { event, instance, data: {...} } — extrai o inner data
  const rawBody = body as Record<string, unknown>;
  const messageData = rawBody?.data ?? body;
  const normalized = normalizeMessage(messageData, normalizedPayload.instanceName);

  // Ignorar grupos
  if (normalized.clienteWhatsApp.includes('@g.us')) {
    return NextResponse.json({ ignored: true, reason: 'grupo' }, { status: 200 });
  }

  // Ignorar tipo desconhecido
  if (normalized.messageType === 'unknown') {
    return NextResponse.json({ ignored: true, reason: 'tipo não suportado' }, { status: 200 });
  }

  // fromMe=true: pode ser mensagem do bot (loop) ou do consultor (intervenção humana)
  if (normalized.fromMe) {
    // Fire-and-forget: verifica se é consultor em modo humano e salva contexto
    tryCapturConsultantMessage(normalized).catch(() => {});
    return NextResponse.json({ received: true, source: 'fromMe' }, { status: 200 });
  }

  // Mensagem do lead → executa workflow completo de forma assíncrona
  runXpagWorkflow(normalized).catch((err) => {
    console.error('[Webhook] Workflow error:', err?.message ?? err);
  });

  return NextResponse.json({ received: true }, { status: 200 });
}

// ── GET: Verificação de webhook (Meta Cloud API) ─────────────────────────────
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.META_WA_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 });
  }

  return NextResponse.json({
    status: 'ok',
    provider: process.env.WHATSAPP_PROVIDER || 'evolution',
  });
}
