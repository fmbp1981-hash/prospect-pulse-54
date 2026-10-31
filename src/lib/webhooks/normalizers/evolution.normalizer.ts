/**
 * Normalizador do webhook da Evolution API (movido do provider na Sprint 2b).
 *
 * v2: { event, instance, data: { key, pushName, message, messageTimestamp }, apikey? }
 * v1: o objeto da mensagem vem direto na raiz (com instanceName).
 *
 * Função pura: sem credenciais, sem rede. Grupos (@g.us), status (@broadcast)
 * e eventos sem remoteJid (ack/entrega) não viram evento.
 */
import { z } from 'zod';
import { senderDigits, type NormalizedInboundEvent } from './inbound-event';

const mediaSchema = z.object({
  base64: z.string().optional(),
  mimetype: z.string().optional(),
  caption: z.string().optional(),
  title: z.string().optional(),
  fileName: z.string().optional(),
});

const messageDataSchema = z.object({
  key: z.object({
    remoteJid: z.string().min(1),
    fromMe: z.boolean().optional(),
    id: z.string().optional(),
  }),
  pushName: z.string().nullish(),
  message: z
    .object({
      conversation: z.string().optional(),
      extendedTextMessage: z.object({ text: z.string().optional() }).optional(),
      audioMessage: mediaSchema.optional(),
      imageMessage: mediaSchema.optional(),
      documentMessage: mediaSchema.optional(),
      videoMessage: mediaSchema.optional(),
    })
    .nullish(),
  messageTimestamp: z.union([z.number(), z.string().regex(/^\d+$/)]).optional(),
  instanceName: z.string().optional(),
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Instância declarada no payload (v2: `instance`; v1: `instanceName`). '' se ausente. */
export function extractEvolutionInstance(body: unknown): string {
  const raw = asRecord(body);
  if (!raw) return '';
  if (typeof raw.instance === 'string') return raw.instance;
  const inner = asRecord(raw.data) ?? raw;
  return typeof inner.instanceName === 'string' ? inner.instanceName : '';
}

/** Campo `apikey` do corpo (a Evolution v2 o inclui no payload do webhook). */
export function extractEvolutionBodyApiKey(body: unknown): string | null {
  const raw = asRecord(body);
  return raw && typeof raw.apikey === 'string' ? raw.apikey : null;
}

export function normalizeEvolutionPayload(body: unknown): NormalizedInboundEvent[] {
  const raw = asRecord(body);
  if (!raw) return [];
  const parsed = messageDataSchema.safeParse(asRecord(raw.data) ?? raw);
  if (!parsed.success) return [];

  const data = parsed.data;
  const jid = data.key.remoteJid;
  if (jid.includes('@g.us') || jid.includes('@broadcast')) return [];

  const from = senderDigits(jid);
  if (!from) return [];

  const msg = data.message ?? {};
  const messageId = data.key.id ?? '';
  const event: NormalizedInboundEvent = {
    provider: 'evolution',
    from,
    messageId,
    timestamp: data.messageTimestamp ? Number(data.messageTimestamp) : Math.floor(Date.now() / 1000),
    type: 'unsupported',
    pushName: data.pushName ?? undefined,
    fromMe: data.key.fromMe ?? false,
    recipientId: extractEvolutionInstance(body),
  };

  // Na Evolution o download de mídia é pelo id da mensagem.
  const withMedia = (
    type: NormalizedInboundEvent['type'],
    m: z.infer<typeof mediaSchema>,
    defaultMime: string,
    text?: string
  ): NormalizedInboundEvent => ({
    ...event,
    type,
    mediaId: messageId || undefined,
    mimetype: m.mimetype || defaultMime,
    ...(m.base64 ? { mediaBase64: m.base64 } : {}),
    ...(text ? { text } : {}),
  });

  if (msg.conversation !== undefined || msg.extendedTextMessage) {
    return [{ ...event, type: 'text', text: msg.conversation || msg.extendedTextMessage?.text || '' }];
  }
  if (msg.audioMessage) return [withMedia('audio', msg.audioMessage, 'audio/ogg')];
  if (msg.imageMessage) return [withMedia('image', msg.imageMessage, 'image/jpeg', msg.imageMessage.caption)];
  if (msg.documentMessage) {
    const d = msg.documentMessage;
    return [withMedia('document', d, 'application/pdf', d.title ?? d.fileName)];
  }
  if (msg.videoMessage) return [withMedia('video', msg.videoMessage, 'video/mp4', msg.videoMessage.caption)];
  return [event];
}
