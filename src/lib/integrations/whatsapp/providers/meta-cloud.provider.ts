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
} from '../whatsapp-provider.interface';
import {
  withRetry,
  getProviderCircuit,
  countsAsProviderFailure,
  ProviderHttpError,
  type CircuitBreaker,
} from '@/lib/utils/resilience';
import { delay } from '@/lib/utils/delay';
import { recordUsage } from '@/lib/connectors/usage';
import { WHATSAPP_SEND_TIMEOUT_MS } from '../whatsapp-provider.interface';

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

function sendErrorMessage(err: unknown): string {
  if (err instanceof Error && err.name === 'TimeoutError') {
    return `Timeout após ${WHATSAPP_SEND_TIMEOUT_MS} ms`;
  }
  return err instanceof Error ? err.message : String(err);
}

export class MetaCloudProvider implements IWhatsAppProvider {
  readonly name = 'meta-cloud';
  // Campos privados de verdade (#): não aparecem em JSON, inspect nem Object.keys.
  // appSecret/verifyToken ficam guardados para a validação do webhook (Task 6).
  readonly #token: string;
  readonly #phoneNumberId: string;
  readonly #apiVersion: string;
  readonly #appSecret: string;
  readonly #verifyToken: string;
  readonly #usage?: { organizationId: string; connectionId: string };
  /** Circuito desta conexão (T5-ISO-01): falhas de uma org não bloqueiam as outras. */
  readonly #circuit: CircuitBreaker;

  constructor(options: MetaCloudProviderOptions) {
    this.#token = options.accessToken;
    this.#phoneNumberId = options.phoneNumberId;
    this.#apiVersion = options.apiVersion;
    this.#appSecret = options.appSecret;
    this.#verifyToken = options.verifyToken;
    this.#usage = options.usage;
    this.#circuit = getProviderCircuit(
      'meta',
      options.usage?.connectionId ?? `phone:${options.phoneNumberId}`,
      options.usage?.connectionId ?? 'sem-conexao'
    );
  }

  /** Serialização/log nunca expõe credenciais. */
  toJSON(): { name: string } {
    return { name: this.name };
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `MetaCloudProvider { name: '${this.name}' }`;
  }

  private apiUrl(path: string): string {
    return `https://graph.facebook.com/${this.#apiVersion}${path}`;
  }

  /**
   * Registro de consumo fire-and-forget: não atrasa o envio e uma falha
   * nunca transforma um envio bem-sucedido em falha.
   */
  private trackSend(operation: 'send_text' | 'send_media'): void {
    const usage = this.#usage;
    if (!usage) return;
    void Promise.resolve()
      .then(() =>
        recordUsage({
          organizationId: usage.organizationId,
          connectionId: usage.connectionId,
          category: 'whatsapp',
          provider: 'meta_cloud',
          operation,
          quantity: 1,
          unit: 'messages',
        })
      )
      .catch(() => {
        console.error('[whatsapp] falha ao registrar consumo', {
          organization_id: usage.organizationId,
          code: 'usage_record_failed',
        });
      });
  }

  async sendText(
    _instanceOrPhoneId: string, // ignorado — usa o phoneNumberId da conexão
    to: string,
    text: string
  ): Promise<SendTextResult> {
    const token = this.#token;
    const phoneNumberId = this.#phoneNumberId;

    return this.#circuit.call(() =>
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
            signal: AbortSignal.timeout(WHATSAPP_SEND_TIMEOUT_MS),
          }
        );

        if (!response.ok) {
          const err = await response.text();
          throw new ProviderHttpError(`Meta sendText failed: ${response.status} ${err}`, response.status);
        }

        const data = (await response.json()) as {
          messages?: Array<{ id: string }>;
          error?: { message: string };
        };

        if (data.error) throw new ProviderHttpError(data.error.message, 400);

        return { success: true, messageId: data.messages?.[0]?.id };
      }, { maxAttempts: 2, initialDelayMs: 1000, shouldRetry: countsAsProviderFailure }),
      countsAsProviderFailure
    )
      .then(
        (result): SendTextResult => {
          this.trackSend('send_text');
          return result;
        },
        (err: unknown): SendTextResult => ({ success: false, error: sendErrorMessage(err) })
      );
  }

  async sendMedia(
    _instanceOrPhoneId: string,
    to: string,
    media: MediaAttachment
  ): Promise<SendMediaResult> {
    const token = this.#token;
    const phoneNumberId = this.#phoneNumberId;

    if (!media.url) {
      return { success: false, error: 'Meta Cloud API requer URL pública para envio de mídia. Faça upload da imagem em um servidor público primeiro.' };
    }

    return this.#circuit.call(() =>
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
            signal: AbortSignal.timeout(WHATSAPP_SEND_TIMEOUT_MS),
          }
        );

        if (!response.ok) {
          const err = await response.text();
          throw new ProviderHttpError(`Meta sendMedia failed: ${response.status} ${err}`, response.status);
        }

        const data = (await response.json()) as {
          messages?: Array<{ id: string }>;
          error?: { message: string };
        };
        if (data.error) throw new ProviderHttpError(data.error.message, 400);

        return { success: true, messageId: data.messages?.[0]?.id };
      }, { maxAttempts: 2, initialDelayMs: 1000, shouldRetry: countsAsProviderFailure }),
      countsAsProviderFailure
    )
      .then(
        (result): SendMediaResult => {
          this.trackSend('send_media');
          return result;
        },
        (err: unknown): SendMediaResult => ({ success: false, error: sendErrorMessage(err) })
      );
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
    const token = this.#token;

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
}
