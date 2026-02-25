/**
 * Interface de abstração para provedores WhatsApp.
 * Permite trocar de Evolution API → Meta Cloud API apenas com variáveis de ambiente.
 */

export interface SendTextResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SendSequenceResult {
  sent: number;
  failed: number;
  errors: string[];
}

export interface MediaDownloadResult {
  buffer: Buffer;
  mimetype: string;
  base64: string;
}

export interface IWhatsAppProvider {
  readonly name: string;

  /**
   * Envia uma mensagem de texto para um número.
   */
  sendText(instanceOrPhoneId: string, to: string, text: string): Promise<SendTextResult>;

  /**
   * Envia múltiplas mensagens em sequência com delay entre elas.
   */
  sendMessageSequence(
    instanceOrPhoneId: string,
    to: string,
    messages: string[],
    delayMs?: number
  ): Promise<SendSequenceResult>;

  /**
   * Baixa mídia (áudio, imagem, documento) de uma mensagem recebida.
   */
  downloadMedia(instanceOrPhoneId: string, mediaId: string): Promise<MediaDownloadResult>;

  /**
   * Normaliza o payload recebido no webhook para o formato padrão.
   * Cada provedor tem seu próprio formato de webhook.
   */
  normalizeWebhookPayload(payload: unknown): NormalizedWebhookPayload | null;
}

export interface NormalizedWebhookPayload {
  remoteJid: string;     // número sem formatação
  pushName: string;
  fromMe: boolean;
  messageType: 'text' | 'audio' | 'image' | 'document' | 'unknown';
  content: string;
  mediaId?: string;
  mediaMimetype?: string;
  mediaBase64?: string;
  instanceName: string;
  messageId: string;
  timestamp: string;
}
