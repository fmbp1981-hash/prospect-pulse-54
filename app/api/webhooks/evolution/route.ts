/**
 * WEBHOOK UNIFICADO — Evolution API e Meta Cloud API
 *
 * Evolution: POST /api/webhooks/evolution
 * Meta:      POST /api/webhooks/evolution  (mesmo endpoint, payload diferente)
 *            GET  /api/webhooks/evolution  (verificação Meta)
 *
 * O provider detecta o payload e normaliza automaticamente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { normalizeMessage } from '@/lib/services/message-normalizer.service';
import { checkAntiLoop } from '@/lib/guards/anti-loop.guard';
import { runXpagWorkflow } from '@/lib/workflows/xpag-lead-handler.workflow';
import { getWhatsAppProvider } from '@/lib/integrations/whatsapp/whatsapp.factory';

export const runtime = 'nodejs';
export const maxDuration = 300;

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
    // Pode ser um evento de status de mensagem (ack, delivery) — ignorar silenciosamente
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  // Converte NormalizedWebhookPayload → NormalizedMessage (formato interno)
  const normalized = normalizeMessage(body, normalizedPayload.instanceName);

  // ANTI-LOOP (fromMe)
  const antiLoop = checkAntiLoop(normalized);
  if (!antiLoop.shouldProcess) {
    return NextResponse.json({ ignored: true, reason: antiLoop.reason }, { status: 200 });
  }

  // Executa workflow de forma assíncrona (retorna 200 imediatamente)
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

  // Verificação Meta
  if (mode === 'subscribe' && token === process.env.META_WA_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 });
  }

  // Health check genérico
  return NextResponse.json({
    status: 'ok',
    provider: process.env.WHATSAPP_PROVIDER || 'evolution',
  });
}
