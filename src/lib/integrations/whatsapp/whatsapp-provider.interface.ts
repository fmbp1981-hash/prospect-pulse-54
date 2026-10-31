/**
 * Interface de abstração para provedores WhatsApp.
 * Cada provedor recebe as credenciais da conexão da organização (sem variáveis de ambiente).
 */

/** Tempo máximo de um envio (texto/mídia); estourou → envio falho, nunca exceção. */
export const WHATSAPP_SEND_TIMEOUT_MS = 10_000;

export interface SendTextResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SendMediaResult {
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
  buffer: Uint8Array;
  mimetype: string;
  base64: string;
}

export interface MediaAttachment {
  type: 'image' | 'document' | 'video';
  /** URL pública acessível (necessário para Meta Cloud API) */
  url?: string;
  /** Conteúdo em base64 sem prefixo data: (aceito pela Evolution API) */
  base64?: string;
  mimetype?: string;
  fileName?: string;
  /** Legenda exibida abaixo da imagem/vídeo */
  caption?: string;
}

export interface IWhatsAppProvider {
  readonly name: string;

  /**
   * Envia uma mensagem de texto para um número.
   */
  sendText(instanceOrPhoneId: string, to: string, text: string): Promise<SendTextResult>;

  /**
   * Envia uma mídia (imagem, vídeo, documento) opcionalmente com legenda.
   * - Evolution API: aceita base64 ou URL
   * - Meta Cloud API: requer URL pública
   */
  sendMedia(instanceOrPhoneId: string, to: string, media: MediaAttachment): Promise<SendMediaResult>;

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
   * Envia indicador de digitação ("composing") por durationMs milissegundos.
   * Fire-and-forget — provedores que não suportam podem ser no-op.
   */
  sendTyping(instanceOrPhoneId: string, to: string, durationMs: number): Promise<void>;

  /**
   * Marca uma mensagem recebida como lida ("double blue check").
   * Fire-and-forget — provedores que não suportam podem ser no-op.
   */
  markAsRead(instanceOrPhoneId: string, to: string, messageId: string): Promise<void>;
}
