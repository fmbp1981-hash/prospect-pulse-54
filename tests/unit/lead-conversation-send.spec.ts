/**
 * Workflow de conversa — a resposta do agente (e o download de mídia) sai pela
 * conexão de WhatsApp da organização do lead (Sprint 2b, Task 5), nunca pela
 * instância do payload nem por variável de ambiente. Sem conexão: a mensagem
 * do lead é salva, o agente não roda e nada é enviado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OrgWhatsApp } from '@/lib/integrations/whatsapp/org-whatsapp';
import type { NormalizedMessage } from '@/lib/services/message-normalizer.service';
import type { TenantContext } from '@/lib/services/tenant-resolver.service';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';

const USER_A = '00000000-0000-0000-0000-00000000000a';
const ORG_A = '0a0a0a0a-0000-0000-0000-00000000000a';
const ORG_SEM_WA = '0c0c0c0c-0000-0000-0000-00000000000c';

const mocks = vi.hoisted(() => ({
  findOrCreate: vi.fn(),
  saveLeadMessage: vi.fn(async () => undefined),
  saveAgentResponse: vi.fn(async () => undefined),
  executeAIAgent: vi.fn(),
  leadUpdate: vi.fn(async () => ({})),
  findOrgForUser: vi.fn(),
  sendMessageSequence: vi.fn(),
  markAsRead: vi.fn(async () => undefined),
  sendTyping: vi.fn(async () => undefined),
}));

vi.mock('@/lib/services/lead.service', () => ({
  leadService: {
    findOrCreate: mocks.findOrCreate,
    isInHumanMode: () => false,
    shouldAutoResumeBot: () => false,
    returnToBot: vi.fn(),
  },
}));
vi.mock('@/lib/repositories/conversation.repository', () => ({
  conversationRepository: { saveLeadMessage: mocks.saveLeadMessage, saveAgentResponse: mocks.saveAgentResponse },
}));
vi.mock('@/lib/services/agent-context-builder.service', () => ({ buildAgentContext: async () => ({}) }));
vi.mock('@/lib/ai/ai-agent.service', () => ({ executeAIAgent: mocks.executeAIAgent }));
vi.mock('@/lib/services/message-humanizer.service', () => ({ humanizeResponse: async (m: string) => [m] }));
vi.mock('@/lib/repositories/lead.repository', () => ({
  leadRepository: {
    update: mocks.leadUpdate,
    findByWhatsApp: vi.fn(),
    findRecentProspectionTarget: vi.fn(async () => null),
  },
}));
vi.mock('@/lib/repositories/connections.repository', () => ({
  connectionsRepository: { findOrganizationIdForUser: mocks.findOrgForUser },
}));
vi.mock('@/lib/ai/openai-key-context', () => ({
  withOpenAIKey: (_k: string, fn: () => unknown) => fn(),
}));

import { runLeadConversationWorkflow } from '@/lib/workflows/lead-conversation.workflow';
import { setWhatsAppProviderFactoryForTests } from '@/lib/integrations/whatsapp/org-whatsapp';

const factory = vi.fn(async (orgId: string): Promise<OrgWhatsApp> => {
  if (orgId === ORG_A) {
    return {
      provider: {
        sendMessageSequence: mocks.sendMessageSequence,
        markAsRead: mocks.markAsRead,
        sendTyping: mocks.sendTyping,
      } as unknown as OrgWhatsApp['provider'],
      target: 'inst-da-conexao',
      connectionId: 'conn-a',
      organizationId: ORG_A,
    };
  }
  throw new ConnectionNotConfiguredError(orgId, 'whatsapp');
});

const TENANT: TenantContext = {
  userId: USER_A,
  companyName: 'Org A',
  instanceName: 'inst-do-user-settings',
  agentEnabled: true,
  openaiApiKey: 'sk-test',
};

const MSG = {
  clienteNome: 'Fulano',
  clienteWhatsApp: '+5581999990001',
  clienteTelefone: '+5581999990001',
  mensagem: 'oi',
  messageType: 'text',
  instanceName: 'inst-do-payload',
  messageId: 'msg-1',
  timestamp: new Date().toISOString(),
  fromMe: false,
  isAutomatedMessage: false,
  isBusinessAccount: false,
} as unknown as NormalizedMessage;

let logSpies: Array<ReturnType<typeof vi.spyOn>> = [];

beforeEach(() => {
  vi.clearAllMocks();
  setWhatsAppProviderFactoryForTests(factory);
  mocks.findOrCreate.mockResolvedValue({
    lead: { id: 'lead-1', organization_id: ORG_A, user_id: USER_A, estagio_pipeline: 'Contato Inicial' },
    isNew: false,
  });
  mocks.executeAIAgent.mockResolvedValue({ output: 'Olá! Como posso ajudar?', toolCalls: [], iterations: 1 });
  mocks.sendMessageSequence.mockResolvedValue({ sent: 1, failed: 0, errors: [] });
  mocks.findOrgForUser.mockResolvedValue(ORG_A);
  logSpies = [
    vi.spyOn(console, 'log').mockImplementation(() => undefined),
    vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    vi.spyOn(console, 'error').mockImplementation(() => undefined),
  ];
});
afterEach(() => {
  setWhatsAppProviderFactoryForTests(null);
  for (const s of logSpies) s.mockRestore();
});

describe('runLeadConversationWorkflow — envio pela conexão da organização', () => {
  it('responde pela conexão da organização do lead (alvo da conexão, não a instância do payload)', async () => {
    await runLeadConversationWorkflow(MSG, TENANT);
    expect(factory).toHaveBeenCalledWith(ORG_A);
    expect(mocks.sendMessageSequence).toHaveBeenCalledWith(
      'inst-da-conexao',
      '+5581999990001',
      ['Olá! Como posso ajudar?'],
      3000
    );
    expect(mocks.saveAgentResponse).toHaveBeenCalled();
  });

  it('lead com organization_id nulo → usa a organização do dono', async () => {
    mocks.findOrCreate.mockResolvedValue({
      lead: { id: 'ORG-1', organization_id: null, user_id: USER_A, estagio_pipeline: 'Novo Lead' },
      isNew: true,
    });
    await runLeadConversationWorkflow(MSG, TENANT);
    expect(mocks.findOrgForUser).toHaveBeenCalledWith(USER_A);
    expect(mocks.sendMessageSequence).toHaveBeenCalledTimes(1);
  });

  it('organização sem conexão → salva a mensagem do lead, não roda o agente nem envia; log sem telefone', async () => {
    mocks.findOrCreate.mockResolvedValue({
      lead: { id: 'lead-1', organization_id: ORG_SEM_WA, user_id: USER_A },
      isNew: false,
    });
    await runLeadConversationWorkflow(MSG, TENANT);
    expect(mocks.saveLeadMessage).toHaveBeenCalled();
    expect(mocks.executeAIAgent).not.toHaveBeenCalled();
    expect(mocks.sendMessageSequence).not.toHaveBeenCalled();
    const out = JSON.stringify(logSpies.flatMap((s) => s.mock.calls));
    expect(out).toContain('whatsapp_not_configured');
    expect(out).toContain(ORG_SEM_WA);
    expect(out).not.toContain('99999');
  });
});
