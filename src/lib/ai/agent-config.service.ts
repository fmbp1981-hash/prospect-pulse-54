/**
 * AGENT CONFIG SERVICE
 * Gerencia configurações do agente por tenant: system prompt, modelo, temperatura.
 * Permite edição via API sem redeploy.
 */

import { createClient } from '@supabase/supabase-js';
import { SYSTEM_PROMPT_V3_4, SYSTEM_PROMPT_VERSION } from './prompts/system-prompt.v3.4';

export interface AgentConfig {
  id: string;
  userId: string;
  name: string;
  systemPrompt: string;
  promptVersion: string;
  model: string;
  temperature: number;
  maxIterations: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Duck-typed to accept both @supabase/supabase-js and @supabase/ssr clients
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = { from: (table: string) => any };

function getServiceClient(): DbClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const agentConfigService = {
  /**
   * Retorna a configuração ativa do agente para um tenant.
   * Sempre usa service client (chamado por webhooks sem contexto de usuário).
   * Se não existir, usa o default (system prompt v3.4).
   */
  async getActive(userId: string): Promise<AgentConfig> {
    const supabase = getServiceClient();

    const { data } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      return {
        id: data.id,
        userId: data.user_id,
        name: data.name,
        systemPrompt: data.system_prompt,
        promptVersion: data.prompt_version,
        model: data.model || 'gpt-4.1',
        temperature: data.temperature ?? 0.7,
        maxIterations: data.max_iterations ?? 5,
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }

    // Default: usa o sistema padrão
    return {
      id: 'default',
      userId,
      name: 'Agente XPAG Padrão',
      systemPrompt: SYSTEM_PROMPT_V3_4,
      promptVersion: SYSTEM_PROMPT_VERSION,
      model: 'gpt-4.1',
      temperature: 0.7,
      maxIterations: 5,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },

  /**
   * Lista todas as configurações de um tenant (histórico de versões).
   * Aceita client autenticado do caller (API route) ou usa service client.
   */
  async list(userId: string, client?: DbClient): Promise<AgentConfig[]> {
    const supabase = client ?? getServiceClient();
    const { data, error } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  },

  /**
   * Cria ou atualiza configuração do agente.
   * Ao ativar uma nova config, desativa as anteriores.
   */
  async upsert(
    userId: string,
    config: Partial<Omit<AgentConfig, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>,
    activate = true,
    client?: DbClient
  ): Promise<AgentConfig> {
    const supabase = client ?? getServiceClient();

    if (activate) {
      // Desativa configs anteriores
      await supabase
        .from('agent_configs')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('is_active', true);
    }

    const { data, error } = await supabase
      .from('agent_configs')
      .insert({
        user_id: userId,
        name: config.name || 'Prompt personalizado',
        system_prompt: config.systemPrompt || SYSTEM_PROMPT_V3_4,
        prompt_version: config.promptVersion || 'custom',
        model: config.model || 'gpt-4.1',
        temperature: config.temperature ?? 0.7,
        max_iterations: config.maxIterations ?? 5,
        is_active: activate,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapRow(data);
  },

  /**
   * Ativa uma configuração específica pelo ID.
   */
  async activate(id: string, userId: string, client?: DbClient): Promise<void> {
    const supabase = client ?? getServiceClient();

    await supabase
      .from('agent_configs')
      .update({ is_active: false })
      .eq('user_id', userId);

    await supabase
      .from('agent_configs')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
  },

  /**
   * Reseta para o prompt padrão do sistema.
   */
  async resetToDefault(userId: string, client?: DbClient): Promise<AgentConfig> {
    return this.upsert(userId, {
      name: `Agente XPAG v${SYSTEM_PROMPT_VERSION} (reset)`,
      systemPrompt: SYSTEM_PROMPT_V3_4,
      promptVersion: SYSTEM_PROMPT_VERSION,
    }, true, client);
  },
};

function mapRow(data: Record<string, unknown>): AgentConfig {
  return {
    id: data.id as string,
    userId: data.user_id as string,
    name: data.name as string,
    systemPrompt: data.system_prompt as string,
    promptVersion: data.prompt_version as string,
    model: (data.model as string) || 'gpt-4.1',
    temperature: (data.temperature as number) ?? 0.7,
    maxIterations: (data.max_iterations as number) ?? 5,
    isActive: data.is_active as boolean,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}
