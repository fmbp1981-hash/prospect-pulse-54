/**
 * Meta Cloud API Provider — WhatsApp Business API Oficial (Meta).
 *
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Recebe as credenciais da conexão da organização (accessToken, phoneNumberId,
 * apiVersion, appSecret, verifyToken); não lê variáveis de ambiente.
 */

import type {
  IWhatsAppProvider,
  SendTextResult,
  SendMediaResult,
  SendSequenceResult,
  MediaDownloadResult,
  MediaAttachment,
  NormalizedWebhookPayload,
} from '../whatsapp-provider.interface';
import { metaCircuit, withRetry } from '@/lib/utils/resilience';
import { delay } from '@/lib/utils/delay';
import { recordUsage } from '@/lib/connectors/usage';

export interface MetaCloudProviderOptions {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  appSecret: string;
  verifyToken: string;
  /** Quando informado, envios bem-sucedidos registram consumo da organização. */
  usage?: { organizationId: string; connectionId: string };
}

function normalizePhoneForMeta(phone: string): string {
  // Meta espera formato: 5581999999999 (sem +)
  return phone.replace(/\D/g, '').replace(/^0+/, '');
}

export class MetaCloudProvider implements IWhatsAppProvider {
  readonly name = 'meta-cloud';
  private readonly token: string;
  private readonly phoneNumberId: string;
  private readonly apiVersion: string;
  readonly appSecret: string;
  readonly verifyToken: string;
  private readonly usage?: { organizationId: string; connectionId: string };

  constructor(options: MetaCloudProviderOptions) {
    this.token = options.accessToken;
    this.phoneNumberId = options.phoneNumberId;
    this.apiVersion = options.apiVersion;
    this.appSecret = options.appSecret;
    this.verifyToken = options.verifyToken;
    this.usage = options.usage;
  }

  private apiUrl(path: string): string {
    return `https://graph.facebook.com/${this.apiVersion}${path}`;
  }

  private async trackSend(operation: 'send_text' | 'send_media'): Promise<void> {
    if (!this.usage) return;
    await recordUsage({
      organizationId: this.usage.organizationId,
      connectionId: this.usage.connectionId,
      category: 'whatsapp',
      provider: 'meta_cloud',
      operation,
      quantity: 1,
      unit: 'messages',
    });
  }

  async sendText(
    _instanceOrPhoneId: string, // ignorado — usa o phoneNumberId da conexão
    to: string,
    text: string
  ): Promise<SendTextResult> {
    const { token, phoneNumberId } = { token: this.token, phoneNumberId: this.phoneNumberId };

    return metaCircuit.call(() =>
      withRetry(async () => {
        const response = await fetch(
          this.apiUrl(`/${phoneNumberId}/messages`),
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
    )
      .then(async (result) => {
        await this.trackSend('send_text');
        return result;
      })
      .catch((err: Error) => ({ success: false, error: err.message }));
  }

  async sendMedia(
    _instanceOrPhoneId: string,
    to: string,
    media: MediaAttachment
  ): Promise<SendMediaResult> {
    const { token, phoneNumberId } = { token: this.token, phoneNumberId: this.phoneNumberId };

    if (!media.url) {
      return { success: false, error: 'Meta Cloud API requer URL pública para envio de mídia. Faça upload da imagem em um servidor público primeiro.' };
    }

    return metaCircuit.call(() =>
      withRetry(async () => {
        const response = await fetch(
          this.apiUrl(`/${phoneNumberId}/messages`),
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
              type: media.type,
              [media.type]: {
                link: media.url,
                ...(media.caption ? { caption: media.caption } : {}),
              },
            }),
          }
        );

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Meta sendMedia failed: ${response.status} ${err}`);
        }

        const data = (await response.json()) as {
          messages?: Array<{ id: string }>;
          error?: { message: string };
        };
        if (data.error) throw new Error(data.error.message);

        return { success: true, messageId: data.messages?.[0]?.id };
      }, { maxAttempts: 2, initialDelayMs: 1000 })
    )
      .then(async (result) => {
        await this.trackSend('send_media');
        return result;
      })
      .catch((err: Error) => ({ success: false, error: err.message }));
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

  // Meta Cloud API não suporta typing indicator nem read receipt nativo via REST
  async sendTyping(_instanceOrPhoneId: string, _to: string, _durationMs: number): Promise<void> {
    // no-op
  }

  async markAsRead(_instanceOrPhoneId: string, _to: string, _messageId: string): Promise<void> {
    // no-op
  }

  async downloadMedia(
    _instanceOrPhoneId: string,
    mediaId: string
  ): Promise<MediaDownloadResult> {
    const token = this.token;

    // 1. Obter URL do media
    const urlResponse = await fetch(this.apiUrl(`/${mediaId}`), {
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

    const buffer = new Uint8Array(await mediaResponse.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buffer.length; i++) bin += String.fromCharCode(buffer[i]);
    const base64 = btoa(bin);

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
