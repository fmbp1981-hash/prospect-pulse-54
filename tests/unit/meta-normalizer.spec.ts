/**
 * Normalizadores puros do webhook de WhatsApp (Sprint 2b, Task 6).
 * Fixtures no formato real da Graph API v20 (Meta) e da Evolution API v2.
 */
import { describe, it, expect } from 'vitest';
import { normalizeMetaPayload } from '@/lib/webhooks/normalizers/meta.normalizer';
import {
  normalizeEvolutionPayload,
  extractEvolutionInstance,
} from '@/lib/webhooks/normalizers/evolution.normalizer';
import { normalizeInboundEvent } from '@/lib/services/message-normalizer.service';

function metaPayload(messages: unknown[], extra: Record<string, unknown> = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '102290129340398',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550783881', phone_number_id: '106540352242922' },
              contacts: [{ profile: { name: 'Sheena Nelson' }, wa_id: '16505551234' }],
              messages,
              ...extra,
            },
          },
        ],
      },
    ],
  };
}

const TEXT = {
  from: '16505551234',
  id: 'wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=',
  timestamp: '1749416383',
  type: 'text',
  text: { body: 'Does it come in another color?' },
};
const AUDIO = {
  from: '16505551234',
  id: 'wamid.AUDIO',
  timestamp: '1744344496',
  type: 'audio',
  audio: { mime_type: 'audio/ogg; codecs=opus', sha256: 'abc=', id: '1003383421387256', voice: true },
};
const IMAGE = {
  from: '16505551234',
  id: 'wamid.IMAGE',
  timestamp: '1744344496',
  type: 'image',
  image: { caption: 'Black jacket', mime_type: 'image/jpeg', sha256: 'def=', id: '1003383421387257' },
};

describe('normalizeMetaPayload', () => {
  it('texto vira InboundMessageEvent com remetente, id, timestamp e nome', () => {
    expect(normalizeMetaPayload(metaPayload([TEXT]))).toEqual([
      {
        provider: 'meta_cloud',
        from: '16505551234',
        messageId: TEXT.id,
        timestamp: 1749416383,
        type: 'text',
        text: 'Does it come in another color?',
        pushName: 'Sheena Nelson',
        fromMe: false,
        recipientId: '106540352242922',
      },
    ]);
  });

  it('áudio traz mediaId e mimetype da Graph API', () => {
    const [ev] = normalizeMetaPayload(metaPayload([AUDIO]));
    expect(ev).toMatchObject({
      type: 'audio',
      mediaId: '1003383421387256',
      mimetype: 'audio/ogg; codecs=opus',
      messageId: 'wamid.AUDIO',
    });
    expect(ev.text).toBeUndefined();
  });

  it('imagem traz mediaId, mimetype e legenda', () => {
    const [ev] = normalizeMetaPayload(metaPayload([IMAGE]));
    expect(ev).toMatchObject({
      type: 'image',
      mediaId: '1003383421387257',
      mimetype: 'image/jpeg',
      text: 'Black jacket',
    });
  });

  it('várias mensagens no mesmo webhook viram vários eventos', () => {
    expect(normalizeMetaPayload(metaPayload([TEXT, IMAGE]))).toHaveLength(2);
  });

  it('status de entrega (sem messages) → lista vazia', () => {
    const statusOnly = metaPayload([], {
      messages: undefined,
      statuses: [{ id: 'wamid.X', status: 'delivered', timestamp: '1749416383', recipient_id: '16505551234' }],
    });
    expect(normalizeMetaPayload(statusOnly)).toEqual([]);
  });

  it('tipo não suportado (sticker) vira unsupported; payload que não é Meta → vazio', () => {
    const [ev] = normalizeMetaPayload(
      metaPayload([{ from: '1', id: 'wamid.S', timestamp: '1', type: 'sticker', sticker: { id: 'x' } }])
    );
    expect(ev.type).toBe('unsupported');
    expect(normalizeMetaPayload({ event: 'messages.upsert' })).toEqual([]);
    expect(normalizeMetaPayload(null)).toEqual([]);
  });

  it('mensagem malformada é descartada sem derrubar as outras', () => {
    expect(normalizeMetaPayload(metaPayload([{ type: 'text' }, TEXT]))).toHaveLength(1);
  });
});

describe('normalizeEvolutionPayload', () => {
  const upsert = (data: Record<string, unknown>) => ({ event: 'messages.upsert', instance: 'inst-a', data });

  it('texto (conversation) vira evento com instância declarada', () => {
    const [ev] = normalizeEvolutionPayload(
      upsert({
        key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, id: 'ABC' },
        pushName: 'Fulano',
        message: { conversation: 'oi' },
        messageTimestamp: 1730000000,
      })
    );
    expect(ev).toMatchObject({
      provider: 'evolution',
      from: '5511999990000',
      messageId: 'ABC',
      timestamp: 1730000000,
      type: 'text',
      text: 'oi',
      fromMe: false,
      recipientId: 'inst-a',
    });
  });

  it('áudio com base64 inline e mimetype padrão', () => {
    const [ev] = normalizeEvolutionPayload(
      upsert({
        key: { remoteJid: '5511999990000@s.whatsapp.net', id: 'AUD' },
        message: { audioMessage: { base64: 'AAAA' } },
      })
    );
    expect(ev).toMatchObject({ type: 'audio', mediaId: 'AUD', mimetype: 'audio/ogg', mediaBase64: 'AAAA' });
  });

  it('grupo e eventos sem remoteJid são ignorados', () => {
    expect(
      normalizeEvolutionPayload(upsert({ key: { remoteJid: '1203@g.us', id: 'G' }, message: { conversation: 'x' } }))
    ).toEqual([]);
    expect(normalizeEvolutionPayload({ event: 'messages.update', instance: 'inst-a', data: { status: 'READ' } })).toEqual([]);
  });

  it('extractEvolutionInstance lê v2 (instance) e v1 (instanceName)', () => {
    expect(extractEvolutionInstance({ instance: 'v2' })).toBe('v2');
    expect(extractEvolutionInstance({ key: {}, instanceName: 'v1' })).toBe('v1');
    expect(extractEvolutionInstance({})).toBe('');
  });
});

describe('normalizeInboundEvent (evento → formato do workflow)', () => {
  const base = {
    organizationId: 'org',
    connectionId: 'conn',
    provider: 'meta_cloud' as const,
    from: '5511999990000',
    messageId: 'wamid.1',
    timestamp: 1730000000,
  };

  it('Meta imagem: usa o id da mídia para download e a legenda como mensagem', () => {
    const n = normalizeInboundEvent({ ...base, type: 'image', mediaId: 'MEDIA', mimetype: 'image/jpeg', text: 'foto' });
    expect(n).toMatchObject({
      clienteWhatsApp: '+5511999990000',
      messageType: 'image',
      mensagem: 'foto',
      messageId: 'wamid.1',
      mediaId: 'MEDIA',
      mediaMimetype: 'image/jpeg',
      fromMe: false,
    });
    expect(n.timestamp).toBe(new Date(1730000000 * 1000).toISOString());
  });

  it('vídeo e não suportado viram unknown', () => {
    expect(normalizeInboundEvent({ ...base, type: 'video' }).messageType).toBe('unknown');
    expect(normalizeInboundEvent({ ...base, type: 'unsupported' }).messageType).toBe('unknown');
  });
});
