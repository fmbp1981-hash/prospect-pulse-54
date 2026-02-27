/**
 * Evolution API Provider — Implementação atual de produção.
 * Compatível com Evolution API v1 e v2.
 */

import type {
  IWhatsAppProvider,
  SendTextResult,
  SendSequenceResult,
  MediaDownloadResult,
  NormalizedWebhookPayload,
} from '../whatsapp-provider.interface';
import { evolutionCircuit, withRetry } from '@/lib/utils/resilience';
import { delay } from '@/lib/utils/delay';

function getEvolutionConfig() {
  return {
    url: process.env.EVOLUTION_API_URL!,
    key: process.env.EVOLUTION_API_KEY!,
  };
}

function normalizeNumber(to: string): string {
  return to.replace(/\D/g, '');
}

export class EvolutionProvider implements IWhatsAppProvider {
  readonly name = 'evolution';

  async sendText(instance: string, to: string, text: string): Promise<SendTextResult> {
    const { url, key } = getEvolutionConfig();

    return evolutionCircuit.call(() =>
      withRetry(async () => {
        const response = await fetch(`${url}/message/sendText/${instance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: key },
          body: JSON.stringify({ number: normalizeNumber(to), text }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Evolution sendText failed: ${response.status} ${err}`);
        }

        const data = (await response.json()) as { key?: { id?: string } };
        return { success: true, messageId: data.key?.id };
      }, { maxAttempts: 2, initialDelayMs: 1000 })
    ).catch((err: Error) => ({ success: false, error: err.message }));
  }

  async sendMessageSequence(
    instance: string,
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

      const result = await this.sendText(instance, to, text);
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

  async downloadMedia(instance: string, messageId: string): Promise<MediaDownloadResult> {
    const { url, key } = getEvolutionConfig();

    return evolutionCircuit.call(() =>
      withRetry(async () => {
        const response = await fetch(
          `${url}/chat/getBase64FromMediaMessage/${instance}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: key },
            body: JSON.stringify({ message: { key: { id: messageId } } }),
          }
        );

        if (!response.ok) {
          throw new Error(`Evolution downloadMedia failed: ${response.status}`);
        }

        const data = (await response.json()) as { base64: string; mimetype: string };
        return {
          buffer: Buffer.from(data.base64, 'base64'),
          mimetype: data.mimetype,
          base64: data.base64,
        };
      }, { maxAttempts: 2 })
    );
  }

  normalizeWebhookPayload(payload: unknown): NormalizedWebhookPayload | null {
    // Evolution API v2 envolve o payload em { event, instance, data: {...} }
    // Evolution API v1 envia o objeto de mensagem diretamente na raiz
    const raw = payload as Record<string, unknown>;
    const inner = (raw?.data ?? raw) as Record<string, unknown>;

    const data = inner as {
      key?: { remoteJid?: string; fromMe?: boolean; id?: string };
      pushName?: string;
      message?: {
        conversation?: string;
        extendedTextMessage?: { text?: string };
        audioMessage?: { url?: string; base64?: string; mimetype?: string };
        imageMessage?: { url?: string; base64?: string; mimetype?: string; caption?: string };
        documentMessage?: { url?: string; base64?: string; mimetype?: string; title?: string };
      };
      messageTimestamp?: number;
      instanceName?: string;
    };

    // instanceName pode estar no wrapper (v2) ou no objeto de mensagem (v1)
    const instanceName = (raw?.instance as string) || data.instanceName || '';

    if (!data.key?.remoteJid) return null;

    const remoteJid = data.key.remoteJid.replace(/@.*/, '').replace(/\D/g, '');
    const msg = data.message;

    let messageType: NormalizedWebhookPayload['messageType'] = 'unknown';
    let content = '';
    let mediaId: string | undefined;
    let mediaMimetype: string | undefined;
    let mediaBase64: string | undefined;

    if (msg?.conversation || msg?.extendedTextMessage) {
      messageType = 'text';
      content = msg.conversation || msg.extendedTextMessage?.text || '';
    } else if (msg?.audioMessage) {
      messageType = 'audio';
      content = '[ÁUDIO]';
      mediaMimetype = msg.audioMessage.mimetype || 'audio/ogg';
      mediaBase64 = msg.audioMessage.base64;
    } else if (msg?.imageMessage) {
      messageType = 'image';
      content = msg.imageMessage.caption || '[IMAGEM]';
      mediaMimetype = msg.imageMessage.mimetype || 'image/jpeg';
      mediaBase64 = msg.imageMessage.base64;
    } else if (msg?.documentMessage) {
      messageType = 'document';
      content = msg.documentMessage.title || '[DOCUMENTO]';
      mediaMimetype = msg.documentMessage.mimetype || 'application/pdf';
      mediaBase64 = msg.documentMessage.base64;
    }

    return {
      remoteJid: remoteJid.startsWith('55') ? `+${remoteJid}` : `+55${remoteJid}`,
      pushName: data.pushName || 'Desconhecido',
      fromMe: data.key.fromMe ?? false,
      messageType,
      content,
      mediaId: data.key.id,
      mediaMimetype,
      mediaBase64,
      instanceName,
      messageId: data.key.id || '',
      timestamp: data.messageTimestamp
        ? new Date(data.messageTimestamp * 1000).toISOString()
        : new Date().toISOString(),
    };
  }
}
