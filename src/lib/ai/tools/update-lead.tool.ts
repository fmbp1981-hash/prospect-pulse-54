/**
 * TOOL: atualizar_lead
 * Equivalente nativo à tool "atualizar_lead" do AI Agent no n8n.
 * Atualiza campos do lead no Supabase.
 */

import { leadService } from '../../services/lead.service';
import type { AgentTool, ToolExecutionContext } from './tool.interface';

export const updateLeadTool: AgentTool = {
  name: 'atualizar_lead',
  description:
    'Atualiza informações do lead no banco de dados. Use para atualizar status_msg_wa, estagio_pipeline, empresa, modo_atendimento ou motivo_follow_up.',
  parameters: {
    type: 'object',
    properties: {
      status_msg_wa: {
        type: 'string',
        description:
          'Status da conversa WhatsApp. Valores: not_sent, Em Conversa, Qualificando, Qualificado, Follow-up, Transferido',
      },
      estagio_pipeline: {
        type: 'string',
        description:
          'Estágio no funil de vendas. Ex: Novo Lead, Contato Inicial, Qualificação, Transferido para Consultor, Follow-up',
      },
      empresa: {
        type: 'string',
        description: 'Nome da empresa do lead',
      },
      modo_atendimento: {
        type: 'string',
        description: 'Modo de atendimento: "bot" ou "humano"',
      },
      motivo_follow_up: {
        type: 'string',
        description: 'Motivo do follow-up quando aplicável',
      },
      faturamento_declarado: {
        type: 'string',
        description: 'Faturamento declarado pelo lead (em texto)',
      },
      usa_meios_pagamento: {
        type: 'string',
        description: 'Se o lead usa meios de pagamento: "sim", "não" ou descrição',
      },
    },
  },
  async execute(
    args: Record<string, unknown>,
    ctx: ToolExecutionContext
  ): Promise<{ success: boolean; updated: Record<string, unknown> }> {
    const allowedFields = [
      'status_msg_wa',
      'estagio_pipeline',
      'empresa',
      'modo_atendimento',
      'motivo_follow_up',
      'faturamento_declarado',
      'usa_meios_pagamento',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (args[field] !== undefined) {
        updates[field] = args[field];
      }
    }

    await leadService.updateLead(ctx.leadId, updates as Parameters<typeof leadService.updateLead>[1]);

    return { success: true, updated: updates };
  },
};
