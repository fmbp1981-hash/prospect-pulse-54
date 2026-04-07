/**
 * FLUXO 2 - FORMATAR HISTÓRICO DE CONVERSA
 * Equivalente nativo ao node "Formatar Histórico_conversa" (JavaScript) do n8n.
 * Converte registros do banco em texto legível para contexto do agente.
 */

interface ConversationEntry {
  timestamp: string;
  from_lead: boolean;
  message: string;
}

/**
 * Formata histórico de conversa em texto para o agente.
 *
 * Exemplo de saída:
 * [10:30 25/02] Lead: Olá, quero saber sobre taxas
 * [10:31 25/02] Agente: Olá! Tudo bem? Obrigado por entrar em contato...
 */
export function formatConversationHistory(
  conversations: ConversationEntry[]
): string {
  if (!conversations || conversations.length === 0) {
    return 'Nenhum histórico anterior';
  }

  return conversations
    .map((entry) => {
      const date = new Date(entry.timestamp);
      const time = date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const day = date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      });

      const role = entry.from_lead ? 'Lead' : 'Agente';
      return `[${time} ${day}] ${role}: ${entry.message}`;
    })
    .join('\n');
}
