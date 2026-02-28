/**
 * FLUXO 1 - NORMALIZAR DADOS
 * Equivalente nativo ao node "NORMALIZAR DADOS" do workflow n8n.
 * Padroniza payload da Evolution API para um formato consistente.
 */

export type MessageType = 'text' | 'audio' | 'image' | 'document' | 'unknown';

export interface NormalizedMessage {
  // Identificação do remetente
  clienteNome: string;
  clienteTelefone: string;
  clienteWhatsApp: string; // +5581999999999

  // Conteúdo da mensagem
  mensagem: string;
  messageType: MessageType;
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimetype?: string;

  // Metadados
  fromMe: boolean;
  instanceName: string;
  timestamp: string;

  // Debug
  _raw?: unknown;
}

interface EvolutionMessageData {
  key?: {
    remoteJid?: string;
    fromMe?: boolean;
    id?: string;
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    audioMessage?: {
      url?: string;
      base64?: string;
      mimetype?: string;
    };
    imageMessage?: {
      url?: string;
      base64?: string;
      mimetype?: string;
      caption?: string;
    };
    documentMessage?: {
      url?: string;
      base64?: string;
      mimetype?: string;
      title?: string;
    };
  };
  messageType?: string;
  messageTimestamp?: number;
  instanceName?: string;
}

function extractPhoneNumber(remoteJid: string): string {
  // Remove @s.whatsapp.net, @g.us, etc.
  const raw = remoteJid.replace(/@.*/, '').replace(/\D/g, '');

  // Garante prefixo +55
  if (raw.startsWith('55')) {
    return `+${raw}`;
  }
  return `+55${raw}`;
}

function formatPhoneDisplay(whatsapp: string): string {
  // +5581999999999 → (81) 99999-9999
  const digits = whatsapp.replace(/\D/g, '');
  const local = digits.startsWith('55') ? digits.slice(2) : digits;

  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return whatsapp;
}

function detectMessageType(data: EvolutionMessageData): MessageType {
  if (!data.message) return 'unknown';

  if (data.message.conversation || data.message.extendedTextMessage) return 'text';
  if (data.message.audioMessage) return 'audio';
  if (data.message.imageMessage) return 'image';
  if (data.message.documentMessage) return 'document';

  return 'unknown';
}

function extractMessageContent(data: EvolutionMessageData, type: MessageType): string {
  const msg = data.message;
  if (!msg) return '';

  switch (type) {
    case 'text':
      return msg.conversation || msg.extendedTextMessage?.text || '';
    case 'audio':
      return '[ÁUDIO]';
    case 'image':
      return msg.imageMessage?.caption || '[IMAGEM]';
    case 'document':
      return msg.documentMessage?.title || '[DOCUMENTO]';
    default:
      return '[TIPO NÃO SUPORTADO]';
  }
}

function extractMediaInfo(
  data: EvolutionMessageData,
  type: MessageType
): { mediaUrl?: string; mediaBase64?: string; mediaMimetype?: string } {
  const msg = data.message;
  if (!msg) return {};

  switch (type) {
    case 'audio':
      return {
        mediaUrl: msg.audioMessage?.url,
        mediaBase64: msg.audioMessage?.base64,
        mediaMimetype: msg.audioMessage?.mimetype || 'audio/ogg',
      };
    case 'image':
      return {
        mediaUrl: msg.imageMessage?.url,
        mediaBase64: msg.imageMessage?.base64,
        mediaMimetype: msg.imageMessage?.mimetype || 'image/jpeg',
      };
    case 'document':
      return {
        mediaUrl: msg.documentMessage?.url,
        mediaBase64: msg.documentMessage?.base64,
        mediaMimetype: msg.documentMessage?.mimetype || 'application/pdf',
      };
    default:
      return {};
  }
}

export function normalizeMessage(
  payload: unknown,
  instanceName?: string
): NormalizedMessage {
  const data = payload as EvolutionMessageData;

  const remoteJid = data.key?.remoteJid ?? '';
  const whatsApp = extractPhoneNumber(remoteJid);
  const type = detectMessageType(data);

  return {
    clienteNome: data.pushName || 'Desconhecido',
    clienteTelefone: formatPhoneDisplay(whatsApp),
    clienteWhatsApp: whatsApp,
    mensagem: extractMessageContent(data, type),
    messageType: type,
    ...extractMediaInfo(data, type),
    fromMe: data.key?.fromMe ?? false,
    instanceName: instanceName || data.instanceName || '',
    timestamp: data.messageTimestamp
      ? new Date(data.messageTimestamp * 1000).toISOString()
      : new Date().toISOString(),
    _raw: process.env.NODE_ENV !== 'production' ? data : undefined,
  };
}
