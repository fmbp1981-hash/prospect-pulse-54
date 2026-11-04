/**
 * WEBHOOK DO WHATSAPP AUTENTICADO POR TENANT (Evolution API e Meta Cloud API)
 *
 * POST /api/webhooks/evolution/<webhook_token>  → eventos de mensagem
 * GET  /api/webhooks/evolution/<webhook_token>  → verificação Meta (hub.challenge)
 *
 * LEGADO até o corte (Task 12 remove): o <webhook_token> (user_settings.webhook_token)
 * só identifica o usuário; a organização dele define a conexão de WhatsApp
 * (qualquer status exceto disabled, como na rota nova), que autentica o corpo
 * (assinatura Meta / apikey + instância Evolution). Sem conexão utilizável →
 * 200 sem processar. Nova URL: /api/webhooks/whatsapp/<webhook_key>.
 * A lógica fica em src/lib/webhooks/connection-inbound.handler.ts.
 */

import type { NextRequest } from 'next/server';
import {
  handleLegacyTokenWebhookPost,
  handleLegacyTokenWebhookVerification,
} from '@/lib/webhooks/connection-inbound.handler';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  return handleLegacyTokenWebhookPost(req, params.token);
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  return handleLegacyTokenWebhookVerification(req, params.token);
}
