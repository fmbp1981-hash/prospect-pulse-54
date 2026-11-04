import type { InboundMessageEvent } from '@/lib/webhooks/normalizers/inbound-event';

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
  messageId?: string;      // id da mensagem no provedor (marcar como lida; download na Evolution)
  mediaId?: string;        // id da mídia para download (Meta: id na Graph API; Evolution: = messageId)
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimetype?: string;

  // Metadados
  fromMe: boolean;
  instanceName: string;
  timestamp: string;

  // Detecção de bot/automação
  isBusinessAccount: boolean;  // JID com dígitos além do padrão BR (business API/CNPJ-based)
  isAutomatedMessage: boolean; // Texto detectado como resposta automática de bot

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

function extractPhoneNumber(remoteJid: string): { phone: string; isBusinessAccount: boolean } {
  // Remove @s.whatsapp.net, @g.us, etc.
  const raw = remoteJid.replace(/@.*/, '').replace(/\D/g, '');

  const localDigits = raw.startsWith('55') ? raw.slice(2) : raw;

  // Números BR válidos: 10 dígitos (fixo DDD+8) ou 11 dígitos (celular DDD+9+8)
  // JIDs de contas Business API / CNPJ-based têm > 11 dígitos locais
  const isBusinessAccount = localDigits.length > 11;

  const phone = raw.startsWith('55') ? `+${raw}` : `+55${raw}`;
  return { phone, isBusinessAccount };
}

// Padrões que indicam resposta automática de bot de atendimento
const BOT_PATTERNS = [
  /atendimento\s+(virtual|automático|automatico|bot)/i,
  /resposta\s+automática/i,
  /bem[- ]vindo[a]?\s+ao\s+atendimento/i,
  /cancelar\s+este\s+atendimento/i,
  /escolha\s+a\s+opção\s+desejada/i,
  /políticas?\s+de\s+privacidade/i,
  /responderemos\s+em\s+breve/i,
  /agradecemos?\s+seu\s+contato/i,
  /sou\s+pessoa\s+(física|jurídica|fisica|juridica)/i,
  /\*[0-9]+\.\*\s/,   // menus formatados: *1.* Opção
  /Digite\s+[0-9]+\s+para/i,
  /pressione\s+[0-9]+/i,
  /horário\s+de\s+atendimento/i,
];

function detectAutomatedMessage(text: string, isBusinessAccount: boolean): boolean {
  if (isBusinessAccount) return true;
  if (!text) return false;
  return BOT_PATTERNS.some((p) => p.test(text));
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
  const { phone: whatsApp, isBusinessAccount } = extractPhoneNumber(remoteJid);
  const type = detectMessageType(data);
  const mensagem = extractMessageContent(data, type);

  return {
    clienteNome: data.pushName || 'Desconhecido',
    clienteTelefone: formatPhoneDisplay(whatsApp),
    clienteWhatsApp: whatsApp,
    mensagem,
    messageType: type,
    messageId: data.key?.id,
    ...extractMediaInfo(data, type),
    fromMe: data.key?.fromMe ?? false,
    instanceName: instanceName || data.instanceName || '',
    timestamp: data.messageTimestamp
      ? new Date(data.messageTimestamp * 1000).toISOString()
      : new Date().toISOString(),
    isBusinessAccount,
    isAutomatedMessage: detectAutomatedMessage(mensagem, isBusinessAccount),
    _raw: process.env.NODE_ENV !== 'production' ? data : undefined,
  };
}

const INBOUND_PLACEHOLDER: Record<'audio' | 'image' | 'document', string> = {
  audio: '[ÁUDIO]',
  image: '[IMAGEM]',
  document: '[DOCUMENTO]',
};

/**
 * Converte o evento de entrada (já autenticado pela conexão) no formato do
 * workflow. Vídeo e tipos não suportados viram `unknown` (ignorados).
 */
export function normalizeInboundEvent(event: InboundMessageEvent): NormalizedMessage {
  const { phone: whatsApp, isBusinessAccount } = extractPhoneNumber(event.from);
  const type: MessageType =
    event.type === 'text' || event.type === 'audio' || event.type === 'image' || event.type === 'document'
      ? event.type
      : 'unknown';

  const mensagem =
    type === 'text'
      ? event.text ?? ''
      : type === 'unknown'
        ? '[TIPO NÃO SUPORTADO]'
        : (type !== 'audio' && event.text) || INBOUND_PLACEHOLDER[type];

  return {
    clienteNome: event.pushName || 'Desconhecido',
    clienteTelefone: formatPhoneDisplay(whatsApp),
    clienteWhatsApp: whatsApp,
    mensagem,
    messageType: type,
    messageId: event.messageId || undefined,
    mediaId: event.mediaId,
    mediaBase64: event.mediaBase64,
    mediaMimetype: event.mimetype,
    fromMe: event.fromMe ?? false,
    instanceName: event.recipientId ?? '',
    timestamp: new Date(event.timestamp * 1000).toISOString(),
    isBusinessAccount,
    isAutomatedMessage: detectAutomatedMessage(mensagem, isBusinessAccount),
  };
}
