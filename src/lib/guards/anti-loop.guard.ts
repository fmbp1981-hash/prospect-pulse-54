/**
 * FLUXO 1 - AntiLoop (fromMe)
 * Equivalente nativo ao node "AntiLoop (fromMe)" do workflow n8n.
 * Bloqueia mensagens enviadas pelo próprio bot para evitar loop infinito.
 */

import type { NormalizedMessage } from '../services/message-normalizer.service';

export interface AntiLoopResult {
  shouldProcess: boolean;
  reason?: string;
}

export function checkAntiLoop(message: NormalizedMessage): AntiLoopResult {
  if (message.fromMe) {
    return {
      shouldProcess: false,
      reason: 'Mensagem enviada pelo bot (fromMe=true) — ignorando para evitar loop',
    };
  }

  // Ignorar grupos (@g.us)
  if (message.clienteWhatsApp.includes('@g.us')) {
    return {
      shouldProcess: false,
      reason: 'Mensagem de grupo — ignorando',
    };
  }

  // Ignorar tipos não suportados de forma silenciosa
  if (message.messageType === 'unknown') {
    return {
      shouldProcess: false,
      reason: 'Tipo de mensagem não suportado',
    };
  }

  return { shouldProcess: true };
}
