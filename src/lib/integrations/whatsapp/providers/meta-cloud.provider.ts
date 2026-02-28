/**
 * Meta Cloud API Provider — WhatsApp Business API Oficial (Meta).
 *
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Para ativar: definir no .env:
 *   WHATSAPP_PROVIDER=meta
 *   META_WA_TOKEN=EAA...              (System User Token ou Page Access Token)
 *   META_WA_PHONE_NUMBER_ID=123456789 (ID do número de telefone no Meta)
 *   META_WA_VERSION=v20.0             (versão da Graph API, padrão: v20.0)
 *
 * Para receber webhooks da Meta, configure o endpoint:
 *   POST /api/webhooks/evolution  (reutiliza o mesmo, normalizeWebhookPayload diferencia)
 *   Verificação: GET /api/webhooks/evolution?hub.verify_token=...
 */

import type {
  IWhatsAppProvider,
  SendTextResult,
  SendSequenceResult,
  MediaDownloadResult,
  NormalizedWebhookPayload,
} from '../whatsapp-provider.interface';
import { metaCircuit, withRetry } from '@/lib/utils/resilience';
import { delay } from '@/lib/utils/delay';

function getMetaConfig() {
  return {
    token: process.env.META_WA_TOKEN!,
    phoneNumberId: process.env.META_WA_PHONE_NUMBER_ID!,
    version: process.env.META_WA_VERSION || 'v20.0',
    verifyToken: process.env.META_WA_VERIFY_TOKEN || '',
  };
}

function metaApiUrl(path: string) {
  const { version } = getMetaConfig();
  return `https://graph.facebook.com/${version}${path}`;
}

function normalizePhoneForMeta(phone: string): string {
  // Meta espera formato: 5581999999999 (sem +)
  return phone.replace(/\D/g, '').replace(/^0+/, '');
}

export class MetaCloudProvider implements IWhatsAppProvider {
  readonly name = 'meta-cloud';

  async sendText(
    _instanceOrPhoneId: string, // ignorado — usa META_WA_PHONE_NUMBER_ID
    to: string,
    text: string
  ): Promise<SendTextResult> {
    const { token, phoneNumberId } = getMetaConfig();

    return metaCircuit.call(() =>
      withRetry(async () => {
        const response = await fetch(
          metaApiUrl(`/${phoneNumberId}/messages`),
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: normalizePhoneForMeta(to),
              type: 'text',
              text: { preview_url: false, body: text },
            }),
          }
        );

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Meta sendText failed: ${response.status} ${err}`);
        }

        const data = (await response.json()) as {
          messages?: Array<{ id: string }>;
          error?: { message: string };
        };

        if (data.error) throw new Error(data.error.message);

        return { success: true, messageId: data.messages?.[0]?.id };
      }, { maxAttempts: 2, initialDelayMs: 1000 })
    ).catch((err: Error) => ({ success: false, error: err.message }));
  }

  async sendMessageSequence(
    instanceOrPhoneId: string,
    to: string,
    messages: string[],
    delayMs = 3000
  ): Promise<SendSequenceResult> {
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < messages.length; i++) {
      const text = messages[i].trim();
      if (!text) continue;

      const result = await this.sendText(instanceOrPhoneId, to, text);
      if (result.success) {
        sent++;
      } else {
        failed++;
        errors.push(result.error ?? 'unknown');
      }

      if (i < messages.length - 1 && delayMs > 0) {
        await delay(delayMs);
      }
    }

    return { sent, failed, errors };
  }

  async downloadMedia(
    _instanceOrPhoneId: string,
    mediaId: string
  ): Promise<MediaDownloadResult> {
    const { token } = getMetaConfig();

    // 1. Obter URL do media
    const urlResponse = await fetch(metaApiUrl(`/${mediaId}`), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!urlResponse.ok) {
      throw new Error(`Meta getMediaUrl failed: ${urlResponse.status}`);
    }

    const urlData = (await urlResponse.json()) as {
      url: string;
      mime_type: string;
    };

    // 2. Baixar media
    const mediaResponse = await fetch(urlData.url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!mediaResponse.ok) {
      throw new Error(`Meta downloadMedia failed: ${mediaResponse.status}`);
    }

    const buffer = Buffer.from(await mediaResponse.arrayBuffer());
    const base64 = buffer.toString('base64');

    return { buffer, mimetype: urlData.mime_type, base64 };
  }

  /**
   * Normaliza payload do webhook da Meta Cloud API.
   *
   * Formato Meta:
   * {
   *   object: "whatsapp_business_account",
   *   entry: [{ changes: [{ value: { messages: [...], metadata: {...} } }] }]
   * }
   */
  normalizeWebhookPayload(payload: unknown): NormalizedWebhookPayload | null {
    const data = payload as {
      object?: string;
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              id: string;
              from: string;
              timestamp: string;
              type: string;
              text?: { body: string };
              audio?: { id: string; mime_type: string };
              image?: { id: string; mime_type: string; caption?: string };
              document?: { id: string; mime_type: string; filename?: string };
            }>;
            contacts?: Array<{ profile?: { name?: string } }>;
            metadata?: { display_phone_number: string; phone_number_id: string };
          };
        }>;
      }>;
    };

    if (data.object !== 'whatsapp_business_account') return null;

    const change = data.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message) return null;

    const pushName = change?.contacts?.[0]?.profile?.name || 'Desconhecido';
    const instanceName = change?.metadata?.phone_number_id || '';

    let messageType: NormalizedWebhookPayload['messageType'] = 'unknown';
    let content = '';
    let mediaId: string | undefined;
    let mediaMimetype: string | undefined;

    switch (message.type) {
      case 'text':
        messageType = 'text';
        content = message.text?.body || '';
        break;
      case 'audio':
        messageType = 'audio';
        content = '[ÁUDIO]';
        mediaId = message.audio?.id;
        mediaMimetype = message.audio?.mime_type;
        break;
      case 'image':
        messageType = 'image';
        content = message.image?.caption || '[IMAGEM]';
        mediaId = message.image?.id;
        mediaMimetype = message.image?.mime_type;
        break;
      case 'document':
        messageType = 'document';
        content = message.document?.filename || '[DOCUMENTO]';
        mediaId = message.document?.id;
        mediaMimetype = message.document?.mime_type;
        break;
    }

    const phone = message.from;
    const normalizedPhone = phone.startsWith('55') ? `+${phone}` : `+55${phone}`;

    return {
      remoteJid: normalizedPhone,
      pushName,
      fromMe: false, // Meta não entrega mensagens enviadas pelo bot via webhook de recebimento
      messageType,
      content,
      mediaId,
      mediaMimetype,
      instanceName,
      messageId: message.id,
      timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
    };
  }
}
