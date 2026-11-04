/**
 * Evento de mensagem de entrada do WhatsApp, independente do provedor.
 *
 * Os normalizadores (meta/evolution) produzem `NormalizedInboundEvent`, sem
 * organização nem conexão: quem preenche `organizationId`/`connectionId` é o
 * handler do webhook, SEMPRE a partir da conexão autenticada, nunca do payload.
 */

export type InboundMessageType = 'text' | 'audio' | 'image' | 'document' | 'video' | 'unsupported';

export type InboundProvider = 'meta_cloud' | 'evolution';

export interface InboundMessageEvent {
  organizationId: string;
  connectionId: string;
  provider: InboundProvider;
  /** Remetente: só dígitos (ex.: 5511999990000). */
  from: string;
  messageId: string;
  /** Unix epoch em segundos (como os dois provedores enviam). */
  timestamp: number;
  type: InboundMessageType;
  /** Texto (text), legenda (image/video) ou nome do arquivo (document). */
  text?: string;
  /** Meta: id da mídia na Graph API. Evolution: id da mensagem (download por mensagem). */
  mediaId?: string;
  mimetype?: string;
  pushName?: string;
  /** Evolution: mensagem enviada pelo próprio número (consultor/bot). Meta: sempre false. */
  fromMe?: boolean;
  /** Evolution: mídia inline em base64, quando a instância está configurada para enviá-la. */
  mediaBase64?: string;
  /**
   * Destino declarado no payload: phone_number_id (Meta) ou instância (Evolution).
   * Só serve para conferir contra a conexão; nunca escolhe organização.
   */
  recipientId?: string;
}

export type NormalizedInboundEvent = Omit<InboundMessageEvent, 'organizationId' | 'connectionId'>;

/** Só os dígitos do remetente (remove @s.whatsapp.net, '+', espaços). */
export function senderDigits(raw: string): string {
  return raw.replace(/@.*/, '').replace(/\D/g, '');
}
