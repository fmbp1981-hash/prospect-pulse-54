/**
 * FLUXO 3 - MESSAGE TYPE HANDLER (Strategy Pattern)
 * Equivalente nativo ao node "MessageType" (Switch) do n8n.
 * Roteia o processamento de acordo com o tipo de mídia.
 */

import type { NormalizedMessage } from '../services/message-normalizer.service';
import type { OrgWhatsApp } from '../integrations/whatsapp/org-whatsapp';
import { transcribeAudio } from '../integrations/openai/whisper.service';
import { analyzeImage } from '../integrations/openai/vision.service';
import { analyzePdf } from '../services/pdf-analyzer.service';

export interface ProcessedMessage {
  content: string;
  messageType: string;
}

/** Conexão de WhatsApp da organização usada para baixar a mídia (null = sem conexão). */
export type MediaSource = Pick<OrgWhatsApp, 'provider' | 'target'> | null;

async function downloadMediaBuffer(media: MediaSource, messageId: string): Promise<Buffer | null> {
  if (!media) return null;
  const dl = await media.provider.downloadMedia(media.target, messageId);
  return Buffer.from(dl.base64, 'base64');
}

export async function processMessageByType(
  message: NormalizedMessage,
  media: MediaSource,
  messageId?: string
): Promise<ProcessedMessage> {
  switch (message.messageType) {
    case 'text':
      return { content: message.mensagem, messageType: 'text' };

    case 'audio': {
      const buffer = message.mediaBase64
        ? Buffer.from(message.mediaBase64, 'base64')
        : messageId
          ? await downloadMediaBuffer(media, messageId)
          : null;

      if (!buffer) {
        return { content: '[Áudio recebido — não foi possível processar]', messageType: 'audio' };
      }

      const transcription = await transcribeAudio(buffer, message.mediaMimetype);
      return { content: transcription, messageType: 'audio' };
    }

    case 'image': {
      const buffer = message.mediaBase64
        ? Buffer.from(message.mediaBase64, 'base64')
        : messageId
          ? await downloadMediaBuffer(media, messageId)
          : null;

      if (!buffer) {
        return { content: '[Imagem recebida — não foi possível analisar]', messageType: 'image' };
      }

      const description = await analyzeImage(buffer, message.mediaMimetype);
      // Remove caracteres especiais do output (equivalente ao node "Ajusta")
      const cleaned = description.replace(/[*#`]/g, '').trim();
      return { content: `[IMAGEM]: ${cleaned}`, messageType: 'image' };
    }

    case 'document': {
      const buffer = message.mediaBase64
        ? Buffer.from(message.mediaBase64, 'base64')
        : messageId
          ? await downloadMediaBuffer(media, messageId)
          : null;

      if (!buffer) {
        return { content: '[Documento recebido — não foi possível extrair]', messageType: 'document' };
      }

      const summary = await analyzePdf(buffer);
      const cleaned = summary.replace(/[*#`]/g, '').trim();
      return { content: `[DOCUMENTO]: ${cleaned}`, messageType: 'document' };
    }

    default:
      return {
        content: '[Tipo de mensagem não suportado — aguardando texto]',
        messageType: 'unknown',
      };
  }
}
