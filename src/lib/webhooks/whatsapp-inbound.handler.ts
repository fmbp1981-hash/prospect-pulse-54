/**
 * Processamento do webhook de entrada do WhatsApp (Evolution API e Meta Cloud API).
 *
 * Autenticação (F-02): o tenant vem SÓ do token secreto do path
 * (/api/webhooks/evolution/<webhook_token>), resolvido em user_settings.webhook_token.
 * O campo `instance` do payload nunca escolhe o tenant: na Evolution ele só
 * precisa coincidir com a instância do tenant do token (senão 403).
 *
 *   token malformado / desconhecido          → 401, nada processado (body não é lido)
 *   Content-Length ou corpo > 1 MB            → 413
 *   payload Meta sem META_APP_SECRET          → 503 (fail-closed)
 *   payload Meta com assinatura inválida      → 401
 *   Evolution com instance de outro tenant    → 403, nada processado
 *
 * Fluxo especial: mensagens fromMe=true durante modo humano são salvas
 * como mensagens do consultor, preservando contexto para quando o agente retomar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { normalizeMessage, type NormalizedMessage } from '@/lib/services/message-normalizer.service';
import { runLeadConversationWorkflow } from '@/lib/workflows/lead-conversation.workflow';
import { getWhatsAppProvider } from '@/lib/integrations/whatsapp/whatsapp.factory';
import {
  resolveTenantByWebhookToken,
  type TenantContext,
} from '@/lib/services/tenant-resolver.service';
import { leadRepository } from '@/lib/repositories/lead.repository';
import { leadService } from '@/lib/services/lead.service';
import { conversationRepository } from '@/lib/repositories/conversation.repository';
import { isWellFormedWebhookToken, safeEqual, verifyMetaSignature } from './webhook-token';

/** Limite do corpo do webhook (1 MB). Mídia chega por URL/ID, não inline grande. */
const MAX_BODY_BYTES = 1024 * 1024;

function payloadTooLarge() {
  return NextResponse.json(
    { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Corpo maior que 1 MB' } },
    { status: 413 }
  );
}

function unauthorized() {
  return NextResponse.json(
    { error: { code: 'UNAUTHORIZED', message: 'Webhook não autorizado' } },
    { status: 401 }
  );
}

/**
 * Salva mensagem do consultor quando fromMe=true e lead em modo humano.
 * Roda em fire-and-forget — nunca bloqueia o retorno 200.
 *
 * Se é a primeira mensagem do consultor (ou >60s desde a última),
 * envia a tag "[Consultor X entrou na conversa]" via WhatsApp e salva no histórico.
 */
async function captureConsultantMessage(
  normalized: NormalizedMessage,
  tenant: TenantContext
): Promise<void> {
  try {
    const lead = await leadRepository.findByWhatsApp(normalized.clienteWhatsApp, tenant.userId);
    if (!lead || lead.modo_atendimento !== 'humano') return;

    // Idempotência: envia tag de entrada somente se >60s desde última ação do consultor
    const lastAction = (lead as { data_ultima_acao_consultor?: string | null })
      .data_ultima_acao_consultor;
    const recentlyActive = lastAction
      && (Date.now() - new Date(lastAction).getTime()) < 60_000;

    if (!recentlyActive && lead.whatsapp) {
      try {
        const consultantName = lead.consultor_responsavel || tenant.companyName || 'Consultor';
        const tagMessage = `[Consultor ${consultantName} entrou na conversa]`;
        const phone = String(lead.whatsapp).replace(/\D/g, '');

        const provider = getWhatsAppProvider();
        await provider.sendText(tenant.instanceName, phone, tagMessage);

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

/** POST /api/webhooks/evolution/[token] — recebe eventos (Evolution ou Meta). */
export async function handleWhatsAppInboundPost(
  req: NextRequest,
  token: string
): Promise<NextResponse> {
  // Formato inválido nem chega ao banco.
  if (!isWellFormedWebhookToken(token)) return unauthorized();

  // Tenant ANTES de ler o corpo: requisição sem token válido não consome o body.
  const tenant = await resolveTenantByWebhookToken(token);
  if (!tenant) return unauthorized();

  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return payloadTooLarge();

  const rawBody = await req.text();
  // Content-Length pode faltar (chunked): confere também o tamanho lido.
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return payloadTooLarge();

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Corpo JSON inválido' } },
      { status: 400 }
    );
  }

  // Meta Cloud API: assinatura obrigatória (fail-closed). Vale quando o provider
  // é meta, quando o payload tem formato Meta ou quando veio X-Hub-Signature-256.
  const isMetaProvider = process.env.WHATSAPP_PROVIDER === 'meta';
  const signatureHeader = req.headers.get('x-hub-signature-256');
  const looksLikeMeta =
    !!body && typeof body === 'object'
    && (body as Record<string, unknown>).object === 'whatsapp_business_account';
  if (isMetaProvider || looksLikeMeta || signatureHeader) {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      console.error('[Webhook] META_APP_SECRET ausente: payload Meta recusado (503)');
      return NextResponse.json(
        { error: { code: 'META_SECRET_MISSING', message: 'Webhook Meta indisponível: assinatura não configurada' } },
        { status: 503 }
      );
    }
    if (!verifyMetaSignature(rawBody, signatureHeader, appSecret)) return unauthorized();
  }

  // Ignora payloads nulos ou não-objetos (ex: body = null, body = 42)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  let provider: ReturnType<typeof getWhatsAppProvider>;
  try {
    provider = getWhatsAppProvider();
  } catch (err) {
    // Ex.: WHATSAPP_PROVIDER=meta (desativado até o Sprint 2b). Nada é processado.
    console.error('[Webhook] Provider de WhatsApp indisponível:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'Provider de WhatsApp indisponível' } }, { status: 503 });
  }

  // Usa o provider para normalizar o payload (cada um tem seu formato)
  const normalizedPayload = provider.normalizeWebhookPayload(body);
  if (!normalizedPayload) {
    // Evento de status de mensagem (ack, delivery) — ignorar silenciosamente
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  // Evolution: a instância do payload tem de ser a do tenant do token.
  // Meta: o número é único por app (META_WA_PHONE_NUMBER_ID); o token já define o tenant.
  if (!isMetaProvider && (!tenant.instanceName || normalizedPayload.instanceName !== tenant.instanceName)) {
    console.warn(`[Webhook] instance do payload não pertence ao tenant ${tenant.userId}`);
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Instância não pertence a este webhook' } },
      { status: 403 }
    );
  }

  // Evolution API v2 envolve em { event, instance, data: {...} } — extrai o inner data
  const rawObject = body as Record<string, unknown>;
  const messageData = rawObject.data ?? body;

  // Ignorar grupos — checa no payload RAW antes da normalização
  // (normalizeMessage() remove @g.us do remoteJid ao extrair o telefone)
  const rawKey = (messageData as Record<string, unknown>)?.key as Record<string, unknown> | undefined;
  const remoteJid = (rawKey?.remoteJid as string) || '';
  if (remoteJid.includes('@g.us')) {
    return NextResponse.json({ ignored: true, reason: 'grupo' }, { status: 200 });
  }

  const normalized = normalizeMessage(messageData, normalizedPayload.instanceName);

  if (normalized.messageType === 'unknown') {
    return NextResponse.json({ ignored: true, reason: 'tipo não suportado' }, { status: 200 });
  }

  // fromMe=true: pode ser mensagem do bot (loop) ou do consultor (intervenção humana)
  if (normalized.fromMe) {
    waitUntil(captureConsultantMessage(normalized, tenant));
    return NextResponse.json({ received: true, source: 'fromMe' }, { status: 200 });
  }

  // Retorna 200 imediatamente para a Evolution API não fazer retry (timeout ~10s).
  // waitUntil mantém a função viva até o workflow completar (até maxDuration).
  waitUntil(
    runLeadConversationWorkflow(normalized, tenant).catch((err) => {
      console.error('[Webhook] Workflow error:', (err as Error)?.message ?? err);
    })
  );

  return NextResponse.json({ received: true }, { status: 200 });
}

/** GET — verificação de webhook da Meta Cloud API (hub.challenge) e health check. */
export function handleWhatsAppVerification(req: NextRequest): Response {
  const params = req.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const verifyToken = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe') {
    const expectedToken = process.env.META_WA_VERIFY_TOKEN;
    if (!expectedToken || !verifyToken || !safeEqual(verifyToken, expectedToken)) {
      return NextResponse.json({ error: 'Invalid verify_token' }, { status: 403 });
    }
    return new Response(challenge ?? '', { status: 200 });
  }

  return NextResponse.json({
    status: 'ok',
    provider: process.env.WHATSAPP_PROVIDER || 'evolution',
  });
}
