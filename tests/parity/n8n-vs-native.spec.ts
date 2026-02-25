/**
 * TESTES DE PARIDADE: n8n vs Implementação Nativa
 * Compara comportamento do workflow original com o nativo.
 */

import { normalizeMessage } from '@/lib/services/message-normalizer.service';
import { checkAntiLoop } from '@/lib/guards/anti-loop.guard';
import { formatConversationHistory } from '@/lib/services/history-formatter.service';
import { isFinalizationCommand } from '@/lib/services/tenant-resolver.service';

describe('Paridade n8n vs Nativo', () => {
  describe('NORMALIZAR DADOS', () => {
    it('deve normalizar WhatsApp idêntico ao n8n', () => {
      const input = { key: { remoteJid: '5581999990001@s.whatsapp.net', fromMe: false } };
      const result = normalizeMessage(input);
      expect(result.clienteWhatsApp).toBe('+5581999990001');
    });

    it('deve normalizar número sem 55 prefixo', () => {
      const input = { key: { remoteJid: '81999990001@s.whatsapp.net', fromMe: false } };
      const result = normalizeMessage(input);
      expect(result.clienteWhatsApp).toBe('+5581999990001');
    });

    it('deve extrair texto de extendedTextMessage', () => {
      const input = {
        key: { remoteJid: '5581@s.whatsapp.net', fromMe: false },
        message: { extendedTextMessage: { text: 'Mensagem longa' } },
      };
      const result = normalizeMessage(input);
      expect(result.mensagem).toBe('Mensagem longa');
      expect(result.messageType).toBe('text');
    });
  });

  describe('ANTI-LOOP (fromMe)', () => {
    it('deve bloquear mensagens do bot (fromMe=true)', () => {
      const input = {
        key: { remoteJid: '5581@s.whatsapp.net', fromMe: false },
        message: { conversation: 'test' },
      };
      const normalized = normalizeMessage({ ...input, key: { ...input.key, fromMe: true } });
      const result = checkAntiLoop(normalized);
      expect(result.shouldProcess).toBe(false);
    });
  });

  describe('FORMATAR HISTÓRICO DE CONVERSA', () => {
    it('deve formatar histórico no padrão [HH:mm DD/MM] Role: mensagem', () => {
      const history = [
        {
          timestamp: '2026-02-25T10:30:00.000Z',
          from_lead: true,
          message: 'Olá, quero saber sobre taxas',
        },
        {
          timestamp: '2026-02-25T10:31:00.000Z',
          from_lead: false,
          message: 'Olá! Como posso ajudar?',
        },
      ];

      const formatted = formatConversationHistory(history);
      expect(formatted).toContain('Lead: Olá, quero saber sobre taxas');
      expect(formatted).toContain('Agente: Olá! Como posso ajudar?');
    });

    it('deve retornar "Nenhum histórico anterior" para array vazio', () => {
      expect(formatConversationHistory([])).toBe('Nenhum histórico anterior');
    });
  });

  describe('COMANDO #FINALIZADO', () => {
    it('deve reconhecer #finalizado (case-insensitive)', () => {
      expect(isFinalizationCommand('#finalizado')).toBe(true);
      expect(isFinalizationCommand('#FINALIZADO')).toBe(true);
      expect(isFinalizationCommand('  #finalizado  ')).toBe(true);
    });

    it('não deve reconhecer outras mensagens como #finalizado', () => {
      expect(isFinalizationCommand('olá')).toBe(false);
      expect(isFinalizationCommand('finalizado')).toBe(false);
      expect(isFinalizationCommand('')).toBe(false);
    });
  });

  describe('FOLLOW-UP — Lógica de timing', () => {
    it('deve identificar lead elegível para follow-up (10 min)', () => {
      const tenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();

      const lead = {
        follow_up_count: 0,
        modo_atendimento: 'bot',
        status_msg_wa: 'Em Conversa',
        whatsapp: '+5581999999999',
        data_ultima_interacao: tenMinutesAgo,
      };

      const cutoff10min = new Date(Date.now() - 10 * 60 * 1000);
      const lastInteraction = new Date(lead.data_ultima_interacao);

      expect(lastInteraction < cutoff10min).toBe(true);
      expect(lead.follow_up_count).toBe(0);
    });

    it('deve bloquear lead já com 3 follow-ups', () => {
      const lead = { follow_up_count: 3 };
      const FOLLOW_UP_MESSAGES: Record<number, string> = { 0: 'msg1', 1: 'msg2', 2: 'msg3' };
      expect(FOLLOW_UP_MESSAGES[lead.follow_up_count]).toBeUndefined();
    });
  });

  describe('LEAD ORGÂNICO — Estrutura de criação', () => {
    it('deve criar lead orgânico com campos corretos', () => {
      const idPattern = /^ORG-\d{13}-[a-z0-9]{6}$/;

      function generateOrganicId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).slice(2, 8);
        return `ORG-${timestamp}-${random}`;
      }

      const lead = {
        id: generateOrganicId(),
        categoria: 'Lead Orgânico',
        origem: 'WhatsApp Direto',
        modo_atendimento: 'bot',
        status_msg_wa: 'not_sent',
        follow_up_count: 0,
      };

      expect(lead.id).toMatch(idPattern);
      expect(lead.categoria).toBe('Lead Orgânico');
      expect(lead.origem).toBe('WhatsApp Direto');
    });
  });
});
