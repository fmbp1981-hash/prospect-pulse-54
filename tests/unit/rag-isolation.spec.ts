/**
 * F-05 (High) — deleteDocument apagava os chunks de QUALQUER documento pelo id
 * (sem tenant), mesmo quando o soft delete filtrado por user_id não achava nada.
 * F-16 — POST /api/agent/rag aceitava agentConfigId de outro tenant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_B = '00000000-0000-0000-0000-00000000000b';
const DOC_A = '20000000-0000-0000-0000-00000000000a';
const DOC_B = '20000000-0000-0000-0000-00000000000b';
const CFG_A = '30000000-0000-0000-0000-00000000000a';
const CFG_B = '30000000-0000-0000-0000-00000000000b';

const docOwner: Record<string, string> = { [DOC_A]: USER_A, [DOC_B]: USER_B };
const cfgOwner: Record<string, string> = { [CFG_A]: USER_A, [CFG_B]: USER_B };

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table === 'rag_documents' && call.op === 'update') {
    const id = filterValue(call, 'id') as string;
    const uid = filterValue(call, 'user_id') as string;
    const hit = docOwner[id] && docOwner[id] === uid;
    if (call.returning) return { data: hit ? [{ id }] : [], error: null };
    return { data: null, error: null };
  }
  if (call.table === 'agent_configs') {
    const id = filterValue(call, 'id') as string;
    const uid = filterValue(call, 'user_id') as string;
    return { data: cfgOwner[id] === uid ? { id } : null, error: null };
  }
  return undefined;
}

const fake = createFakeSupabase(handler);
let currentUser: { id: string } | null = { id: USER_A };

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }));
// ingestDocument real não roda aqui (chunking/embeddings fora do escopo do
// teste): só registra a chamada. O resto do serviço é o código real.
const { ingestDocument } = vi.hoisted(() => ({
  ingestDocument: vi.fn(async () => ({ documentId: 'doc-novo', chunksCreated: 1 })),
}));
vi.mock('@/lib/ai/rag/rag.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/rag/rag.service')>();
  return { ...actual, ingestDocument };
});

import { deleteDocument } from '@/lib/ai/rag/rag.service';
import { DELETE as ragDelete, POST as ragPost } from '../../app/api/agent/rag/route';

const chunkDeletes = () => fake.calls.filter((c) => c.table === 'rag_document_chunks' && c.op === 'delete');

beforeEach(() => {
  fake.calls.length = 0;
  ingestDocument.mockClear();
  currentUser = { id: USER_A };
});

describe('F-05 — deleteDocument', () => {
  it('documento de outro tenant: não apaga nenhum chunk e devolve false', async () => {
    const result = await deleteDocument(DOC_B, USER_A);
    expect(result).toBe(false);
    expect(chunkDeletes()).toHaveLength(0);
  });

  it('documento próprio: apaga chunks filtrando document_id E user_id', async () => {
    const result = await deleteDocument(DOC_A, USER_A);
    expect(result).toBe(true);
    const del = chunkDeletes();
    expect(del).toHaveLength(1);
    expect(filterValue(del[0], 'document_id')).toBe(DOC_A);
    expect(filterValue(del[0], 'user_id')).toBe(USER_A);
  });

  it('DELETE /api/agent/rag com id de outro tenant → 404 e chunks intactos', async () => {
    const res = await ragDelete(new NextRequest(`http://x/api/agent/rag?id=${DOC_B}`, { method: 'DELETE' }));
    expect(res.status).toBe(404);
    expect(chunkDeletes()).toHaveLength(0);
  });

  it('DELETE /api/agent/rag do próprio documento → 200', async () => {
    const res = await ragDelete(new NextRequest(`http://x/api/agent/rag?id=${DOC_A}`, { method: 'DELETE' }));
    expect(res.status).toBe(200);
  });
});

function postJson(body: unknown) {
  return new NextRequest('http://x/api/agent/rag', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const CONTENT = 'Conteúdo de teste para a base de conhecimento.';

describe('F-16 — POST /api/agent/rag com agentConfigId', () => {
  it('agentConfigId de outro tenant → 403 e nenhum documento gravado', async () => {
    const res = await ragPost(postJson({ content: CONTENT, agentConfigId: CFG_B }));
    expect(res.status).toBe(403);
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  it('agentConfigId que não é uuid → 400 e nenhum documento gravado', async () => {
    const res = await ragPost(postJson({ content: CONTENT, agentConfigId: "x' or 1=1" }));
    expect(res.status).toBe(400);
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  it('agentConfigId próprio → 201', async () => {
    const res = await ragPost(postJson({ content: CONTENT, agentConfigId: CFG_A }));
    expect(res.status).toBe(201);
    expect(ingestDocument).toHaveBeenCalledWith(USER_A, CFG_A, expect.any(String), CONTENT, 'text/plain');
  });

  it('sem agentConfigId continua funcionando (config padrão)', async () => {
    const res = await ragPost(postJson({ content: CONTENT }));
    expect(res.status).toBe(201);
    expect(fake.calls.some((c) => c.table === 'agent_configs')).toBe(false);
  });
});
