/**
 * WhatsApp por organização: factory, adaptadores sem env e registro de consumo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({
  resolveConnection: vi.fn(),
  recordUsage: vi.fn(async () => undefined),
}));

vi.mock('@/lib/connectors/resolve-connection', () => ({
  resolveConnection: mocks.resolveConnection,
}));
vi.mock('@/lib/connectors/usage', () => ({ recordUsage: mocks.recordUsage }));

import { getWhatsAppForOrganization } from '@/lib/integrations/whatsapp/org-whatsapp';
import { EvolutionProvider } from '@/lib/integrations/whatsapp/providers/evolution.provider';
import { MetaCloudProvider } from '@/lib/integrations/whatsapp/providers/meta-cloud.provider';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';

const ORG = '11111111-1111-1111-1111-111111111111';

const metaConn = {
  id: 'conn-meta',
  organizationId: ORG,
  category: 'whatsapp',
  provider: 'meta_cloud',
  credentialSource: 'own',
  config: { phoneNumberId: '555000111', apiVersion: 'v20.0' },
  secret: { accessToken: 'tok', appSecret: 'sec', verifyToken: 'ver' },
};
const evoConn = {
  id: 'conn-evo',
  organizationId: ORG,
  category: 'whatsapp',
  provider: 'evolution',
  credentialSource: 'own',
  config: { baseUrl: 'https://evo.example.com', instanceName: 'inst-a' },
  secret: { apiKey: 'k' },
};

beforeEach(() => {
  mocks.resolveConnection.mockReset();
  mocks.recordUsage.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('getWhatsAppForOrganization', () => {
  it('org com meta ativa → MetaCloudProvider com target = phoneNumberId', async () => {
    mocks.resolveConnection.mockResolvedValue(metaConn);
    const r = await getWhatsAppForOrganization(ORG);
    expect(r.provider).toBeInstanceOf(MetaCloudProvider);
    expect(r.target).toBe('555000111');
    expect(r.connectionId).toBe('conn-meta');
    expect(r.organizationId).toBe(ORG);
    expect(mocks.resolveConnection).toHaveBeenCalledWith(ORG, 'whatsapp');
  });

  it('org com evolution ativa → EvolutionProvider com target = instanceName', async () => {
    mocks.resolveConnection.mockResolvedValue(evoConn);
    const r = await getWhatsAppForOrganization(ORG);
    expect(r.provider).toBeInstanceOf(EvolutionProvider);
    expect(r.target).toBe('inst-a');
    expect(r.connectionId).toBe('conn-evo');
  });

  it('org sem conexão → ConnectionNotConfiguredError', async () => {
    mocks.resolveConnection.mockRejectedValue(new ConnectionNotConfiguredError(ORG, 'whatsapp'));
    await expect(getWhatsAppForOrganization(ORG)).rejects.toBeInstanceOf(ConnectionNotConfiguredError);
  });
});

describe('provedores sem process.env', () => {
  it('o código dos provedores e da factory não referencia process.env', () => {
    for (const f of [
      'providers/evolution.provider.ts',
      'providers/meta-cloud.provider.ts',
      'org-whatsapp.ts',
    ]) {
      const src = readFileSync(resolve(__dirname, '../../src/lib/integrations/whatsapp', f), 'utf8');
      expect(src, f).not.toMatch(/process\.env/);
    }
  });

  it('envio funciona com env que lança para EVOLUTION_* / META_WA_*', async () => {
    const realEnv = process.env;
    const guarded = new Proxy(realEnv, {
      get(target, prop) {
        if (typeof prop === 'string' && /^(EVOLUTION_|META_WA_)/.test(prop)) {
          throw new Error(`leitura proibida de ${prop}`);
        }
        return Reflect.get(target, prop);
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ key: { id: 'm1' }, messages: [{ id: 'm1' }] }), { status: 200 }))
    );
    process.env = guarded;
    try {
      const evo = new EvolutionProvider({ baseUrl: 'https://evo.example.com', apiKey: 'k' });
      const meta = new MetaCloudProvider({
        accessToken: 't',
        phoneNumberId: '1',
        apiVersion: 'v20.0',
        appSecret: 's',
        verifyToken: 'v',
      });
      expect((await evo.sendText('inst', '5581999999999', 'oi')).success).toBe(true);
      expect((await meta.sendText('1', '5581999999999', 'oi')).success).toBe(true);
    } finally {
      process.env = realEnv;
    }
  });
});

describe('registro de consumo', () => {
  it('envio bem-sucedido (evolution) registra send_text em messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ key: { id: 'm1' } }), { status: 200 }))
    );
    mocks.resolveConnection.mockResolvedValue(evoConn);
    const { provider, target } = await getWhatsAppForOrganization(ORG);
    const res = await provider.sendText(target, '5581999999999', 'oi');
    expect(res.success).toBe(true);
    expect(mocks.recordUsage).toHaveBeenCalledWith({
      organizationId: ORG,
      connectionId: 'conn-evo',
      category: 'whatsapp',
      provider: 'evolution',
      operation: 'send_text',
      quantity: 1,
      unit: 'messages',
    });
  });

  it('envio de mídia (meta) registra send_media', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'w1' }] }), { status: 200 }))
    );
    mocks.resolveConnection.mockResolvedValue(metaConn);
    const { provider, target } = await getWhatsAppForOrganization(ORG);
    const res = await provider.sendMedia(target, '5581999999999', { type: 'image', url: 'https://x.test/a.jpg' });
    expect(res.success).toBe(true);
    expect(mocks.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'meta_cloud', operation: 'send_media', unit: 'messages' })
    );
  });

  it('envio com falha não registra consumo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('erro', { status: 400 })));
    mocks.resolveConnection.mockResolvedValue(evoConn);
    const { provider, target } = await getWhatsAppForOrganization(ORG);
    const res = await provider.sendText(target, '5581999999999', 'oi');
    expect(res.success).toBe(false);
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });
});
