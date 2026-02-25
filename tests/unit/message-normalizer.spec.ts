/**
 * TESTES DE PARIDADE: message-normalizer
 * Garante normalização idêntica ao node "NORMALIZAR DADOS" do n8n.
 */

import { normalizeMessage } from '@/lib/services/message-normalizer.service';

describe('MessageNormalizer — Paridade com n8n', () => {
  it('deve extrair número WhatsApp no formato +55DDNNNNNNNNN', () => {
    const payload = {
      key: { remoteJid: '5581999990001@s.whatsapp.net', fromMe: false },
      pushName: 'João Silva',
      message: { conversation: 'Olá' },
      instanceName: 'Xpag Atendimento',
    };

    const result = normalizeMessage(payload);
    expect(result.clienteWhatsApp).toBe('+5581999990001');
  });

  it('deve formatar telefone para (DD) NNNNN-NNNN', () => {
    const payload = {
      key: { remoteJid: '5581999990001@s.whatsapp.net', fromMe: false },
      pushName: 'João',
      message: { conversation: 'Oi' },
    };

    const result = normalizeMessage(payload);
    expect(result.clienteTelefone).toBe('(81) 99999-0001');
  });

  it('deve detectar mensagem de texto corretamente', () => {
    const payload = {
      key: { remoteJid: '5581999990001@s.whatsapp.net', fromMe: false },
      message: { conversation: 'Quero saber sobre taxas' },
    };

    const result = normalizeMessage(payload);
    expect(result.messageType).toBe('text');
    expect(result.mensagem).toBe('Quero saber sobre taxas');
  });

  it('deve detectar áudio corretamente', () => {
    const payload = {
      key: { remoteJid: '5581999990001@s.whatsapp.net', fromMe: false },
      message: { audioMessage: { url: 'https://...', mimetype: 'audio/ogg' } },
    };

    const result = normalizeMessage(payload);
    expect(result.messageType).toBe('audio');
    expect(result.mensagem).toBe('[ÁUDIO]');
  });

  it('deve detectar imagem corretamente', () => {
    const payload = {
      key: { remoteJid: '5581999990001@s.whatsapp.net', fromMe: false },
      message: { imageMessage: { url: 'https://...', caption: 'Logo da empresa' } },
    };

    const result = normalizeMessage(payload);
    expect(result.messageType).toBe('image');
    expect(result.mensagem).toBe('Logo da empresa');
  });

  it('deve marcar fromMe=true quando mensagem é do bot', () => {
    const payload = {
      key: { remoteJid: '5581999990001@s.whatsapp.net', fromMe: true },
      message: { conversation: 'Resposta do bot' },
    };

    const result = normalizeMessage(payload);
    expect(result.fromMe).toBe(true);
  });

  it('deve usar "Desconhecido" quando pushName não está presente', () => {
    const payload = {
      key: { remoteJid: '5581999990001@s.whatsapp.net', fromMe: false },
      message: { conversation: 'Oi' },
    };

    const result = normalizeMessage(payload);
    expect(result.clienteNome).toBe('Desconhecido');
  });
});
