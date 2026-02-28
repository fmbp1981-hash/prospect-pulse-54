/**
 * AI AGENT SERVICE — v2 (com AgentConfig + RAG)
 *
 * Melhorias v2:
 * - System prompt carregado dinamicamente do banco (AgentConfigService)
 * - Contexto RAG injetado automaticamente quando disponível
 * - Circuit breaker + retry para chamadas OpenAI
 * - Modelo e temperatura configuráveis por tenant
 */

import { agentConfigService } from './agent-config.service';
import { getCurrentOpenAIKey } from './openai-key-context';
import { buildRagContext } from './rag/rag.service';
import { updateLeadTool } from './tools/update-lead.tool';
import { transferConsultantTool } from './tools/transfer-consultant.tool';
import { openAICircuit, withRetry, withTimeout } from '../utils/resilience';
import type { AgentTool, ToolExecutionContext } from './tools/tool.interface';
import type { Database } from '@/integrations/supabase/types';

type LeadRow = Database['public']['Tables']['leads_prospeccao']['Row'];

const ALL_TOOLS: AgentTool[] = [updateLeadTool, transferConsultantTool];

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface AgentExecutionInput {
  lead: LeadRow;
  isNewLead: boolean;
  processedMessage: string;
  formattedHistory: string;
  instanceName: string;
  tenant: { userId: string; companyName: string };
}

export interface AgentExecutionResult {
  output: string;
  toolCalls: string[];
  model: string;
  promptVersion: string;
  iterations: number;
}

function buildUserPrompt(input: AgentExecutionInput): string {
  const { lead, isNewLead, processedMessage, formattedHistory } = input;

  // Instrução comportamental baseada no tipo de contato
  const hasHistory = formattedHistory && formattedHistory !== 'Nenhum histórico anterior';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mensagemPersonalizada = (lead as any).mensagem_personalizada as string | null;
  const isProspectedWithNoHistory = !isNewLead && !hasHistory && mensagemPersonalizada;

  let behaviorInstruction: string;
  if (isNewLead) {
    behaviorInstruction = 'NOVO CONTATO — lead não existe no banco. Faça a abordagem inicial conforme o fluxo do sistema prompt.';
  } else if (isProspectedWithNoHistory) {
    behaviorInstruction = 'LEAD EXISTENTE RETORNANDO — este lead foi prospectado e está respondendo pela primeira vez. Use a mensagem de prospecção abaixo como contexto do contato anterior. Não se reapresente como se fosse o primeiro contato — você já enviou uma mensagem a ele. Retome naturalmente.';
  } else if (hasHistory) {
    behaviorInstruction = 'LEAD RETORNANDO — histórico disponível. NÃO se reapresente. NÃO repita perguntas já respondidas. Retome de onde parou no estágio atual do pipeline.';
  } else {
    behaviorInstruction = 'LEAD EXISTENTE — sem histórico de conversa registrado. Trate como retorno, mas aborde com naturalidade.';
  }

  // Dados de qualificação já coletados (só exibe se preenchido)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const l = lead as any;
  const qualificationLines = [
    l.faturamento_declarado ? `Faturamento Declarado: ${l.faturamento_declarado}` : null,
    l.usa_meios_pagamento ? `Usa Meios de Pagamento: ${l.usa_meios_pagamento}` : null,
    l.motivo_follow_up ? `Motivo Follow-up: ${l.motivo_follow_up}` : null,
    l.observacoes ? `Observações: ${l.observacoes}` : null,
    l.consultor_responsavel ? `Consultor Responsável: ${l.consultor_responsavel}` : null,
  ].filter(Boolean);

  const qualificationBlock = qualificationLines.length > 0
    ? `\n  [DADOS DE QUALIFICAÇÃO JÁ COLETADOS]\n  ${qualificationLines.join('\n  ')}`
    : '';

  const prospectionBlock = isProspectedWithNoHistory
    ? `\n  [MENSAGEM DE PROSPECÇÃO ENVIADA ANTERIORMENTE]\n  ${mensagemPersonalizada}`
    : '';

  return `[INSTRUÇÃO DE CONTEXTO]
  ${behaviorInstruction}

  [DADOS DO LEAD]
  Nome: ${lead.lead || 'Não informado'}
  WhatsApp: ${lead.whatsapp || ''}
  Empresa: ${lead.empresa || 'Não informada'}
  Categoria: ${l.categoria || 'Não informada'}
  Origem: ${l.origem || 'Não informada'}
  Status WhatsApp: ${lead.status_msg_wa || 'not_sent'}
  Estágio Pipeline: ${lead.estagio_pipeline || 'Nenhum'}
  Última Interação: ${lead.data_ultima_interacao || 'Nunca'}${qualificationBlock}${prospectionBlock}

  [HISTÓRICO DE CONVERSAS]
  ${formattedHistory}

  [MENSAGEM RECEBIDA AGORA]
  ${processedMessage}`;
}

async function callOpenAI(
  messages: OpenAIMessage[],
  model: string,
  temperature: number,
  withTools: boolean
): Promise<{
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}> {
  return openAICircuit.call(() =>
    withRetry(async () => {
      const body: Record<string, unknown> = {
        model,
        messages,
        temperature,
        max_tokens: 1024,
      };

      if (withTools) {
        body.tools = ALL_TOOLS.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
        body.tool_choice = 'auto';
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getCurrentOpenAIKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${err}`);
      }

      const data = (await response.json()) as {
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{
              id: string;
              type: 'function';
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      };

      return data.choices[0].message;
    }, { maxAttempts: 2, initialDelayMs: 1500 })
  );
}

export async function executeAIAgent(
  input: AgentExecutionInput
): Promise<AgentExecutionResult> {
  // 1. Carrega configuração do agente (prompt + modelo configuráveis por tenant)
  const config = await agentConfigService.getActive(input.tenant.userId).catch(() => null);

  const model = config?.model ?? 'gpt-4.1';
  const temperature = config?.temperature ?? 0.7;
  const maxIterations = config?.maxIterations ?? 5;
  const promptVersion = config?.promptVersion ?? '3.4';

  // 2. Busca contexto RAG relevante para a mensagem do lead
  let systemPrompt = config?.systemPrompt ?? '';
  if (input.processedMessage) {
    const ragContext = await buildRagContext(
      input.processedMessage,
      input.tenant.userId,
      config?.id !== 'default' ? config?.id : undefined
    ).catch(() => '');

    if (ragContext) {
      systemPrompt += ragContext;
    }
  }

  const toolCtx: ToolExecutionContext = {
    leadId: input.lead.id,
    whatsapp: input.lead.whatsapp ?? '',
    instanceName: input.instanceName,
    userId: input.lead.user_id ?? '',
  };

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildUserPrompt(input) },
  ];

  const toolCallHistory: string[] = [];
  let iterations = 0;

  // 3. Loop de tool calling
  while (iterations < maxIterations) {
    iterations++;

    const response = await withTimeout(
      callOpenAI(messages, model, temperature, true),
      30_000,
      `agent-iteration-${iterations}`
    );

    if (!response.tool_calls?.length) {
      return {
        output: response.content ?? '',
        toolCalls: toolCallHistory,
        model,
        promptVersion,
        iterations,
      };
    }

    messages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.tool_calls,
    });

    for (const toolCall of response.tool_calls) {
      const tool = ALL_TOOLS.find((t) => t.name === toolCall.function.name);
      let toolResult: unknown;

      try {
        const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        toolResult = tool
          ? await tool.execute(args, toolCtx)
          : { error: `Tool "${toolCall.function.name}" not found` };
        if (tool) toolCallHistory.push(toolCall.function.name);
      } catch (err) {
        toolResult = { error: err instanceof Error ? err.message : String(err) };
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify(toolResult),
      });
    }
  }

  // 4. Forçar resposta final sem tools
  const finalResponse = await callOpenAI(messages, model, temperature, false);

  return {
    output: finalResponse.content ?? '',
    toolCalls: toolCallHistory,
    model,
    promptVersion,
    iterations,
  };
}
