/**
 * TESTES: anti-loop guard
 */

import { checkAntiLoop } from '@/lib/guards/anti-loop.guard';
import type { NormalizedMessage } from '@/lib/services/message-normalizer.service';

function makeMsg(overrides: Partial<NormalizedMessage>): NormalizedMessage {
  return {
    clienteNome: 'Test',
    clienteTelefone: '(81) 9999-9999',
    clienteWhatsApp: '+5581999999999',
    mensagem: 'Olá',
    messageType: 'text',
    fromMe: false,
    instanceName: 'Xpag Test',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('AntiLoop Guard', () => {
  it('deve bloquear mensagens fromMe=true', () => {
    const result = checkAntiLoop(makeMsg({ fromMe: true }));
    expect(result.shouldProcess).toBe(false);
  });

  it('deve permitir mensagens fromMe=false', () => {
    const result = checkAntiLoop(makeMsg({ fromMe: false }));
    expect(result.shouldProcess).toBe(true);
  });

  it('deve bloquear tipo desconhecido', () => {
    const result = checkAntiLoop(makeMsg({ messageType: 'unknown' }));
    expect(result.shouldProcess).toBe(false);
  });

  it('deve permitir texto, áudio, imagem e documento', () => {
    for (const type of ['text', 'audio', 'image', 'document'] as const) {
      const result = checkAntiLoop(makeMsg({ messageType: type }));
      expect(result.shouldProcess).toBe(true);
    }
  });
});
