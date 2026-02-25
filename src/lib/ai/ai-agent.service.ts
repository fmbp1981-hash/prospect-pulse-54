/**
 * FLUXO 3B - AI AGENT SERVICE (MÓDULO CENTRAL)
 * Equivalente nativo ao node "AI Agent" (GPT-4.1, @n8n/n8n-nodes-langchain.agent) do n8n.
 *
 * Implementa:
 * - LLM com tool calling (OpenAI function calling)
 * - Contexto do lead injetado no prompt
 * - Execução de tools (atualizar_lead, transferir_para_consultor)
 * - Máximo 5 iterações (maxIterations=5)
 */

import { SYSTEM_PROMPT_V3_4, SYSTEM_PROMPT_VERSION } from './prompts/system-prompt.v3.4';
import { updateLeadTool } from './tools/update-lead.tool';
import { transferConsultantTool } from './tools/transfer-consultant.tool';
import type { AgentTool, ToolExecutionContext } from './tools/tool.interface';
import type { Database } from '@/integrations/supabase/types';

type LeadRow = Database['public']['Tables']['leads_prospeccao']['Row'];

const OPENAI_API_KEY = () => process.env.OPENAI_API_KEY!;
const MODEL = 'gpt-4.1'; // Mesmo modelo do n8n
const MAX_ITERATIONS = 5;

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

  return `[CONTEXTO DO CONTATO]
  Nome: ${lead.lead || 'Não informado'}
  WhatsApp: ${lead.whatsapp || ''}
  Lead Encontrado no Banco: ${isNewLead ? 'NÃO - LEAD NOVO' : 'SIM'}
  Status WhatsApp: ${lead.status_msg_wa || 'not_sent'}
  Modo Atendimento: ${lead.modo_atendimento || 'bot'}
  Estágio Pipeline: ${lead.estagio_pipeline || 'Nenhum'}
  Empresa: ${lead.empresa || 'Não informada'}

  [HISTÓRICO DE CONVERSAS]
  ${formattedHistory}

  [MENSAGEM RECEBIDA]
  ${processedMessage}`;
}

async function callOpenAI(messages: OpenAIMessage[]): Promise<{
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: ALL_TOOLS.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      tool_choice: 'auto',
      max_tokens: 1024,
      temperature: 0.7,
    }),
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
}

export async function executeAIAgent(
  input: AgentExecutionInput
): Promise<AgentExecutionResult> {
  const toolCtx: ToolExecutionContext = {
    leadId: input.lead.id,
    whatsapp: input.lead.whatsapp ?? '',
    instanceName: input.instanceName,
    userId: input.lead.user_id ?? '',
  };

  const messages: OpenAIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT_V3_4 },
    { role: 'user', content: buildUserPrompt(input) },
  ];

  const toolCallHistory: string[] = [];
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await callOpenAI(messages);

    // Se não há tool calls → resposta final
    if (!response.tool_calls || response.tool_calls.length === 0) {
      return {
        output: response.content ?? '',
        toolCalls: toolCallHistory,
        model: MODEL,
        promptVersion: SYSTEM_PROMPT_VERSION,
        iterations,
      };
    }

    // Adiciona resposta do assistente com tool_calls
    messages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.tool_calls,
    });

    // Executa cada tool call
    for (const toolCall of response.tool_calls) {
      const tool = ALL_TOOLS.find((t) => t.name === toolCall.function.name);

      let toolResult: unknown;
      if (tool) {
        try {
          const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
          toolResult = await tool.execute(args, toolCtx);
          toolCallHistory.push(toolCall.function.name);
        } catch (err) {
          toolResult = { error: err instanceof Error ? err.message : String(err) };
        }
      } else {
        toolResult = { error: `Tool "${toolCall.function.name}" not found` };
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify(toolResult),
      });
    }
  }

  // Última chamada após esgotar iterações (sem tool_choice para forçar resposta)
  const finalResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tool_choice: 'none',
      max_tokens: 512,
    }),
  });

  const finalData = (await finalResponse.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return {
    output: finalData.choices[0]?.message?.content ?? '',
    toolCalls: toolCallHistory,
    model: MODEL,
    promptVersion: SYSTEM_PROMPT_VERSION,
    iterations,
  };
}
