/**
 * Normalizador do webhook da Meta Cloud API (Graph API v20).
 *
 * Formato:
 * {
 *   object: "whatsapp_business_account",
 *   entry: [{ id, changes: [{ field: "messages", value: {
 *     messaging_product, metadata: { display_phone_number, phone_number_id },
 *     contacts?: [{ profile: { name }, wa_id }],
 *     messages?: [{ from, id, timestamp, type, text?|audio?|image?|document?|video? }],
 *     statuses?: [...]   // atualizações de entrega/leitura: ignoradas
 *   } }] }]
 * }
 *
 * Função pura: sem credenciais, sem rede. Devolve uma lista (um webhook pode
 * trazer várias mensagens); mensagem fora do formato é descartada.
 */
import { z } from 'zod';
import { senderDigits, type InboundMessageType, type NormalizedInboundEvent } from './inbound-event';

const mediaSchema = z.object({
  id: z.string().optional(),
  mime_type: z.string().optional(),
  caption: z.string().optional(),
  filename: z.string().optional(),
});

const messageSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  timestamp: z.string().regex(/^\d+$/),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  audio: mediaSchema.optional(),
  image: mediaSchema.optional(),
  document: mediaSchema.optional(),
  video: mediaSchema.optional(),
});

const valueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string() }).partial().optional(),
  contacts: z
    .array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).optional() }))
    .optional(),
  messages: z.array(z.unknown()).optional(),
});

const payloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z
    .array(z.object({ changes: z.array(z.object({ value: z.unknown() })).optional() }))
    .optional(),
});

type MetaMessage = z.infer<typeof messageSchema>;

function toEvent(
  msg: MetaMessage,
  pushName: string | undefined,
  recipientId: string | undefined
): NormalizedInboundEvent {
  const base: NormalizedInboundEvent = {
    provider: 'meta_cloud',
    from: senderDigits(msg.from),
    messageId: msg.id,
    timestamp: Number(msg.timestamp),
    type: 'unsupported',
    pushName,
    fromMe: false, // a Meta não entrega pelo webhook as mensagens enviadas pelo próprio número
    recipientId,
  };

  const media = (type: InboundMessageType, m: z.infer<typeof mediaSchema> | undefined, text?: string) => ({
    ...base,
    type,
    mediaId: m?.id,
    mimetype: m?.mime_type,
    ...(text ? { text } : {}),
  });

  switch (msg.type) {
    case 'text':
      return { ...base, type: 'text', text: msg.text?.body ?? '' };
    case 'audio':
      return media('audio', msg.audio);
    case 'image':
      return media('image', msg.image, msg.image?.caption);
    case 'document':
      return media('document', msg.document, msg.document?.filename ?? msg.document?.caption);
    case 'video':
      return media('video', msg.video, msg.video?.caption);
    default:
      return base;
  }
}

export function normalizeMetaPayload(body: unknown): NormalizedInboundEvent[] {
  const payload = payloadSchema.safeParse(body);
  if (!payload.success) return [];

  const events: NormalizedInboundEvent[] = [];
  for (const entry of payload.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = valueSchema.safeParse(change.value);
      if (!value.success || !value.data.messages?.length) continue; // ex.: só statuses

      const recipientId = value.data.metadata?.phone_number_id;
      const contacts = value.data.contacts ?? [];

      for (const raw of value.data.messages) {
        const msg = messageSchema.safeParse(raw);
        if (!msg.success) continue;
        const contact = contacts.find((c) => c.wa_id === msg.data.from) ?? contacts[0];
        events.push(toEvent(msg.data, contact?.profile?.name, recipientId));
      }
    }
  }
  return events;
}
