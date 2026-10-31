/**
 * Contexto de LLM por organização (Sprint 2b).
 *
 * A chave e o modelo vêm SEMPRE da conexão `llm` ativa da organização
 * (credencial própria ou da plataforma, resolvida pelo resolveConnection).
 * Não existe fallback para variável de ambiente, user_settings ou outra organização.
 *
 * Uso:
 *   await withLlmForOrganization(organizationId, async () => { ... });
 *   // ou, para tratar "não configurado" antes de qualquer efeito:
 *   const llm = await resolveLlmForOrganization(organizationId);
 *   await runWithLlm(llm, async () => { ... });
 *   const { apiKey, model } = getCurrentLlm();   // nos serviços
 *   await recordLlmUsage(data.usage, 'chat.completions');
 *
 * AsyncLocalStorage propaga o contexto para chamadas aninhadas sem mudar
 * assinaturas (Workers: nodejs_compat).
 */

import { AsyncLocalStorage } from 'async_hooks';
import { resolveConnection } from '@/lib/connectors/resolve-connection';
import { recordUsage } from '@/lib/connectors/usage';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';
import { resolveOrganizationIdForUser } from '@/lib/connectors/org-context';

export interface LlmContext {
  organizationId: string;
  connectionId: string;
  apiKey: string;
  model?: string;
}

export interface LlmUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export const LLM_NOT_CONFIGURED_ERROR = {
  code: 'LLM_NOT_CONFIGURED',
  message: 'IA não configurada para esta organização. Fale com a equipe IntelliX.',
} as const;

const llmStorage = new AsyncLocalStorage<LlmContext>();

/**
 * Resolve a conexão `llm` ativa da organização (credencial própria ou da
 * plataforma). Sem conexão → ConnectionNotConfiguredError.
 */
export async function resolveLlmForOrganization(organizationId: string): Promise<LlmContext> {
  const conn = await resolveConnection(organizationId, 'llm', 'openai');
  return {
    organizationId: conn.organizationId,
    connectionId: conn.id,
    apiKey: conn.secret.apiKey,
    model: conn.config.model,
  };
}

/**
 * LLM da organização do usuário (rotas autenticadas). Sem organização ou sem
 * conexão `llm` ativa → null (a rota responde 409 LLM_NOT_CONFIGURED);
 * outros erros (ex.: falha ao decifrar) propagam.
 */
export async function resolveLlmForUser(userId: string): Promise<LlmContext | null> {
  const organizationId = await resolveOrganizationIdForUser(userId);
  if (!organizationId) return null;
  try {
    return await resolveLlmForOrganization(organizationId);
  } catch (err) {
    if (err instanceof ConnectionNotConfiguredError) return null;
    throw err;
  }
}

/** Executa `fn` com um contexto de LLM já resolvido. */
export function runWithLlm<T>(ctx: LlmContext, fn: () => Promise<T>): Promise<T> {
  return llmStorage.run(ctx, fn);
}

/**
 * Resolve a conexão `llm` da organização e executa `fn` com ela no contexto.
 * Sem conexão ativa → ConnectionNotConfiguredError ANTES de executar `fn`.
 */
export async function withLlmForOrganization<T>(
  organizationId: string,
  fn: () => Promise<T>
): Promise<T> {
  return runWithLlm(await resolveLlmForOrganization(organizationId), fn);
}

/** Contexto de LLM atual. Fora de withLlmForOrganization → ConnectionNotConfiguredError. */
export function getCurrentLlm(): LlmContext {
  const ctx = llmStorage.getStore();
  if (!ctx) throw new ConnectionNotConfiguredError('', 'llm', 'openai');
  return ctx;
}

/**
 * Registra os tokens consumidos na organização do contexto (unit `tokens`).
 * Nunca lança nem bloqueia a operação; sem contexto ou sem uso, não faz nada.
 */
export async function recordLlmUsage(usage: LlmUsage | undefined, operation: string): Promise<void> {
  try {
    const ctx = llmStorage.getStore();
    if (!ctx || !usage) return;
    const quantity =
      usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    await recordUsage({
      organizationId: ctx.organizationId,
      category: 'llm',
      provider: 'openai',
      operation,
      quantity,
      unit: 'tokens',
      connectionId: ctx.connectionId,
    });
  } catch {
    // registro de consumo nunca bloqueia a operação
  }
}
