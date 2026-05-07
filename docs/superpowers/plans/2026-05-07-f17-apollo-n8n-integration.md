# F17 — Integração Apollo via n8n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o usuário exporte um CSV do Apollo.io, salve em uma pasta do Google Drive e os leads sejam automaticamente normalizados e importados para o LeadFinder Pro via workflow n8n — sem nenhuma ação manual adicional.

**Architecture:** Um endpoint `/api/leads/import/webhook` aceita requisições autenticadas por API key (header `x-api-key`) em vez de sessão de cookie, permitindo que o n8n chame o LeadFinder como serviço. As chaves são geradas pelo próprio usuário em Settings, armazenadas como hash SHA-256 na tabela `webhook_keys`. A lógica central de importação é extraída para `src/lib/import/import-service.ts` e reutilizada por ambos os endpoints.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + RLS), Node.js `crypto` (built-in), Vitest, n8n (Google Drive Trigger + HTTP Request + Code node), Zod.

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260507_webhook_keys.sql` | Criar | Tabela + RLS + índices |
| `src/lib/import/import-service.ts` | Criar | Lógica central de importação (extraída do route) |
| `app/api/leads/import/route.ts` | Modificar | Delegar para import-service |
| `app/api/leads/import/webhook/route.ts` | Criar | Endpoint autenticado por API key |
| `app/api/webhook-keys/route.ts` | Criar | GET lista + POST cria chave |
| `app/api/webhook-keys/[id]/route.ts` | Criar | DELETE revoga chave |
| `src/components/settings/WebhookKeysPanel.tsx` | Criar | UI de gerenciamento de chaves |
| `app/(protected)/settings/page.tsx` | Modificar | Adicionar WebhookKeysPanel |
| `docs/n8n/apollo-leadfinder-workflow.json` | Criar | Template do workflow n8n |
| `tests/unit/import-service.spec.ts` | Criar | Testes da lógica de importação |
| `tests/unit/webhook-key.spec.ts` | Criar | Testes de geração e hash de chave |

---

## Task 1: Migration — Tabela `webhook_keys`

**Files:**
- Create: `supabase/migrations/20260507_webhook_keys.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- supabase/migrations/20260507_webhook_keys.sql

CREATE TABLE IF NOT EXISTS webhook_keys (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        text        NOT NULL,
  key_hash    text        NOT NULL UNIQUE,
  last_used_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE webhook_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own webhook keys"
  ON webhook_keys FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- índice para lookup rápido por hash (chamado a cada request do n8n)
CREATE INDEX webhook_keys_hash_idx ON webhook_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX webhook_keys_user_idx ON webhook_keys(user_id);
```

- [ ] **Step 2: Aplicar a migration via Supabase CLI**

```bash
npx supabase db push
```

Esperado: `Applying migration 20260507_webhook_keys.sql... done`

Se não tiver CLI configurado, executar o SQL diretamente no Supabase Dashboard → SQL Editor.

- [ ] **Step 3: Verificar a tabela no Dashboard**

Navegar em Supabase → Table Editor → confirmar que `webhook_keys` aparece com as colunas corretas e RLS ativo.

---

## Task 2: Import Service — Extrair lógica central

**Files:**
- Create: `src/lib/import/import-service.ts`
- Modify: `app/api/leads/import/route.ts`

- [ ] **Step 1: Criar `src/lib/import/import-service.ts`**

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { Database } from '@/integrations/supabase/types';
import type { NormalizedLead, ImportReport, ImportResultRow } from '@/lib/import/types';

export interface ImportOptions {
  defaultEstagio?: string;
  defaultOrigem?: string;
}

async function getNextLeadSequence(db: SupabaseClient<Database>, userId: string): Promise<number> {
  const { data } = await db
    .from('leads_prospeccao')
    .select('lead')
    .eq('user_id', userId)
    .like('lead', 'Lead-%')
    .order('created_at', { ascending: false })
    .limit(200);

  if (!data || data.length === 0) return 1;

  let max = 0;
  for (const row of data) {
    const match = (row.lead as string)?.match(/^Lead-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

function formatLeadNumber(seq: number): string {
  return `Lead-${String(seq).padStart(3, '0')}`;
}

async function findExistingLead(db: SupabaseClient<Database>, userId: string, lead: NormalizedLead) {
  if (lead.whatsapp) {
    const { data } = await db
      .from('leads_prospeccao')
      .select('id')
      .eq('user_id', userId)
      .eq('whatsapp', lead.whatsapp)
      .limit(1)
      .maybeSingle();
    if (data) return data as { id: string };
  }
  if (lead.email) {
    const { data } = await db
      .from('leads_prospeccao')
      .select('id')
      .eq('user_id', userId)
      .eq('email', lead.email)
      .limit(1)
      .maybeSingle();
    if (data) return data as { id: string };
  }
  return null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export async function runImport(
  userId: string,
  leads: NormalizedLead[],
  options: ImportOptions = {}
): Promise<ImportReport> {
  const estagio = options.defaultEstagio ?? 'Novo';
  const origem = options.defaultOrigem ?? 'importação';
  const importId = uuidv4();
  const now = new Date().toISOString();

  const db = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let leadSeq = await getNextLeadSequence(db, userId);
  const rows: ImportResultRow[] = [];
  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const batch of chunk(leads, 50)) {
    for (const lead of batch) {
      try {
        const existing = await findExistingLead(db, userId, lead);

        if (existing) {
          const fieldsToCheck = [
            'contato', 'telefone', 'email', 'cidade', 'bairro', 'categoria',
            'cnpj', 'website', 'instagram', 'linkedin', 'resumo_analitico',
          ] as const;

          const updateFields: Record<string, unknown> = { updated_at: now };
          const { data: current } = await db
            .from('leads_prospeccao')
            .select(fieldsToCheck.join(','))
            .eq('id', existing.id)
            .single();

          for (const field of fieldsToCheck) {
            const currentVal = current?.[field as keyof typeof current];
            const newVal = lead[field as keyof NormalizedLead];
            if (!currentVal && newVal) updateFields[field] = newVal;
          }

          if (Object.keys(updateFields).length > 1) {
            await db.from('leads_prospeccao').update(updateFields).eq('id', existing.id);
            rows.push({ empresa: lead.empresa, status: 'updated' });
            updated++;
          } else {
            rows.push({ empresa: lead.empresa, status: 'skipped' });
            skipped++;
          }
        } else {
          const { error: insertErr } = await db.from('leads_prospeccao').insert({
            user_id: userId,
            lead: formatLeadNumber(leadSeq),
            empresa: lead.empresa,
            contato: lead.contato || null,
            whatsapp: lead.whatsapp,
            telefone: lead.telefone,
            email: lead.email,
            cidade: lead.cidade,
            bairro: lead.bairro,
            categoria: lead.categoria,
            cnpj: lead.cnpj,
            website: lead.website,
            instagram: lead.instagram,
            linkedin: lead.linkedin,
            resumo_analitico: lead.resumo_analitico,
            status: 'Novo Lead',
            estagio_pipeline: estagio,
            status_msg_wa: 'not_sent',
            modo_atendimento: 'bot',
            origem,
            created_at: now,
            updated_at: now,
          });

          if (insertErr) {
            rows.push({ empresa: lead.empresa, status: 'error', reason: insertErr.message });
            errors++;
          } else {
            rows.push({ empresa: lead.empresa, status: 'created' });
            created++;
            leadSeq++;
          }
        }
      } catch (err) {
        rows.push({ empresa: lead.empresa, status: 'error', reason: String(err) });
        errors++;
      }
    }
  }

  // Audit log — best-effort
  try {
    await db.from('audit_logs' as never).insert({
      user_id: userId,
      action: 'IMPORT_LEADS',
      details: { created, updated, skipped, errors, importId },
      created_at: now,
    });
  } catch { /* non-fatal */ }

  return { created, updated, skipped, errors, rows, importId };
}
```

- [ ] **Step 2: Refatorar `app/api/leads/import/route.ts` para usar o service**

Substituir o conteúdo atual do arquivo pelo seguinte (mantém o schema Zod e auth, delega a lógica):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import type { NormalizedLead } from '@/lib/import/types';
import { runImport } from '@/lib/import/import-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NormalizedLeadSchema = z.object({
  empresa: z.string().min(1),
  contato: z.string().nullable(),
  whatsapp: z.string().nullable(),
  telefone: z.string().nullable(),
  email: z.string().nullable(),
  cidade: z.string().nullable(),
  bairro: z.string().nullable(),
  categoria: z.string().nullable(),
  cnpj: z.string().nullable(),
  website: z.string().nullable(),
  instagram: z.string().nullable(),
  linkedin: z.string().nullable(),
  resumo_analitico: z.string().nullable(),
  warnings: z.record(z.string()).optional(),
  errors: z.record(z.string()).optional(),
});

const RequestSchema = z.object({
  leads: z.array(NormalizedLeadSchema).min(1).max(1000),
  options: z.object({
    defaultEstagio: z.string().default('Novo'),
    defaultOrigem: z.string().default('importação'),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const report = await runImport(
    user.id,
    parsed.data.leads as NormalizedLead[],
    parsed.data.options
  );

  return NextResponse.json(report);
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Rodar testes**

```bash
npx vitest run
```

Esperado: 7 test files, 68 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/import-service.ts app/api/leads/import/route.ts
git commit -m "refactor(import): extrai lógica central para import-service.ts"
```

---

## Task 3: Utilitário de API Key

**Files:**
- Create: `src/lib/webhook-keys.ts`
- Create: `tests/unit/webhook-key.spec.ts`

- [ ] **Step 1: Escrever o teste falhando**

```typescript
// tests/unit/webhook-key.spec.ts
import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, KEY_PREFIX } from '../../src/lib/webhook-keys';

describe('generateApiKey', () => {
  it('retorna string com prefixo lpk_', () => {
    const key = generateApiKey();
    expect(key.startsWith(KEY_PREFIX)).toBe(true);
  });

  it('tem 68 caracteres no total (4 prefix + _ + 63 hex)', () => {
    const key = generateApiKey();
    expect(key).toHaveLength(68);
  });

  it('cada chamada gera chave única', () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });
});

describe('hashApiKey', () => {
  it('retorna string hex de 64 chars (SHA-256)', () => {
    const hash = hashApiKey('lpk_abc123');
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });

  it('mesma chave sempre gera mesmo hash', () => {
    const key = 'lpk_test_key_value';
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it('chaves diferentes geram hashes diferentes', () => {
    expect(hashApiKey('lpk_aaa')).not.toBe(hashApiKey('lpk_bbb'));
  });
});
```

- [ ] **Step 2: Rodar teste para confirmar falha**

```bash
npx vitest run tests/unit/webhook-key.spec.ts
```

Esperado: FAIL — `Cannot find module '../../src/lib/webhook-keys'`

- [ ] **Step 3: Implementar `src/lib/webhook-keys.ts`**

```typescript
import { createHash, randomBytes } from 'crypto';

export const KEY_PREFIX = 'lpk_';

/** Gera uma nova API key — mostrar ao usuário UMA ÚNICA VEZ */
export function generateApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString('hex').slice(0, 63)}`;
}

/** Hash SHA-256 da chave — armazenar no banco, nunca a chave em si */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
```

- [ ] **Step 4: Rodar teste para confirmar passou**

```bash
npx vitest run tests/unit/webhook-key.spec.ts
```

Esperado: PASS — 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/webhook-keys.ts tests/unit/webhook-key.spec.ts
git commit -m "feat(f17): utilitário de geração e hash de API keys"
```

---

## Task 4: API Routes de Gerenciamento de Chaves

**Files:**
- Create: `app/api/webhook-keys/route.ts`
- Create: `app/api/webhook-keys/[id]/route.ts`

- [ ] **Step 1: Criar `app/api/webhook-keys/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { generateApiKey, hashApiKey } from '@/lib/webhook-keys';

const CreateKeySchema = z.object({
  name: z.string().min(1).max(60),
});

async function getUser() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** GET /api/webhook-keys — lista chaves ativas do usuário */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await db
    .from('webhook_keys')
    .select('id, name, last_used_at, created_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** POST /api/webhook-keys — cria nova chave */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = CreateKeySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const plainKey = generateApiKey();
  const keyHash = hashApiKey(plainKey);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await db
    .from('webhook_keys')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      key_hash: keyHash,
    })
    .select('id, name, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // plainKey retornado UMA ÚNICA VEZ — não é armazenado
  return NextResponse.json({ ...data, key: plainKey }, { status: 201 });
}
```

- [ ] **Step 2: Criar `app/api/webhook-keys/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await db
    .from('webhook_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', user.id); // garante que só revoga a própria chave

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add app/api/webhook-keys/route.ts "app/api/webhook-keys/[id]/route.ts"
git commit -m "feat(f17): API routes para gerenciamento de webhook keys"
```

---

## Task 5: Endpoint Webhook de Importação

**Files:**
- Create: `app/api/leads/import/webhook/route.ts`

- [ ] **Step 1: Criar o endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { hashApiKey } from '@/lib/webhook-keys';
import { runImport } from '@/lib/import/import-service';
import type { NormalizedLead } from '@/lib/import/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NormalizedLeadSchema = z.object({
  empresa: z.string().min(1),
  contato: z.string().nullable().default(null),
  whatsapp: z.string().nullable().default(null),
  telefone: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  cidade: z.string().nullable().default(null),
  bairro: z.string().nullable().default(null),
  categoria: z.string().nullable().default(null),
  cnpj: z.string().nullable().default(null),
  website: z.string().nullable().default(null),
  instagram: z.string().nullable().default(null),
  linkedin: z.string().nullable().default(null),
  resumo_analitico: z.string().nullable().default(null),
});

const RequestSchema = z.object({
  leads: z.array(NormalizedLeadSchema).min(1).max(1000),
  options: z.object({
    defaultEstagio: z.string().default('Novo'),
    defaultOrigem: z.string().default('apollo'),
  }).optional(),
});

export async function POST(req: NextRequest) {
  // 1. Extrair e validar API key
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey?.startsWith('lpk_')) {
    return NextResponse.json({ error: 'API key inválida ou ausente' }, { status: 401 });
  }

  const keyHash = hashApiKey(apiKey);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 2. Buscar chave válida (não revogada)
  const { data: keyRecord } = await db
    .from('webhook_keys')
    .select('id, user_id')
    .eq('key_hash', keyHash)
    .is('revoked_at', null)
    .maybeSingle();

  if (!keyRecord) {
    return NextResponse.json({ error: 'API key não encontrada ou revogada' }, { status: 401 });
  }

  // 3. Atualizar last_used_at (best-effort, não bloqueia)
  db.from('webhook_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRecord.id)
    .then(() => {});

  // 4. Validar body
  const body = await req.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  // 5. Rodar importação
  const report = await runImport(
    keyRecord.user_id,
    parsed.data.leads as NormalizedLead[],
    { ...parsed.data.options, defaultOrigem: parsed.data.options?.defaultOrigem ?? 'apollo' }
  );

  return NextResponse.json(report);
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Testar manualmente com curl (opcional)**

```bash
curl -X POST http://localhost:3000/api/leads/import/webhook \
  -H "Content-Type: application/json" \
  -H "x-api-key: CHAVE_INVALIDA" \
  -d '{"leads":[]}'
```

Esperado: `{"error":"API key inválida ou ausente"}` com status 401.

- [ ] **Step 4: Commit**

```bash
git add app/api/leads/import/webhook/route.ts
git commit -m "feat(f17): endpoint /api/leads/import/webhook autenticado por API key"
```

---

## Task 6: UI — WebhookKeysPanel

**Files:**
- Create: `src/components/settings/WebhookKeysPanel.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Key, Plus, Trash2, Copy, Check, RefreshCw } from 'lucide-react';

interface WebhookKey {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

interface NewKeyResult extends WebhookKey {
  key: string;
}

export function WebhookKeysPanel() {
  const [keys, setKeys] = useState<WebhookKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyResult, setNewKeyResult] = useState<NewKeyResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/webhook-keys');
      if (!res.ok) throw new Error('Erro ao carregar chaves');
      setKeys(await res.json());
    } catch {
      toast.error('Erro ao carregar API keys');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/webhook-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (!res.ok) throw new Error('Erro ao criar chave');
      const result: NewKeyResult = await res.json();
      setNewKeyResult(result);
      setNewKeyName('');
      loadKeys();
    } catch {
      toast.error('Erro ao gerar API key');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revogar esta chave? O n8n deixará de funcionar com ela.')) return;
    setRevokingId(id);
    try {
      const res = await fetch(`/api/webhook-keys/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao revogar');
      toast.success('Chave revogada');
      loadKeys();
    } catch {
      toast.error('Erro ao revogar chave');
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = () => {
    if (!newKeyResult) return;
    navigator.clipboard.writeText(newKeyResult.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Nunca';
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Key className="h-5 w-5 text-primary" />
          API Keys — Integrações Externas
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Use estas chaves para integrar com n8n, Zapier ou qualquer ferramenta externa.
          A chave só é exibida uma vez na criação.
        </p>
      </div>

      {/* Criar nova chave */}
      <div className="flex gap-2">
        <Input
          placeholder="Nome da chave (ex: n8n Apollo)"
          value={newKeyName}
          onChange={e => setNewKeyName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          className="max-w-xs"
        />
        <Button onClick={handleCreate} disabled={isCreating || !newKeyName.trim()} className="gap-2">
          {isCreating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Gerar Chave
        </Button>
      </div>

      {/* Lista de chaves */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma API key gerada ainda.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {keys.map(k => (
            <div key={k.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-sm">{k.name}</p>
                <p className="text-xs text-muted-foreground">
                  Criada em {formatDate(k.created_at)} · Último uso: {formatDate(k.last_used_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">lpk_••••••••</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Revogar"
                  disabled={revokingId === k.id}
                  onClick={() => handleRevoke(k.id)}
                >
                  {revokingId === k.id
                    ? <RefreshCw className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4 text-destructive" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: mostrar chave gerada UMA VEZ */}
      <Dialog open={!!newKeyResult} onOpenChange={() => setNewKeyResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Gerada — "{newKeyResult?.name}"</DialogTitle>
            <DialogDescription>
              Copie esta chave agora. Ela não será exibida novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-lg p-4 font-mono text-sm break-all">
            {newKeyResult?.key}
          </div>
          <Button onClick={handleCopy} variant="outline" className="gap-2">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copiado!' : 'Copiar Chave'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Cole esta chave no campo <code>x-api-key</code> do seu workflow n8n.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/WebhookKeysPanel.tsx
git commit -m "feat(f17): componente WebhookKeysPanel para gerenciamento de API keys"
```

---

## Task 7: Integrar WebhookKeysPanel em Settings

**Files:**
- Modify: `app/(protected)/settings/page.tsx`

- [ ] **Step 1: Adicionar import e renderizar o painel**

No topo do arquivo, adicionar o import:

```tsx
import { WebhookKeysPanel } from '@/components/settings/WebhookKeysPanel';
```

Localizar a seção de abas/tabs em `settings/page.tsx`. Adicionar uma nova aba "Integrações" ou, se não houver sistema de abas, adicionar como nova seção após o último card existente:

```tsx
{/* Seção: API & Integrações */}
<div className="mt-8 border rounded-lg p-6">
  <WebhookKeysPanel />
</div>
```

Se a página usar `Tabs` do shadcn, adicionar:

```tsx
<TabsTrigger value="integracoes">Integrações</TabsTrigger>
```

e:

```tsx
<TabsContent value="integracoes">
  <WebhookKeysPanel />
</TabsContent>
```

- [ ] **Step 2: Verificar TypeScript + testes**

```bash
npx tsc --noEmit && npx vitest run
```

Esperado: sem erros, todos os testes passam.

- [ ] **Step 3: Commit**

```bash
git add "app/(protected)/settings/page.tsx"
git commit -m "feat(f17): integra WebhookKeysPanel na página de Settings"
```

---

## Task 8: Template do Workflow n8n

**Files:**
- Create: `docs/n8n/apollo-leadfinder-workflow.json`

- [ ] **Step 1: Criar o workflow exportável**

```json
{
  "name": "Apollo.io → LeadFinder Pro",
  "nodes": [
    {
      "parameters": {
        "pollTimes": { "item": [{ "mode": "everyMinute" }] },
        "triggerOn": "specificFolder",
        "folderToWatch": { "__rl": true, "mode": "list", "value": "CONFIGURE: ID da pasta Apollo Exports no Google Drive" },
        "event": "fileCreated"
      },
      "id": "node-gdrive-trigger",
      "name": "Google Drive — Novo arquivo",
      "type": "n8n-nodes-base.googleDriveTrigger",
      "typeVersion": 1,
      "position": [260, 300]
    },
    {
      "parameters": {
        "operation": "download",
        "fileId": { "__rl": true, "mode": "id", "value": "={{ $json.id }}" },
        "options": {}
      },
      "id": "node-gdrive-download",
      "name": "Google Drive — Download CSV",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [480, 300]
    },
    {
      "parameters": {
        "operation": "fromFile",
        "binaryPropertyName": "data",
        "options": { "headerRow": true, "delimiter": "," }
      },
      "id": "node-parse-csv",
      "name": "Parsear CSV",
      "type": "n8n-nodes-base.spreadsheetFile",
      "typeVersion": 2,
      "position": [700, 300]
    },
    {
      "parameters": {
        "mode": "runOnceForAllItems",
        "jsCode": "// Mapeia colunas Apollo → LeadFinder\nconst items = $input.all();\n\nconst leads = items.map(item => {\n  const row = item.json;\n\n  // Concatena First Name + Last Name\n  const firstName = (row['First Name'] || row['first name'] || '').trim();\n  const lastName = (row['Last Name'] || row['last name'] || '').trim();\n  const contato = [firstName, lastName].filter(Boolean).join(' ') || null;\n\n  return {\n    empresa: row['Company'] || row['Account Name'] || row['company'] || '',\n    contato,\n    email: row['Email'] || row['email'] || null,\n    whatsapp: row['Mobile Phone'] || row['mobile phone'] || row['Phone'] || null,\n    telefone: row['Work Phone'] || row['Work Direct Phone'] || row['work phone'] || null,\n    linkedin: row['Person Linkedin URL'] || row['LinkedIn URL'] || row['linkedin url'] || null,\n    website: row['Website'] || row['Company Website'] || row['website url'] || null,\n    cidade: row['City'] || row['city'] || null,\n    categoria: row['Industry'] || row['Keywords'] || row['industry'] || null,\n    resumo_analitico: row['Title'] || row['Job Title'] || row['SEO Description'] || null,\n    bairro: null,\n    cnpj: null,\n    instagram: null,\n  };\n}).filter(l => l.empresa.trim() !== '');\n\nreturn [{ json: { leads, options: { defaultOrigem: 'apollo', defaultEstagio: 'Novo' } } }];"
      },
      "id": "node-map-columns",
      "name": "Mapear Colunas Apollo",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [920, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "CONFIGURE: https://seu-dominio.vercel.app/api/leads/import/webhook",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "x-api-key", "value": "CONFIGURE: lpk_sua_chave_aqui" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "contentType": "json",
        "body": "={{ JSON.stringify($json) }}"
      },
      "id": "node-http-import",
      "name": "Importar no LeadFinder",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1140, 300]
    },
    {
      "parameters": {
        "conditions": {
          "number": [{ "value1": "={{ $json.errors }}", "operation": "equal", "value2": 0 }]
        }
      },
      "id": "node-if-success",
      "name": "Importação ok?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [1360, 300]
    },
    {
      "parameters": {
        "jsCode": "const r = $input.first().json;\nconsole.log(`✅ Apollo import: ${r.created} criados, ${r.updated} atualizados, ${r.skipped} ignorados, ${r.errors} erros`);\nreturn $input.all();"
      },
      "id": "node-log-success",
      "name": "Log Sucesso",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1580, 200]
    },
    {
      "parameters": {
        "jsCode": "const r = $input.first().json;\nconsole.error(`❌ Apollo import com erros: ${r.errors} falhas`);\nreturn $input.all();"
      },
      "id": "node-log-error",
      "name": "Log Erros",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1580, 400]
    }
  ],
  "connections": {
    "Google Drive — Novo arquivo": {
      "main": [[{ "node": "Google Drive — Download CSV", "type": "main", "index": 0 }]]
    },
    "Google Drive — Download CSV": {
      "main": [[{ "node": "Parsear CSV", "type": "main", "index": 0 }]]
    },
    "Parsear CSV": {
      "main": [[{ "node": "Mapear Colunas Apollo", "type": "main", "index": 0 }]]
    },
    "Mapear Colunas Apollo": {
      "main": [[{ "node": "Importar no LeadFinder", "type": "main", "index": 0 }]]
    },
    "Importar no LeadFinder": {
      "main": [[{ "node": "Importação ok?", "type": "main", "index": 0 }]]
    },
    "Importação ok?": {
      "main": [
        [{ "node": "Log Sucesso", "type": "main", "index": 0 }],
        [{ "node": "Log Erros", "type": "main", "index": 0 }]
      ]
    }
  },
  "settings": { "executionOrder": "v1" },
  "meta": {
    "templateCredsSetupCompleted": false,
    "notes": "CONFIGURE antes de ativar: (1) Credenciais Google Drive, (2) ID da pasta Apollo Exports, (3) URL do LeadFinder, (4) x-api-key gerada em Settings → Integrações"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add docs/n8n/apollo-leadfinder-workflow.json
git commit -m "feat(f17): template workflow n8n Apollo → LeadFinder"
```

---

## Task 9: Deploy e Verificação Final

- [ ] **Step 1: Rodar TypeScript + testes completos**

```bash
npx tsc --noEmit && npx vitest run
```

Esperado: sem erros de tipo, todos os testes passam.

- [ ] **Step 2: Commit final de integração**

```bash
git add -A
git commit -m "feat(f17): integração Apollo → n8n → LeadFinder completa"
git push origin main
```

- [ ] **Step 3: Deploy para produção**

```bash
vercel --prod --yes
```

- [ ] **Step 4: Checklist de validação manual**

1. Acessar Settings → seção Integrações
2. Clicar "Gerar Chave", nomear "n8n Apollo"
3. Copiar a chave exibida
4. Testar com curl:
   ```bash
   curl -X POST https://prospect-pulse-54.vercel.app/api/leads/import/webhook \
     -H "x-api-key: lpk_SUACHAVE" \
     -H "Content-Type: application/json" \
     -d '{"leads":[{"empresa":"Teste Apollo","contato":"João Silva","email":"joao@teste.com"}]}'
   ```
   Esperado: `{"created":1,"updated":0,"skipped":0,"errors":0,...}`
5. Verificar lead "Teste Apollo" aparece na tabela de Leads com `origem: apollo`
6. Importar workflow JSON no n8n, configurar os 4 campos marcados com "CONFIGURE"
7. Ativar workflow e testar com um CSV real do Apollo

---

## Checklist de Spec Coverage

- [x] Tabela `webhook_keys` com RLS e índice otimizado
- [x] Lógica de importação extraída para `import-service.ts` (DRY)
- [x] Endpoint `/api/leads/import/webhook` com auth por API key
- [x] Geração segura de chave (prefix `lpk_` + 63 hex chars)
- [x] Hash SHA-256 — plaintext nunca armazenado
- [x] API key exibida UMA única vez no modal
- [x] Revogação de chave (soft delete via `revoked_at`)
- [x] `last_used_at` atualizado a cada uso
- [x] Origem `"apollo"` nos leads importados via webhook
- [x] Workflow n8n com mapeamento correto das colunas Apollo
- [x] `First Name + Last Name → contato` concatenados no Code node
- [x] Log de resultado no n8n (sucesso / erros)
- [x] Deploy e checklist de validação manual
