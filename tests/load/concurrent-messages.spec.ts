/**
 * TESTES DE CARGA: Mensagens Concorrentes
 * Meta: processar 100 mensagens simultâneas em < 30s.
 */

import { normalizeMessage } from '@/lib/services/message-normalizer.service';
import { checkAntiLoop } from '@/lib/guards/anti-loop.guard';
import { formatConversationHistory } from '@/lib/services/history-formatter.service';

function generateRandomMessage(index: number) {
  return {
    key: {
      remoteJid: `558199999${String(index).padStart(4, '0')}@s.whatsapp.net`,
      fromMe: false,
    },
    pushName: `Lead ${index}`,
    message: { conversation: `Mensagem de teste ${index}` },
    instanceName: 'Xpag Atendimento',
  };
}

describe('Carga: Mensagens Concorrentes', () => {
  it('deve normalizar 100 mensagens em < 1s (operação síncrona)', () => {
    const messages = Array.from({ length: 100 }, (_, i) => generateRandomMessage(i));

    const start = Date.now();
    const results = messages.map((m) => normalizeMessage(m));
    const duration = Date.now() - start;

    expect(results).toHaveLength(100);
    expect(results.every((r) => r.messageType === 'text')).toBe(true);
    expect(duration).toBeLessThan(1000);
  });

  it('deve passar pelo anti-loop para 100 mensagens em < 100ms', () => {
    const messages = Array.from({ length: 100 }, (_, i) => normalizeMessage(generateRandomMessage(i)));

    const start = Date.now();
    const results = messages.map((m) => checkAntiLoop(m));
    const duration = Date.now() - start;

    expect(results.every((r) => r.shouldProcess)).toBe(true);
    expect(duration).toBeLessThan(100);
  });

  it('deve formatar 100 históricos de 20 msgs em < 500ms', () => {
    const histories = Array.from({ length: 100 }, (_, leadIdx) =>
      Array.from({ length: 20 }, (_, msgIdx) => ({
        timestamp: new Date(Date.now() - msgIdx * 60000).toISOString(),
        from_lead: msgIdx % 2 === 0,
        message: `Mensagem ${msgIdx} do lead ${leadIdx}`,
      }))
    );

    const start = Date.now();
    const results = histories.map((h) => formatConversationHistory(h));
    const duration = Date.now() - start;

    expect(results).toHaveLength(100);
    expect(duration).toBeLessThan(500);
  });
});
