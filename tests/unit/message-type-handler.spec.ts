/**
 * processMessageByType — mídia sem base64 inline é baixada pela conexão de
 * WhatsApp da organização (provider.downloadMedia no alvo da conexão), não
 * mais pelo cliente Evolution global (media.client.ts, removido).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NormalizedMessage } from '@/lib/services/message-normalizer.service';
import type { MediaSource } from '@/lib/handlers/message-type.handler';

const mocks = vi.hoisted(() => ({
  transcribeAudio: vi.fn(async () => 'transcrição'),
  analyzeImage: vi.fn(async () => '**descrição**'),
  analyzePdf: vi.fn(async () => 'resumo'),
}));
vi.mock('@/lib/integrations/openai/whisper.service', () => ({ transcribeAudio: mocks.transcribeAudio }));
vi.mock('@/lib/integrations/openai/vision.service', () => ({ analyzeImage: mocks.analyzeImage }));
vi.mock('@/lib/services/pdf-analyzer.service', () => ({ analyzePdf: mocks.analyzePdf }));

import { processMessageByType } from '@/lib/handlers/message-type.handler';

const downloadMedia = vi.fn(async () => ({
  buffer: new Uint8Array([104, 105]),
  mimetype: 'audio/ogg',
  base64: 'aGk=',
}));
const media: MediaSource = {
  provider: { downloadMedia } as unknown as NonNullable<MediaSource>['provider'],
  target: 'inst-org-a',
};

function msg(messageType: string, extra: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return { messageType, mensagem: '', mediaMimetype: 'audio/ogg', ...extra } as unknown as NormalizedMessage;
}

beforeEach(() => vi.clearAllMocks());

describe('processMessageByType', () => {
  it('áudio sem base64 → baixa pela conexão da organização (alvo da conexão)', async () => {
    const r = await processMessageByType(msg('audio'), media, 'msg-1');
    expect(downloadMedia).toHaveBeenCalledWith('inst-org-a', 'msg-1');
    const buf = (mocks.transcribeAudio.mock.calls[0] as unknown as [Buffer])[0];
    expect(buf.toString('utf8')).toBe('hi');
    expect(r).toEqual({ content: 'transcrição', messageType: 'audio' });
  });

  it('imagem com base64 inline → não baixa nada', async () => {
    const r = await processMessageByType(msg('image', { mediaBase64: 'aGk=' }), media, 'msg-1');
    expect(downloadMedia).not.toHaveBeenCalled();
    expect(r).toEqual({ content: '[IMAGEM]: descrição', messageType: 'image' });
  });

  it('documento sem base64 e organização sem conexão → mensagem de fallback, sem download', async () => {
    const r = await processMessageByType(msg('document'), null, 'msg-1');
    expect(downloadMedia).not.toHaveBeenCalled();
    expect(mocks.analyzePdf).not.toHaveBeenCalled();
    expect(r.messageType).toBe('document');
    expect(r.content).toContain('não foi possível');
  });
});
