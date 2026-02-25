/**
 * FLUXO 3 - MESSAGE TYPE HANDLER (Strategy Pattern)
 * Equivalente nativo ao node "MessageType" (Switch) do n8n.
 * Roteia o processamento de acordo com o tipo de mídia.
 */

import type { NormalizedMessage } from '../services/message-normalizer.service';
import { evolutionMediaClient } from '../integrations/evolution/media.client';
import { transcribeAudio } from '../integrations/openai/whisper.service';
import { analyzeImage } from '../integrations/openai/vision.service';
import { analyzePdf } from '../services/pdf-analyzer.service';

export interface ProcessedMessage {
  content: string;
  messageType: string;
}

export async function processMessageByType(
  message: NormalizedMessage,
  instanceName: string,
  messageId?: string
): Promise<ProcessedMessage> {
  switch (message.messageType) {
    case 'text':
      return { content: message.mensagem, messageType: 'text' };

    case 'audio': {
      let buffer: Buffer;

      if (message.mediaBase64) {
        buffer = Buffer.from(message.mediaBase64, 'base64');
      } else if (messageId) {
        const dl = await evolutionMediaClient.downloadAudio(instanceName, messageId);
        buffer = dl.buffer;
      } else {
        return { content: '[Áudio recebido — não foi possível processar]', messageType: 'audio' };
      }

      const transcription = await transcribeAudio(buffer, message.mediaMimetype);
      return { content: transcription, messageType: 'audio' };
    }

    case 'image': {
      let buffer: Buffer;

      if (message.mediaBase64) {
        buffer = Buffer.from(message.mediaBase64, 'base64');
      } else if (messageId) {
        const dl = await evolutionMediaClient.downloadImage(instanceName, messageId);
        buffer = dl.buffer;
      } else {
        return { content: '[Imagem recebida — não foi possível analisar]', messageType: 'image' };
      }

      const description = await analyzeImage(buffer, message.mediaMimetype);
      // Remove caracteres especiais do output (equivalente ao node "Ajusta")
      const cleaned = description.replace(/[*#`]/g, '').trim();
      return { content: `[IMAGEM]: ${cleaned}`, messageType: 'image' };
    }

    case 'document': {
      let buffer: Buffer;

      if (message.mediaBase64) {
        buffer = Buffer.from(message.mediaBase64, 'base64');
      } else if (messageId) {
        const dl = await evolutionMediaClient.downloadDocument(instanceName, messageId);
        buffer = dl.buffer;
      } else {
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
