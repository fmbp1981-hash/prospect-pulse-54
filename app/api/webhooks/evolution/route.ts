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
import { waitUntil } from '@vercel/functions';
import { normalizeMessage } from '@/services/message-normalizer.service';
import { runXpagWorkflow } from '@/lib/workflows/xpag-lead-handler.workflow';
import { getWhatsAppProvider } from '@/lib/integrations/whatsapp/whatsapp.factory';
import { resolveTenantByInstance } from '@/services/tenant-resolver.service';
import { leadRepository } from '@/repositories/lead.repository';
import { leadService } from '@/services/lead.service';
import { conversationRepository } from '@/repositories/conversation.repository';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Tenta salvar mensagem do consultor quando fromMe=true e lead em modo humano.
 * Roda em fire-and-forget — nunca bloqueia o retorno 200.
 *
 * Se é a primeira mensagem do consultor (ou >60s desde a última),
 * envia a tag "[Consultor X entrou na conversa]" via WhatsApp e salva no histórico.
 */
async function tryCapturConsultantMessage(normalized: ReturnType<typeof normalizeMessage>): Promise<void> {
  try {
    const tenant = await resolveTenantByInstance(normalized.instanceName);
    if (!tenant) return;

    const lead = await leadRepository.findByWhatsApp(normalized.clienteWhatsApp, tenant.userId);
    if (!lead || lead.modo_atendimento !== 'humano') return;

    // Idempotência: envia tag de entrada somente se >60s desde última ação do consultor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastAction = (lead as any).data_ultima_acao_consultor as string | null;
    const recentlyActive = lastAction
      && (Date.now() - new Date(lastAction).getTime()) < 60_000;

    if (!recentlyActive && lead.whatsapp) {
      try {
        const consultantName = lead.consultor_responsavel || tenant.companyName || 'Consultor';
        const tagMessage = `[Consultor ${consultantName} entrou na conversa]`;
        const phone = String(lead.whatsapp).replace(/\D/g, '');

        const provider = getWhatsAppProvider();
        await provider.sendText(tenant.instanceName, phone, tagMessage);

        // Salva mensagem de sistema no histórico
        await conversationRepository.saveLeadMessage({
          lead_id: lead.id,
          message: tagMessage,
          from_lead: false,
          ai_generated: false,
          user_id: tenant.userId,
        });

        console.log(`[Webhook] Tag de entrada do consultor enviada — lead ${lead.id}`);
      } catch (tagErr) {
        console.warn('[Webhook] Falha ao enviar tag de entrada do consultor:', tagErr);
        // Não impede o salvamento da mensagem abaixo
      }
    }

    // Salva a mensagem do consultor no histórico da conversa
    await conversationRepository.saveLeadMessage({
      lead_id: lead.id,
      message: `[Consultor] ${normalized.mensagem}`,
      from_lead: false,
      ai_generated: false,
      user_id: tenant.userId,
    });

    // Registra timestamp da última ação do consultor (usado para auto-retomada por timeout)
    await leadService.recordConsultantActivity(lead.id);

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

  // Ignora payloads nulos ou não-objetos (ex: body = null, body = 42)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  const provider = getWhatsAppProvider();

  // DEBUG TEMP: loga estrutura do payload para diagnosticar formato da Evolution API
  const rawDebug = body as Record<string, unknown>;
  console.log('[Webhook][DEBUG] event:', rawDebug.event, '| instance:', rawDebug.instance, '| data keys:', Object.keys((rawDebug.data as Record<string,unknown>) || {}));

  // Usa o provider para normalizar o payload (cada um tem seu formato)
  const normalizedPayload = provider.normalizeWebhookPayload(body);

  if (!normalizedPayload) {
    // Evento de status de mensagem (ack, delivery) — ignorar silenciosamente
    console.log('[Webhook][DEBUG] normalizedPayload=null para event:', rawDebug.event, '| raw.data:', JSON.stringify(rawDebug.data).substring(0, 300));
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  // Evolution API v2 envolve em { event, instance, data: {...} } — extrai o inner data
  const rawBody = body as Record<string, unknown>;
  const messageData = rawBody?.data ?? body;

  // Ignorar grupos — checa no payload RAW antes da normalização
  // (normalizeMessage() remove @g.us do remoteJid ao extrair o telefone)
  const rawKey = (messageData as Record<string, unknown>)?.key as Record<string, unknown> | undefined;
  const remoteJid = (rawKey?.remoteJid as string) || '';
  if (remoteJid.includes('@g.us')) {
    return NextResponse.json({ ignored: true, reason: 'grupo' }, { status: 200 });
  }

  const normalized = normalizeMessage(messageData, normalizedPayload.instanceName);

  // Ignorar tipo desconhecido
  if (normalized.messageType === 'unknown') {
    return NextResponse.json({ ignored: true, reason: 'tipo não suportado' }, { status: 200 });
  }

  // fromMe=true: pode ser mensagem do bot (loop) ou do consultor (intervenção humana)
  if (normalized.fromMe) {
    // Fire-and-forget: verifica se é consultor em modo humano e salva contexto
    waitUntil(tryCapturConsultantMessage(normalized));
    return NextResponse.json({ received: true, source: 'fromMe' }, { status: 200 });
  }

  // Retorna 200 imediatamente para a Evolution API não fazer retry (timeout ~10s).
  // waitUntil mantém a função viva até o workflow completar (até maxDuration).
  // Isso elimina: double-sends, atrasos de horas e falhas por timeout da Evolution.
  waitUntil(
    runXpagWorkflow(normalized).catch((err) => {
      console.error('[Webhook] Workflow error:', (err as Error)?.message ?? err);
    })
  );

  return NextResponse.json({ received: true }, { status: 200 });
}

// ── GET: Verificação de webhook (Meta Cloud API) ─────────────────────────────
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  // Requisição de verificação Meta Cloud API
  if (mode === 'subscribe') {
    const expectedToken = process.env.META_WA_VERIFY_TOKEN;
    if (!expectedToken || token !== expectedToken) {
      return NextResponse.json({ error: 'Invalid verify_token' }, { status: 403 });
    }
    return new Response(challenge ?? '', { status: 200 });
  }

  // Health check simples (sem parâmetros de verificação)
  return NextResponse.json({
    status: 'ok',
    provider: process.env.WHATSAPP_PROVIDER || 'evolution',
  });
}
