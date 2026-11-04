/**
 * Prospecção pelas conexões da organização (Sprint 2b, Task 9).
 *
 * POST /api/prospecting/places substitui a edge function `prospection`:
 * organização e usuário vêm da sessão, a chave do Google Places vem da
 * conexão `prospecting/google_places`, a mensagem de abordagem usa a conexão
 * `llm` (sem ela, o modelo neutro) e o número do WhatsApp não é verificado
 * (whatsapp = telefone). Firecrawl e Apify também resolvem pela conexão.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { ConnectionNotConfiguredError } from '@/lib/connectors/types';
import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from './helpers/fake-supabase';
import { resetProviderCircuitsForTests } from '@/lib/utils/resilience';

const USER = '00000000-0000-0000-0000-00000000000a';
const ORG = '0a0a0a0a-0000-0000-0000-00000000000a';
const ROOT = path.resolve(__dirname, '../..');

const mocks = vi.hoisted(() => ({
  orgForUser: vi.fn(),
  resolveConnection: vi.fn(),
  recordUsage: vi.fn(async () => undefined),
  dbHandler: vi.fn(),
  calls: [] as unknown[],
  serviceCalls: [] as unknown[][],
  contactFindById: vi.fn(),
  contactFindCompany: vi.fn(),
  contactUpdate: vi.fn(),
  enrichmentCreate: vi.fn(),
  mapDomain: vi.fn(),
  extractContactInfo: vi.fn(),
}));

vi.mock('@/lib/supabase/server', async () => {
  const { createFakeSupabase: create } = await import('./helpers/fake-supabase');
  return {
    createClient: async () => {
      const fake = create((call) => mocks.dbHandler(call));
      mocks.calls = fake.calls;
      return { ...fake.client, auth: { getUser: async () => ({ data: { user: { id: USER } } }) } };
    },
  };
});
// service_role: só a leitura do último Lead-NNN global (prospected-leads.repository).
vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase: create } = await import('./helpers/fake-supabase');
  return {
    createClient: () => {
      const fake = create((call) => mocks.dbHandler(call));
      mocks.serviceCalls.push(fake.calls);
      return fake.client;
    },
  };
});
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }));
vi.mock('@/lib/auth/require-writer', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-writer')>()),
  requireWriter: async () => true,
}));
vi.mock('@/lib/connectors/org-context', () => ({ resolveOrganizationIdForUser: mocks.orgForUser }));
vi.mock('@/lib/connectors/resolve-connection', () => ({ resolveConnection: mocks.resolveConnection }));
vi.mock('@/lib/connectors/usage', () => ({ recordUsage: mocks.recordUsage }));
vi.mock('@/lib/repositories/contacts.repository', () => ({
  contactsRepository: {
    findById: mocks.contactFindById,
    findCompanyById: mocks.contactFindCompany,
    update: mocks.contactUpdate,
  },
}));
vi.mock('@/lib/repositories/enrichment-raw.repository', () => ({
  enrichmentRawRepository: { create: mocks.enrichmentCreate },
}));
vi.mock('@/lib/integrations/firecrawl-client', () => ({
  firecrawlClient: { mapDomain: mocks.mapDomain, extractContactInfo: mocks.extractContactInfo },
  filterCandidateContactPages: (links: Array<{ url: string }>) => links,
}));

import { POST as placesPost } from '../../app/api/prospecting/places/route';
import { POST as enrichPost } from '../../app/api/contacts/[id]/enrich/route';
import { POST as linkedinPost } from '../../app/api/prospecting/linkedin/search/route';
import { contactEnrichmentService } from '@/lib/services/contact-enrichment.service';

// ── Google Places falso ────────────────────────────────────────────────────

interface FakePlace {
  place_id: string;
  name: string;
  formatted_address: string;
  international_phone_number?: string;
  types?: string[];
}

const PLACE_A: FakePlace = {
  place_id: 'place-a',
  name: 'Padaria Alfa',
  formatted_address: 'Rua X, 10 - Boa Viagem, Recife - PE, 51000-000, Brasil',
  international_phone_number: '+55 81 99999-0001',
  types: ['bakery'],
};
const PLACE_B: FakePlace = {
  place_id: 'place-b',
  name: 'Padaria Beta',
  formatted_address: 'Rua Y, 20 - Casa Forte, Recife - PE, 52000-000, Brasil',
  international_phone_number: '+55 81 99999-0002',
  types: ['bakery'],
};

let googlePlaces: FakePlace[];
let googleStatus: string;
let llmResponse: () => Response;
let fetchSpy: ReturnType<typeof vi.spyOn>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function fetchUrls(): string[] {
  return fetchSpy.mock.calls.map((c) => String(c[0]));
}

// ── Banco falso (cliente da sessão) ────────────────────────────────────────

let existingIds: string[];
let lastLeadRef: string | null;
let insertResult: (lead: Record<string, unknown>) => FakeResult;

function uniqueViolation(constraint: string): FakeResult {
  return {
    data: null,
    error: { code: '23505', message: `duplicate key value violates unique constraint "${constraint}"` },
  };
}

function defaultDb(call: FakeCall): FakeResult | undefined {
  if (call.table !== 'leads_prospeccao') return undefined;
  if (call.op === 'select' && call.columns === 'lead') {
    return { data: lastLeadRef ? [{ lead: lastLeadRef }] : [], error: null };
  }
  if (call.op === 'select') {
    const ids = (filterValue(call, 'id', 'in') as string[] | undefined) ?? [];
    return { data: ids.filter((id) => existingIds.includes(id)).map((id) => ({ id })), error: null };
  }
  if (call.op === 'insert') return insertResult(call.payload as Record<string, unknown>);
  return undefined;
}

function serviceDbCalls(): FakeCall[] {
  return (mocks.serviceCalls as FakeCall[][]).flat();
}

function insertAttempts(): Array<Record<string, unknown>> {
  return dbCalls()
    .filter((c) => c.table === 'leads_prospeccao' && c.op === 'insert')
    .map((c) => c.payload as Record<string, unknown>);
}

function dbCalls(): FakeCall[] {
  return mocks.calls as FakeCall[];
}

function insertedLeads(): Array<Record<string, unknown>> {
  return insertAttempts().filter((lead) => insertResult(lead).error === null);
}

function post(body: unknown) {
  return new NextRequest('http://x/api/prospecting/places', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const NICHE_BODY = { niche: 'Padaria', location: { country: 'Brasil', state: 'PE', city: 'Recife' }, quantity: 10 };

const NEUTRAL_OPENINGS = ['Olá, ', 'Oi, '];

beforeEach(() => {
  vi.clearAllMocks();
  resetProviderCircuitsForTests();
  process.env.GOOGLE_PLACES_API_KEY = 'chave-google-do-env-proibida';
  process.env.FIRECRAWL_API_KEY = 'chave-firecrawl-do-env-proibida';
  process.env.APIFY_API_KEY = 'chave-apify-do-env-proibida';
  googlePlaces = [PLACE_A, PLACE_B];
  googleStatus = 'OK';
  existingIds = [];
  lastLeadRef = 'Lead-007';
  llmResponse = () =>
    json({ choices: [{ message: { content: 'Mensagem reescrita pela IA' } }], usage: { total_tokens: 42 } });
  mocks.serviceCalls.length = 0;
  insertResult = () => ({ data: null, error: null });
  mocks.dbHandler.mockImplementation(defaultDb);
  mocks.orgForUser.mockResolvedValue(ORG);
  mocks.resolveConnection.mockImplementation(async (orgId: string, category: string, provider?: string) => {
    if (category === 'prospecting' && provider === 'google_places') {
      return { id: 'conn-gp', organizationId: orgId, category, provider, credentialSource: 'own', config: {}, secret: { apiKey: 'gp-key-da-org' } };
    }
    if (category === 'prospecting' && provider === 'firecrawl') {
      return { id: 'conn-fc', organizationId: orgId, category, provider, credentialSource: 'own', config: {}, secret: { apiKey: 'fc-key-da-org' } };
    }
    if (category === 'llm') {
      return { id: 'conn-llm', organizationId: orgId, category, provider: 'openai', credentialSource: 'platform', config: {}, secret: { apiKey: 'llm-key-da-org' } };
    }
    throw new ConnectionNotConfiguredError(orgId, category as 'prospecting', provider as 'apify');
  });

  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/place/textsearch/json')) {
      return json({ status: googleStatus, results: googlePlaces.map((p) => ({ place_id: p.place_id, name: p.name })) });
    }
    if (url.includes('/place/findplacefromtext/json')) {
      return json({ status: googleStatus, candidates: googlePlaces.map((p) => ({ place_id: p.place_id, name: p.name })) });
    }
    if (url.includes('/place/details/json')) {
      const id = new URL(url).searchParams.get('place_id');
      const place = googlePlaces.find((p) => p.place_id === id);
      return json(place ? { status: 'OK', result: place } : { status: 'NOT_FOUND' });
    }
    if (url.includes('api.openai.com')) return llmResponse();
    throw new Error(`fetch inesperado: ${url}`);
  });
});

afterEach(() => {
  delete process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.FIRECRAWL_API_KEY;
  delete process.env.APIFY_API_KEY;
  fetchSpy.mockRestore();
});

describe('POST /api/prospecting/places', () => {
  it('busca por nicho insere leads com organização da sessão', async () => {
    const res = await placesPost(post({ ...NICHE_BODY, user_id: 'usuario-forjado' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { insertedCount: 2, recurrentCount: 0, total: 2, processedTotal: 2, failedProcessing: 0, failedInsertion: 0 },
      meta: {},
    });

    // Chave do Google vem da conexão da organização, nunca do env.
    expect(mocks.resolveConnection).toHaveBeenCalledWith(ORG, 'prospecting', 'google_places');
    const googleUrls = fetchUrls().filter((u) => u.includes('maps.googleapis.com'));
    expect(googleUrls.length).toBe(3);
    for (const u of googleUrls) expect(new URL(u).searchParams.get('key')).toBe('gp-key-da-org');
    expect(new URL(googleUrls[0]).searchParams.get('query')).toBe('Padaria em Recife, PE, Brasil');

    // Nenhuma verificação de número (Evolution/Meta) na prospecção.
    expect(fetchUrls().every((u) => u.includes('maps.googleapis.com') || u.includes('api.openai.com'))).toBe(true);

    const leads = insertedLeads();
    expect(leads).toHaveLength(2);
    expect(leads.map((l) => l.lead)).toEqual(['Lead-008', 'Lead-009']);
    for (const lead of leads) {
      expect(lead.organization_id).toBe(ORG);
      expect(lead.user_id).toBe(USER);
      expect(lead.whatsapp).toBe(lead.telefone);
      expect(lead.categoria).toBe('Padaria');
      expect(lead.cidade).toBe('Recife');
      expect(lead.status_msg_wa).toBe('not_sent');
      expect(lead.estagio_pipeline).toBe('Novo Lead');
    }
    expect(leads[0]).toMatchObject({ id: 'place-a', empresa: 'Padaria Alfa', telefone: '+55 81 99999-0001', bairro_regiao: 'Boa Viagem' });

    // Numeração Lead-NNN calculada dentro da organização.
    // `lead` é UNIQUE global: o último número vem da tabela inteira (service_role),
    // lendo só a coluna `lead`; a sessão não faz essa consulta.
    const lastLeadQuery = serviceDbCalls().find((c) => c.table === 'leads_prospeccao' && c.op === 'select');
    expect(lastLeadQuery?.columns).toBe('lead');
    expect(lastLeadQuery && filterValue(lastLeadQuery, 'organization_id')).toBeUndefined();
    expect(dbCalls().some((c) => c.columns === 'lead')).toBe(false);

    // Consumo: requests do Google e tokens da LLM na organização.
    expect(mocks.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, provider: 'google_places', operation: 'text_search', quantity: 1, unit: 'requests', connectionId: 'conn-gp' })
    );
    expect(mocks.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, provider: 'google_places', operation: 'place_details', quantity: 2, unit: 'requests' })
    );
    expect(mocks.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, provider: 'openai', unit: 'tokens', quantity: 42, connectionId: 'conn-llm' })
    );
    expect(leads[0].mensagem_whatsapp).toBe('Mensagem reescrita pela IA');
    const llmCall = fetchSpy.mock.calls.find((c) => String(c[0]).includes('api.openai.com'));
    expect(((llmCall?.[1] as RequestInit).headers as Record<string, string>).Authorization).toBe('Bearer llm-key-da-org');
  });

  it('busca por nome usa Find Place e limita a 1 resultado', async () => {
    googlePlaces = [PLACE_A];
    const res = await placesPost(post({ businessName: 'Padaria Alfa', location: '' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.insertedCount).toBe(1);
    expect(fetchUrls().some((u) => u.includes('/findplacefromtext/'))).toBe(true);
    expect(fetchUrls().some((u) => u.includes('/textsearch/'))).toBe(false);
  });

  it('lead já existente conta como recorrente', async () => {
    existingIds = ['place-a'];
    const res = await placesPost(post(NICHE_BODY));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      insertedCount: 1, recurrentCount: 1, total: 2, processedTotal: 2, failedProcessing: 0, failedInsertion: 0,
    });
    const leads = insertedLeads();
    expect(leads.map((l) => l.id)).toEqual(['place-b']);
    expect(leads[0].lead).toBe('Lead-008');
    // Só o lead novo gera mensagem com a LLM.
    expect(fetchUrls().filter((u) => u.includes('api.openai.com'))).toHaveLength(1);
  });

  it('filtra por bairros', async () => {
    const res = await placesPost(post({ ...NICHE_BODY, bairros: ['casa forte'] }));
    expect((await res.json()).data).toMatchObject({ insertedCount: 1, processedTotal: 1 });
    expect(insertedLeads().map((l) => l.id)).toEqual(['place-b']);
  });

  it('org sem google_places → 409', async () => {
    mocks.resolveConnection.mockRejectedValue(new ConnectionNotConfiguredError(ORG, 'prospecting', 'google_places'));
    const res = await placesPost(post(NICHE_BODY));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('PROSPECTING_SOURCE_NOT_CONFIGURED');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(insertedLeads()).toHaveLength(0);
  });

  it('usuário sem organização → 409 sem chamar provedores', async () => {
    mocks.orgForUser.mockResolvedValue(null);
    const res = await placesPost(post(NICHE_BODY));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('PROSPECTING_SOURCE_NOT_CONFIGURED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('quantity > 60 → 400', async () => {
    const res = await placesPost(post({ ...NICHE_BODY, quantity: 61 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sem nicho nem nome do estabelecimento → 400', async () => {
    const res = await placesPost(post({ location: 'Recife', quantity: 10 }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falha da LLM usa o modelo de mensagem sem quebrar a prospecção', async () => {
    llmResponse = () => json({ error: { message: 'boom' } }, 500);
    const res = await placesPost(post(NICHE_BODY));
    expect(res.status).toBe(200);
    expect((await res.json()).data.insertedCount).toBe(2);
    const leads = insertedLeads();
    for (const lead of leads) {
      const msg = String(lead.mensagem_whatsapp);
      expect(NEUTRAL_OPENINGS.some((o) => msg.startsWith(o))).toBe(true);
      expect(msg).toContain(String(lead.empresa));
      expect(msg).toContain('Padaria');
      expect(msg).toContain('Recife');
    }
  });

  it('organização sem conexão llm usa o modelo neutro e não chama a OpenAI', async () => {
    mocks.resolveConnection.mockImplementation(async (orgId: string, category: string, provider?: string) => {
      if (category === 'prospecting' && provider === 'google_places') {
        return { id: 'conn-gp', organizationId: orgId, category, provider, credentialSource: 'own', config: {}, secret: { apiKey: 'gp-key-da-org' } };
      }
      throw new ConnectionNotConfiguredError(orgId, category as 'llm');
    });
    const res = await placesPost(post(NICHE_BODY));
    expect(res.status).toBe(200);
    expect(fetchUrls().some((u) => u.includes('api.openai.com'))).toBe(false);
    for (const lead of insertedLeads()) {
      expect(NEUTRAL_OPENINGS.some((o) => String(lead.mensagem_whatsapp).startsWith(o))).toBe(true);
    }
  });

  it('erro do Google → 502 sem detalhes internos', async () => {
    googleStatus = 'REQUEST_DENIED';
    const res = await placesPost(post(NICHE_BODY));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('PROSPECTING_PROVIDER_ERROR');
    expect(JSON.stringify(body)).not.toContain('REQUEST_DENIED');
    expect(insertedLeads()).toHaveLength(0);
  });

  it('erro inesperado → 500 sem stack nem mensagem interna', async () => {
    mocks.dbHandler.mockImplementation(() => {
      throw new Error('segredo-interno');
    });
    const res = await placesPost(post(NICHE_BODY));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('segredo-interno');
    expect(text).toContain('INTERNAL_ERROR');
  });

  it('falha no detalhe de um lugar conta como falha de processamento', async () => {
    googlePlaces = [PLACE_A, PLACE_B];
    const original = fetchSpy.getMockImplementation();
    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/place/details/json') && url.includes('place-b')) return json({ status: 'NOT_FOUND' });
      return original!(input, init);
    });
    const res = await placesPost(post(NICHE_BODY));
    expect((await res.json()).data).toMatchObject({ insertedCount: 1, failedProcessing: 1 });
  });

  it('conflito no número do lead (UNIQUE global) avança o número e grava o lote', async () => {
    // Outra prospecção simultânea já gravou Lead-008 e Lead-009.
    const taken = new Set(['Lead-008', 'Lead-009']);
    insertResult = (lead) => (taken.has(String(lead.lead)) ? uniqueViolation('leads_prospeccao_lead_key') : { data: null, error: null });
    const res = await placesPost(post(NICHE_BODY));
    expect((await res.json()).data).toMatchObject({ insertedCount: 2, failedInsertion: 0 });
    expect(insertAttempts().map((l) => [l.id, l.lead])).toEqual([
      ['place-a', 'Lead-008'],
      ['place-a', 'Lead-009'],
      ['place-a', 'Lead-010'],
      ['place-b', 'Lead-011'],
    ]);
    expect(insertedLeads().map((l) => l.lead)).toEqual(['Lead-010', 'Lead-011']);
  });

  it('conflito no meio do lote não faz os seguintes repetirem um número que colidiu', async () => {
    googlePlaces = [PLACE_A, PLACE_B, { ...PLACE_B, place_id: 'place-c', name: 'Padaria Gama', international_phone_number: '+55 81 99999-0003' }];
    // Lead-009 foi gravado por outra prospecção entre a leitura do número e o 2º insert.
    insertResult = (lead) => (lead.lead === 'Lead-009' ? uniqueViolation('leads_prospeccao_lead_key') : { data: null, error: null });
    const res = await placesPost(post(NICHE_BODY));
    expect((await res.json()).data).toMatchObject({ insertedCount: 3, failedInsertion: 0 });
    expect(insertedLeads().map((l) => [l.id, l.lead])).toEqual([
      ['place-a', 'Lead-008'],
      ['place-b', 'Lead-010'],
      ['place-c', 'Lead-011'],
    ]);
  });

  it('número do lead esgota após 5 tentativas → falha de inserção sem repetir números', async () => {
    insertResult = (lead) => (lead.id === 'place-a' ? uniqueViolation('leads_prospeccao_lead_key') : { data: null, error: null });
    const res = await placesPost(post(NICHE_BODY));
    expect((await res.json()).data).toMatchObject({ insertedCount: 1, failedInsertion: 1 });
    const numbers = insertAttempts().map((l) => l.lead);
    expect(numbers).toEqual(['Lead-008', 'Lead-009', 'Lead-010', 'Lead-011', 'Lead-012', 'Lead-013']);
    expect(insertedLeads().map((l) => [l.id, l.lead])).toEqual([['place-b', 'Lead-013']]);
  });

  it('conflito no whatsapp (UNIQUE global) regrava o lead com whatsapp null e mantém o telefone', async () => {
    insertResult = (lead) =>
      lead.id === 'place-a' && lead.whatsapp ? uniqueViolation('idx_leads_whatsapp_unique') : { data: null, error: null };
    const res = await placesPost(post(NICHE_BODY));
    expect((await res.json()).data).toMatchObject({ insertedCount: 2, failedInsertion: 0 });
    const saved = insertedLeads().find((l) => l.id === 'place-a');
    expect(saved).toMatchObject({ whatsapp: null, telefone: '+55 81 99999-0001', lead: 'Lead-008' });
    expect(insertedLeads().find((l) => l.id === 'place-b')).toMatchObject({ lead: 'Lead-009' });
  });

  it('erro genérico de inserção → failedInsertion com só o código no log', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    insertResult = (lead) =>
      lead.id === 'place-a' ? { data: null, error: { code: '42501', message: 'new row violates row-level security policy Padaria Alfa' } } : { data: null, error: null };
    const res = await placesPost(post(NICHE_BODY));
    expect((await res.json()).data).toMatchObject({ insertedCount: 1, failedInsertion: 1 });
    // O número não consumido é reaproveitado pelo próximo lead (nenhum conflito nele).
    expect(insertedLeads().map((l) => [l.id, l.lead])).toEqual([['place-b', 'Lead-008']]);
    const logged = JSON.stringify(errSpy.mock.calls);
    expect(logged).toContain('42501');
    expect(logged).not.toContain('Padaria Alfa');
    expect(logged).not.toContain('99999');
    errSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('logs não trazem telefone, endereço nem nome da empresa', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    for (const s of spies) s.mockImplementation(() => undefined);
    await placesPost(post(NICHE_BODY));
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    for (const s of spies) s.mockRestore();
    expect(logged).not.toContain('99999');
    expect(logged).not.toContain('Padaria Alfa');
    expect(logged).not.toContain('Rua X');
  });
});

describe('Firecrawl e Apify pela conexão da organização', () => {
  const CONTACT = { id: 'c1', email: null, phone: null, company_id: 'co1' };

  beforeEach(() => {
    mocks.contactFindById.mockResolvedValue(CONTACT);
    mocks.contactFindCompany.mockResolvedValue({ id: 'co1', domain: 'empresa.com.br' });
    mocks.mapDomain.mockResolvedValue([{ url: 'https://empresa.com.br/contato' }]);
    mocks.extractContactInfo.mockResolvedValue({ email: 'contato@empresa.com.br', phone: null });
    mocks.contactUpdate.mockImplementation(async () => ({ ...CONTACT, email: 'contato@empresa.com.br' }));
  });

  it('firecrawl usa conexão da org', async () => {
    const result = await contactEnrichmentService.enrichFromCompanyWebsite('c1', USER);
    expect(result?.emailFound).toBe(true);
    expect(mocks.orgForUser).toHaveBeenCalledWith(USER);
    expect(mocks.resolveConnection).toHaveBeenCalledWith(ORG, 'prospecting', 'firecrawl');
    expect(mocks.mapDomain).toHaveBeenCalledWith('fc-key-da-org', 'empresa.com.br');
    expect(mocks.extractContactInfo).toHaveBeenCalledWith('fc-key-da-org', 'https://empresa.com.br/contato');
    expect(mocks.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, provider: 'firecrawl', unit: 'pages', quantity: 1, connectionId: 'conn-fc' })
    );
  });

  it('org sem firecrawl → 409 PROSPECTING_SOURCE_NOT_CONFIGURED', async () => {
    mocks.resolveConnection.mockRejectedValue(new ConnectionNotConfiguredError(ORG, 'prospecting', 'firecrawl'));
    const res = await enrichPost(new NextRequest('http://x', { method: 'POST' }), { params: { id: 'c1' } });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('PROSPECTING_SOURCE_NOT_CONFIGURED');
    expect(mocks.mapDomain).not.toHaveBeenCalled();
  });

  it('org sem apify → 409 PROSPECTING_SOURCE_NOT_CONFIGURED na busca do LinkedIn', async () => {
    const res = await linkedinPost(
      new NextRequest('http://x', {
        method: 'POST',
        body: JSON.stringify({ searchQuery: 'diretor comercial', maxItems: 10 }),
        headers: { 'content-type': 'application/json' },
      })
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('PROSPECTING_SOURCE_NOT_CONFIGURED');
    expect(mocks.resolveConnection).toHaveBeenCalledWith(ORG, 'prospecting', 'apify');
  });
});

describe('edge function e gateway Lovable aposentados', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  }

  it('código-fonte da edge function e o serviço de chaves por env foram removidos', () => {
    expect(existsSync(path.join(ROOT, 'supabase/functions/prospection'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'src/lib/services/api-keys.service.ts'))).toBe(false);
  });

  it('app e src não chamam a edge function, o gateway Lovable nem chaves de prospecção do env', () => {
    const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'app'))].filter((f) => /\.(ts|tsx)$/.test(f));
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return (
        /functions\.invoke\(\s*['"]prospection['"]/.test(src) ||
        src.includes('ai.gateway.lovable.dev') ||
        src.includes('LOVABLE_API_KEY') ||
        /process\.env\.(GOOGLE_PLACES_API_KEY|FIRECRAWL_API_KEY|APIFY_API_KEY)/.test(src)
      );
    });
    expect(offenders).toEqual([]);
  });
});
