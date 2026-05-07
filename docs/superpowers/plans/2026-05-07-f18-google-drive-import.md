# F18 — Google Drive → Apollo → LeadFinder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar importação de planilhas Apollo via Google Drive Watch no n8n, com histórico de importações visível em Settings e Leads.

**Architecture:** Nova tabela `import_history` centraliza histórico de todas as origens. `runImport()` grava lá ao final de cada execução. Novo workflow n8n (10 nós) monitora pasta do Drive, processa CSV/XLSX Apollo com fallback IA, e envia via webhook existente passando metadata com source e filename.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (service role), Zod, Shadcn/UI, n8n (Google Drive Trigger nativo, HTTP Request, Code nodes)

---

## File Map

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Create | `supabase/migrations/20260507200000_import_history.sql` | DDL da tabela + RLS + índice |
| Modify | `src/lib/import/import-service.ts` | Adiciona `ImportMetadata`, grava `import_history` |
| Modify | `app/api/leads/import/webhook/route.ts` | Aceita `metadata` opcional no body |
| Modify | `app/api/leads/import/route.ts` | Passa `source: 'manual'` para `runImport()` |
| Create | `app/api/leads/import/history/route.ts` | GET histórico paginado |
| Create | `src/components/settings/ImportHistoryPanel.tsx` | Tabela de histórico com badges e paginação |
| Modify | `app/(protected)/settings/page.tsx` | Adiciona `ImportHistoryPanel` + suporte `?tab=` |
| Modify | `app/(protected)/leads/page.tsx` | Banner "Última importação" |
| Create | `docs/n8n/google-drive-apollo-workflow.json` | Workflow n8n importável (10 nós) |
| Create | `tests/unit/import-service-history.spec.ts` | Testa gravação em `import_history` |

---

## Task 1: Migration — tabela `import_history`

**Files:**
- Create: `supabase/migrations/20260507200000_import_history.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- supabase/migrations/20260507200000_import_history.sql
CREATE TABLE IF NOT EXISTS import_history (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source      text        NOT NULL CHECK (source IN ('manual', 'webhook', 'google_drive')),
  filename    text,
  created     integer     NOT NULL DEFAULT 0,
  updated     integer     NOT NULL DEFAULT 0,
  skipped     integer     NOT NULL DEFAULT 0,
  errors      integer     NOT NULL DEFAULT 0,
  import_id   text        NOT NULL,
  created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE import_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own history"
  ON import_history FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS import_history_user_date
  ON import_history(user_id, created_at DESC);
```

- [ ] **Step 2: Aplicar migration via Management API**

```bash
curl -s "https://api.supabase.com/v1/projects/kzvnwqlcrtxwagxkghxq/database/query" \
  -H "Authorization: Bearer sbp_a800326fa1379dfb3f5afca6fda99e42f0874092" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "CREATE TABLE IF NOT EXISTS import_history (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL, source text NOT NULL CHECK (source IN ('"'"'manual'"'"', '"'"'webhook'"'"', '"'"'google_drive'"'"')), filename text, created integer NOT NULL DEFAULT 0, updated integer NOT NULL DEFAULT 0, skipped integer NOT NULL DEFAULT 0, errors integer NOT NULL DEFAULT 0, import_id text NOT NULL, created_at timestamptz DEFAULT now() NOT NULL)"
  }'
```

Esperado: `[]`

```bash
curl -s "https://api.supabase.com/v1/projects/kzvnwqlcrtxwagxkghxq/database/query" \
  -H "Authorization: Bearer sbp_a800326fa1379dfb3f5afca6fda99e42f0874092" \
  -H "Content-Type: application/json" \
  -d '{"query": "ALTER TABLE import_history ENABLE ROW LEVEL SECURITY"}'

curl -s "https://api.supabase.com/v1/projects/kzvnwqlcrtxwagxkghxq/database/query" \
  -H "Authorization: Bearer sbp_a800326fa1379dfb3f5afca6fda99e42f0874092" \
  -H "Content-Type: application/json" \
  -d '{"query": "CREATE POLICY \"users see own history\" ON import_history FOR ALL USING (auth.uid() = user_id)"}'

curl -s "https://api.supabase.com/v1/projects/kzvnwqlcrtxwagxkghxq/database/query" \
  -H "Authorization: Bearer sbp_a800326fa1379dfb3f5afca6fda99e42f0874092" \
  -H "Content-Type: application/json" \
  -d '{"query": "CREATE INDEX IF NOT EXISTS import_history_user_date ON import_history(user_id, created_at DESC)"}'
```

- [ ] **Step 3: Verificar tabela criada**

```bash
curl -s "https://api.supabase.com/v1/projects/kzvnwqlcrtxwagxkghxq/database/query" \
  -H "Authorization: Bearer sbp_a800326fa1379dfb3f5afca6fda99e42f0874092" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '"'"'import_history'"'"' ORDER BY ordinal_position"}'
```

Esperado: 9 colunas (id, user_id, source, filename, created, updated, skipped, errors, import_id, created_at).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260507200000_import_history.sql
git commit -m "feat(f18): migration tabela import_history com RLS e índice"
```

---

## Task 2: Atualizar `import-service.ts` — gravar `import_history`

**Files:**
- Modify: `src/lib/import/import-service.ts`
- Create: `tests/unit/import-service-history.spec.ts`

- [ ] **Step 1: Escrever teste de regressão (deve falhar agora)**

Criar `tests/unit/import-service-history.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do supabase client
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn((table: string) => {
  if (table === 'import_history') return { insert: mockInsert };
  // Simula as queries de leads_prospeccao para não travar o teste
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [] }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

import { runImport } from '@/lib/import/import-service';

describe('runImport — import_history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('grava em import_history com source=webhook por padrão', async () => {
    await runImport('user-123', [{ empresa: 'Acme', contato: null, whatsapp: null, telefone: null, email: null, cidade: null, bairro: null, categoria: null, cnpj: null, website: null, instagram: null, linkedin: null, resumo_analitico: null, warnings: {}, errors: {} }]);

    expect(mockFrom).toHaveBeenCalledWith('import_history');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-123', source: 'webhook' })
    );
  });

  it('grava source=google_drive quando passado em metadata', async () => {
    await runImport('user-456', [{ empresa: 'Beta', contato: null, whatsapp: null, telefone: null, email: null, cidade: null, bairro: null, categoria: null, cnpj: null, website: null, instagram: null, linkedin: null, resumo_analitico: null, warnings: {}, errors: {} }], {}, { source: 'google_drive', filename: 'apollo.csv' });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'google_drive', filename: 'apollo.csv' })
    );
  });

  it('grava contagens corretas', async () => {
    const report = await runImport('user-789', [{ empresa: 'Gamma', contato: null, whatsapp: null, telefone: null, email: null, cidade: null, bairro: null, categoria: null, cnpj: null, website: null, instagram: null, linkedin: null, resumo_analitico: null, warnings: {}, errors: {} }], {}, { source: 'manual' });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        created: report.created,
        updated: report.updated,
        skipped: report.skipped,
        errors: report.errors,
        import_id: report.importId,
      })
    );
  });
});
```

- [ ] **Step 2: Rodar teste para confirmar falha**

```bash
cd C:\Projects\prospect-pulse-54
npx vitest run tests/unit/import-service-history.spec.ts
```

Esperado: FAIL — `mockFrom` nunca chamado com `'import_history'`.

- [ ] **Step 3: Atualizar `import-service.ts`**

Adicionar a interface `ImportMetadata` e o 4º parâmetro em `runImport()`. Substituir o conteúdo completo do arquivo:

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { Database } from '@/integrations/supabase/types';
import type { NormalizedLead, ImportReport, ImportResultRow } from '@/lib/import/types';

export interface ImportOptions {
  defaultEstagio?: string;
  defaultOrigem?: string;
}

export interface ImportMetadata {
  source?: 'manual' | 'webhook' | 'google_drive';
  filename?: string;
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
  options: ImportOptions = {},
  metadata: ImportMetadata = {}
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
            id: uuidv4(),
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

  // Grava histórico de importação — best-effort
  try {
    await (db as SupabaseClient).from('import_history').insert({
      user_id: userId,
      source: metadata.source ?? 'webhook',
      filename: metadata.filename ?? null,
      created,
      updated,
      skipped,
      errors,
      import_id: importId,
      created_at: now,
    });
  } catch { /* non-fatal */ }

  // Audit log — best-effort
  try {
    await (db as SupabaseClient).from('audit_logs').insert({
      user_id: userId,
      action: 'IMPORT_LEADS',
      details: { created, updated, skipped, errors, importId },
      created_at: now,
    });
  } catch { /* non-fatal */ }

  return { created, updated, skipped, errors, rows, importId };
}
```

- [ ] **Step 4: Rodar testes**

```bash
npx vitest run tests/unit/import-service-history.spec.ts
```

Esperado: 3 testes passando (PASS).

- [ ] **Step 5: Rodar suite completa para verificar regressões**

```bash
npx vitest run
```

Esperado: todos os testes existentes continuam passando.

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/import-service.ts tests/unit/import-service-history.spec.ts
git commit -m "feat(f18): runImport grava em import_history com metadata de origem"
```

---

## Task 3: Atualizar webhook route — aceitar `metadata`

**Files:**
- Modify: `app/api/leads/import/webhook/route.ts`

- [ ] **Step 1: Atualizar o arquivo**

Substituir o conteúdo de `app/api/leads/import/webhook/route.ts`:

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
  warnings: z.record(z.string()).optional().default({}),
  errors: z.record(z.string()).optional().default({}),
});

const RequestSchema = z.object({
  leads: z.array(NormalizedLeadSchema).min(1).max(1000),
  metadata: z.object({
    source: z.enum(['webhook', 'google_drive']).default('webhook'),
    filename: z.string().max(255).optional(),
  }).optional(),
  options: z.object({
    defaultEstagio: z.string().default('Novo'),
    defaultOrigem: z.string().default('apollo'),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey?.startsWith('lpk_')) {
    return NextResponse.json({ error: 'API key inválida ou ausente' }, { status: 401 });
  }

  const keyHash = hashApiKey(apiKey);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: keyRecord } = await db
    .from('webhook_keys' as never)
    .select('id, user_id')
    .eq('key_hash', keyHash)
    .is('revoked_at', null)
    .maybeSingle() as { data: { id: string; user_id: string } | null };

  if (!keyRecord) {
    return NextResponse.json({ error: 'API key não encontrada ou revogada' }, { status: 401 });
  }

  void (db.from('webhook_keys' as never)
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRecord.id));

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON malformado no corpo da requisição' }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const report = await runImport(
    keyRecord.user_id,
    parsed.data.leads as NormalizedLead[],
    { ...parsed.data.options, defaultOrigem: parsed.data.options?.defaultOrigem ?? 'apollo' },
    {
      source: parsed.data.metadata?.source ?? 'webhook',
      filename: parsed.data.metadata?.filename,
    }
  );

  return NextResponse.json(report);
}
```

- [ ] **Step 2: Verificar tipo com tsc**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add app/api/leads/import/webhook/route.ts
git commit -m "feat(f18): webhook aceita metadata com source e filename"
```

---

## Task 4: Atualizar route de importação manual — passar `source: 'manual'`

**Files:**
- Modify: `app/api/leads/import/route.ts`

- [ ] **Step 1: Atualizar o arquivo**

Substituir o conteúdo de `app/api/leads/import/route.ts`:

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
  filename: z.string().max(255).optional(),
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
    parsed.data.options,
    { source: 'manual', filename: parsed.data.filename }
  );

  return NextResponse.json(report);
}
```

- [ ] **Step 2: Verificar tipo com tsc**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add app/api/leads/import/route.ts
git commit -m "feat(f18): importação manual passa source=manual para import_history"
```

---

## Task 5: Nova rota `GET /api/leads/import/history`

**Files:**
- Create: `app/api/leads/import/history/route.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error, count } = await (db as ReturnType<typeof createClient>)
    .from('import_history')
    .select('id, source, filename, created, updated, skipped, errors, import_id, created_at', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}
```

- [ ] **Step 2: Verificar tipo com tsc**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Testar endpoint manualmente (requer sessão ativa)**

```bash
# Este endpoint requer cookie de sessão — testar via browser DevTools ou curl com cookie
# Para verificar que a rota existe e retorna 401 sem auth:
curl -s https://prospect-pulse-54.vercel.app/api/leads/import/history
```

Esperado: `{"error":"Unauthorized"}` (confirma que a rota está ativa).

- [ ] **Step 4: Commit**

```bash
git add app/api/leads/import/history/route.ts
git commit -m "feat(f18): GET /api/leads/import/history — histórico paginado"
```

---

## Task 6: Componente `ImportHistoryPanel`

**Files:**
- Create: `src/components/settings/ImportHistoryPanel.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ImportHistoryRow {
  id: string;
  source: 'manual' | 'webhook' | 'google_drive';
  filename: string | null;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  import_id: string;
  created_at: string;
}

const SOURCE_LABELS: Record<ImportHistoryRow['source'], { label: string; className: string }> = {
  google_drive: { label: 'Drive', className: 'bg-blue-100 text-blue-800' },
  manual:       { label: 'Manual', className: 'bg-gray-100 text-gray-800' },
  webhook:      { label: 'API', className: 'bg-purple-100 text-purple-800' },
};

function formatResult(row: ImportHistoryRow): string {
  const parts: string[] = [];
  if (row.created > 0)  parts.push(`+${row.created} criados`);
  if (row.updated > 0)  parts.push(`${row.updated} atualizados`);
  if (row.skipped > 0)  parts.push(`${row.skipped} ignorados`);
  if (row.errors > 0)   parts.push(`${row.errors} erros`);
  return parts.join(' · ') || 'Sem alterações';
}

export function ImportHistoryPanel() {
  const [rows, setRows] = useState<ImportHistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const LIMIT = 20;

  const fetchHistory = useCallback(async (currentOffset: number, append: boolean) => {
    try {
      const res = await fetch(`/api/leads/import/history?limit=${LIMIT}&offset=${currentOffset}`);
      if (!res.ok) return;
      const json = await res.json() as { data: ImportHistoryRow[]; total: number };
      setRows(prev => append ? [...prev, ...json.data] : json.data);
      setTotal(json.total);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(0, false);
    const interval = setInterval(() => fetchHistory(0, false), 30_000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const handleLoadMore = () => {
    const nextOffset = offset + LIMIT;
    setOffset(nextOffset);
    setLoadingMore(true);
    fetchHistory(nextOffset, true);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Carregando histórico...</span>
      </div>
    );
  }

  return (
    <div id="import-history">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm">Histórico de Importações</h3>
        <Button variant="ghost" size="sm" onClick={() => fetchHistory(0, false)} className="gap-1 h-7">
          <RefreshCw className="h-3 w-3" />
          Atualizar
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Nenhuma importação registrada ainda.</p>
      ) : (
        <>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Data</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Arquivo</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Origem</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(row => {
                  const src = SOURCE_LABELS[row.source];
                  return (
                    <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: ptBR })}
                      </td>
                      <td className="px-3 py-2 max-w-[180px] truncate" title={row.filename ?? '—'}>
                        {row.filename ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={`text-xs ${src.className}`}>{src.label}</Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatResult(row)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length < total && (
            <div className="mt-3 text-center">
              <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Carregar mais ({total - rows.length} restantes)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar dependência date-fns**

```bash
node -e "require('date-fns')" 2>&1
```

Se `Cannot find module 'date-fns'`:
```bash
npm install date-fns
```

Se já instalado: output vazio (OK).

- [ ] **Step 3: Verificar tipo com tsc**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/ImportHistoryPanel.tsx
git commit -m "feat(f18): componente ImportHistoryPanel com paginação e polling 30s"
```

---

## Task 7: Settings page — adicionar `ImportHistoryPanel` e suporte `?tab=`

**Files:**
- Modify: `app/(protected)/settings/page.tsx`

- [ ] **Step 1: Adicionar import do componente**

Na linha 23 (após o import do `WebhookKeysPanel`), adicionar:

```typescript
import { ImportHistoryPanel } from '@/components/settings/ImportHistoryPanel';
```

- [ ] **Step 2: Adicionar `useSearchParams` e scroll automático**

Adicionar `useSearchParams` ao import do React e rolar para `#import-history` quando `?tab=integrations` está na URL. Adicionar logo após `const { user } = useAuth();`:

```typescript
import { useSearchParams } from 'next/navigation';

// dentro do componente, após const { user } = useAuth():
const searchParams = useSearchParams();
useEffect(() => {
  if (searchParams.get('tab') === 'integrations') {
    setTimeout(() => {
      document.getElementById('import-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }
}, [searchParams]);
```

- [ ] **Step 3: Adicionar `ImportHistoryPanel` após `WebhookKeysPanel`**

Localizar o bloco (em torno da linha 1292–1295):

```tsx
      {/* Integrações - Webhook Keys */}
      <div className="mt-8 border rounded-lg p-6">
        <WebhookKeysPanel />
      </div>
```

Substituir por:

```tsx
      {/* Integrações - Webhook Keys */}
      <div className="mt-8 border rounded-lg p-6">
        <WebhookKeysPanel />
      </div>

      {/* Integrações - Histórico de Importações */}
      <div className="mt-6 border rounded-lg p-6">
        <ImportHistoryPanel />
      </div>
```

- [ ] **Step 4: Verificar tipo com tsc**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add app/(protected)/settings/page.tsx
git commit -m "feat(f18): Settings — ImportHistoryPanel e scroll via ?tab=integrations"
```

---

## Task 8: Leads page — banner "Última importação"

**Files:**
- Modify: `app/(protected)/leads/page.tsx`

- [ ] **Step 1: Adicionar estado e fetch da última importação**

Após a linha `const [isImportModalOpen, setIsImportModalOpen] = useState(false);` (linha ~70), adicionar:

```typescript
const [lastImport, setLastImport] = useState<{
  source: 'manual' | 'webhook' | 'google_drive';
  created: number;
  created_at: string;
} | null>(null);

useEffect(() => {
  fetch('/api/leads/import/history?limit=1')
    .then(r => r.ok ? r.json() : null)
    .then((json: { data: typeof lastImport[] } | null) => {
      if (json?.data?.[0]) {
        const row = json.data[0];
        const hoursSince = (Date.now() - new Date(row.created_at).getTime()) / 3_600_000;
        if (hoursSince <= 24) setLastImport(row);
      }
    })
    .catch(() => null);
}, []);
```

- [ ] **Step 2: Adicionar o banner antes de `<LeadsFilters`**

Localizar a linha `<LeadsFilters` (em torno da linha 396) e adicionar o banner imediatamente antes:

```tsx
      {lastImport && (
        <div className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground border-b">
          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
          <span>
            Última importação via{' '}
            <strong>
              {lastImport.source === 'google_drive' ? 'Google Drive' :
               lastImport.source === 'manual' ? 'Upload manual' : 'API'}
            </strong>
            {' · '}+{lastImport.created} leads
          </span>
          <a
            href="/settings?tab=integrations#import-history"
            className="ml-auto text-xs underline underline-offset-2 hover:text-foreground shrink-0"
          >
            Ver histórico →
          </a>
        </div>
      )}
```

- [ ] **Step 3: Verificar que `RefreshCw` já está importado**

```bash
grep "RefreshCw" "app/(protected)/leads/page.tsx"
```

Esperado: linha com `import { ..., RefreshCw, ... }` — já estava na linha 12. Se não estiver, adicionar ao import existente.

- [ ] **Step 4: Verificar tipo com tsc**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "app/(protected)/leads/page.tsx"
git commit -m "feat(f18): banner de última importação na página de Leads"
```

---

## Task 9: Workflow n8n — Google Drive → LeadFinder (11 nós com normalização IA)

**Arquitetura do fluxo:**

```
Drive Trigger → Filtrar formato → Download → Parse+Confidence → IF confidence
  ├─(TRUE)→ Montar payload Apollo ──┐
  └─(FALSE)→ Fallback IA /map ──────┴→ Normalizar via IA (OpenAI) → POST Webhook → Mover Processados
Erro em qualquer nó → Mover Erros
```

O nó de normalização IA recebe os leads já mapeados (de qualquer branch) e faz um único call ao GPT-4o-mini com todos os dados, retornando leads normalizados com:
- Telefones em formato E.164 brasileiro (`+55 11 99999-9999`)
- Emails em lowercase sem espaços
- Empresa/contato em title case brasileiro
- Website com `https://` obrigatório
- LinkedIn com URL completa (`https://linkedin.com/in/...`)
- `resumo_analitico` gerado quando empresa + cargo disponíveis

**Files:**
- Create: `docs/n8n/google-drive-apollo-workflow.json`

- [ ] **Step 1: Criar o arquivo de workflow**

```json
{
  "name": "F18 — Google Drive Apollo → LeadFinder",
  "nodes": [
    {
      "parameters": {
        "pollTimes": { "item": [{ "mode": "everyMinute" }] },
        "triggerOn": "specificFolder",
        "folderToWatch": { "__rl": true, "value": "={{ $vars.APOLLO_FOLDER_ID }}", "mode": "id" },
        "event": "fileCreated",
        "options": {}
      },
      "id": "node-1",
      "name": "Google Drive Trigger",
      "type": "n8n-nodes-base.googleDriveTrigger",
      "typeVersion": 1,
      "position": [240, 300],
      "credentials": { "googleDriveOAuth2Api": { "id": "CONFIGURE_GOOGLE_OAUTH", "name": "Google Drive" } }
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{ $json.name.toLowerCase() }}",
              "operation": "regex",
              "value2": "\\.(csv|xlsx)$"
            }
          ]
        }
      },
      "id": "node-2",
      "name": "Filtrar CSV/XLSX",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [460, 300]
    },
    {
      "parameters": {
        "operation": "download",
        "fileId": { "__rl": true, "value": "={{ $json.id }}", "mode": "id" },
        "options": { "binaryPropertyName": "data" }
      },
      "id": "node-3",
      "name": "Download File",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [680, 200],
      "credentials": { "googleDriveOAuth2Api": { "id": "CONFIGURE_GOOGLE_OAUTH", "name": "Google Drive" } }
    },
    {
      "parameters": {
        "jsCode": "const fileName = $('Google Drive Trigger').first().json.name;\nconst ext = fileName.split('.').pop().toLowerCase();\nlet rows = [];\n\nif (ext === 'csv') {\n  const csvText = Buffer.from($input.first().binary.data.data, 'base64').toString('utf8');\n  const lines = csvText.split('\\n').filter(l => l.trim());\n  if (lines.length < 2) throw new Error('CSV vazio');\n  const headers = lines[0].split(',').map(h => h.replace(/^\"|\"$/g, '').trim());\n  rows = lines.slice(1).map(line => {\n    const vals = line.match(/(?:\"[^\"]*\"|[^,])+/g) || [];\n    const obj = {};\n    headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^\"|\"$/g, '').trim(); });\n    return obj;\n  });\n} else {\n  throw new Error('Formato não suportado diretamente — converta para CSV no Apollo');\n}\n\nconst APOLLO_MAP = {\n  empresa:   ['Account Name', 'Company'],\n  email:     ['Email'],\n  linkedin:  ['Person Linkedin Url', 'LinkedIn Url'],\n  cidade:    ['City'],\n  categoria: ['Title'],\n  website:   ['Website'],\n};\nconst cols = rows.length > 0 ? Object.keys(rows[0]) : [];\nlet matched = 0;\nfor (const apolloCols of Object.values(APOLLO_MAP)) {\n  if (apolloCols.some(c => cols.includes(c))) matched++;\n}\nif (cols.includes('First Name') && cols.includes('Last Name')) matched++;\nconst confidence = cols.length > 0 ? matched / (Object.keys(APOLLO_MAP).length + 1) : 0;\n\nreturn [{ json: { rows, fileName, confidence, columns: cols } }];"
      },
      "id": "node-4",
      "name": "Parse + Confidence",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [900, 200]
    },
    {
      "parameters": {
        "conditions": {
          "number": [
            { "value1": "={{ $json.confidence }}", "operation": "largerEqual", "value2": 0.7 }
          ]
        }
      },
      "id": "node-5",
      "name": "Confidence >= 0.7?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [1120, 200]
    },
    {
      "parameters": {
        "jsCode": "const { rows, fileName } = $input.first().json;\nconst leads = rows.map(row => ({\n  empresa:          row['Account Name'] || row['Company'] || '',\n  contato:          [row['First Name'], row['Last Name']].filter(Boolean).join(' ') || null,\n  email:            row['Email'] || null,\n  linkedin:         row['Person Linkedin Url'] || row['LinkedIn Url'] || null,\n  cidade:           row['City'] || null,\n  categoria:        row['Title'] || null,\n  website:          row['Website'] || null,\n  whatsapp:         null, telefone: null, bairro: null,\n  cnpj:             null, instagram: null, resumo_analitico: null,\n  warnings: {}, errors: {},\n})).filter(l => l.empresa.trim().length > 0);\nreturn [{ json: { leads, fileName } }];"
      },
      "id": "node-6",
      "name": "Montar payload Apollo",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1340, 120]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $vars.LEADFINDER_WEBHOOK_URL }}/map",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "columns", "value": "={{ $json.columns }}" },
            { "name": "sample", "value": "={{ $json.rows.slice(0, 3) }}" }
          ]
        },
        "options": { "timeout": 15000 }
      },
      "id": "node-7",
      "name": "Fallback IA /map",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1340, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://api.openai.com/v1/chat/completions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({\n  model: 'gpt-4o-mini',\n  response_format: { type: 'json_object' },\n  temperature: 0,\n  messages: [\n    {\n      role: 'system',\n      content: 'Você é um normalizador de dados de leads empresariais brasileiros. Recebe um array de leads e retorna o mesmo array normalizado seguindo estas regras:\\n1. empresa: title case, remover sufixos desnecessários\\n2. contato: title case, apenas nome (sem cargo)\\n3. email: lowercase, sem espaços\\n4. telefone/whatsapp: formato E.164 brasileiro (+55 DDD 9XXXX-XXXX); se inválido, null\\n5. website: adicionar https:// se ausente; null se inválido\\n6. linkedin: URL completa https://linkedin.com/in/slug; null se inválido\\n7. cidade: title case, apenas nome da cidade (sem estado)\\n8. categoria: manter em inglês se for cargo executivo padrão, senão traduzir para pt-BR\\n9. resumo_analitico: gerar 1 frase descritiva se empresa + categoria disponíveis, senão null\\nRetorne EXATAMENTE o mesmo array com os mesmos campos, apenas valores normalizados. Não adicione nem remova campos. Formato: {\\\"leads\\\": [...]}'\n    },\n    {\n      role: 'user',\n      content: JSON.stringify({ leads: $json.leads })\n    }\n  ]\n}) }}",
        "options": { "timeout": 30000 }
      },
      "id": "node-8",
      "name": "Normalizar via IA",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1560, 200],
      "credentials": { "httpHeaderAuth": { "id": "CONFIGURE_OPENAI_CREDENTIAL", "name": "OpenAI API Key" } }
    },
    {
      "parameters": {
        "jsCode": "// Extrai leads normalizados da resposta OpenAI e prepara payload final\nconst fileName = $('Montar payload Apollo').first()?.json?.fileName\n               || $('Fallback IA /map').first()?.json?.fileName\n               || 'unknown.csv';\n\nconst rawContent = $input.first().json.choices[0].message.content;\nlet normalizedLeads;\ntry {\n  normalizedLeads = JSON.parse(rawContent).leads;\n} catch {\n  throw new Error('OpenAI retornou JSON inválido: ' + rawContent.slice(0, 200));\n}\n\nreturn [{ json: {\n  leads: normalizedLeads,\n  fileName,\n  metadata: { source: 'google_drive', filename: fileName },\n  options: { defaultOrigem: 'apollo' }\n} }];"
      },
      "id": "node-9",
      "name": "Montar payload final",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1780, 200]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $vars.LEADFINDER_WEBHOOK_URL }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ leads: $json.leads, metadata: $json.metadata, options: $json.options }) }}",
        "options": { "timeout": 60000 }
      },
      "id": "node-10",
      "name": "POST Webhook LeadFinder",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [2000, 200],
      "credentials": { "httpHeaderAuth": { "id": "CONFIGURE_API_KEY_CREDENTIAL", "name": "LeadFinder API Key" } }
    },
    {
      "parameters": {
        "operation": "move",
        "fileId": { "__rl": true, "value": "={{ $('Google Drive Trigger').first().json.id }}", "mode": "id" },
        "folderId": { "__rl": true, "value": "={{ $vars.APOLLO_PROCESSED_FOLDER_ID }}", "mode": "id" },
        "options": {
          "fileName": "={{ new Date().toISOString().slice(0,16).replace('T','_') }}_{{ $('Google Drive Trigger').first().json.name }}"
        }
      },
      "id": "node-11",
      "name": "Mover → Processados",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [2220, 200],
      "credentials": { "googleDriveOAuth2Api": { "id": "CONFIGURE_GOOGLE_OAUTH", "name": "Google Drive" } }
    },
    {
      "parameters": {
        "operation": "move",
        "fileId": { "__rl": true, "value": "={{ $('Google Drive Trigger').first().json.id }}", "mode": "id" },
        "folderId": { "__rl": true, "value": "={{ $vars.APOLLO_ERRORS_FOLDER_ID }}", "mode": "id" },
        "options": {}
      },
      "id": "node-err",
      "name": "Mover → Erros",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [680, 440],
      "credentials": { "googleDriveOAuth2Api": { "id": "CONFIGURE_GOOGLE_OAUTH", "name": "Google Drive" } }
    }
  ],
  "connections": {
    "Google Drive Trigger": { "main": [[{ "node": "Filtrar CSV/XLSX", "type": "main", "index": 0 }]] },
    "Filtrar CSV/XLSX": {
      "main": [
        [{ "node": "Download File", "type": "main", "index": 0 }],
        [{ "node": "Mover → Erros", "type": "main", "index": 0 }]
      ]
    },
    "Download File":         { "main": [[{ "node": "Parse + Confidence",  "type": "main", "index": 0 }]] },
    "Parse + Confidence":    { "main": [[{ "node": "Confidence >= 0.7?",  "type": "main", "index": 0 }]] },
    "Confidence >= 0.7?": {
      "main": [
        [{ "node": "Montar payload Apollo", "type": "main", "index": 0 }],
        [{ "node": "Fallback IA /map",      "type": "main", "index": 0 }]
      ]
    },
    "Montar payload Apollo": { "main": [[{ "node": "Normalizar via IA",    "type": "main", "index": 0 }]] },
    "Fallback IA /map":      { "main": [[{ "node": "Normalizar via IA",    "type": "main", "index": 0 }]] },
    "Normalizar via IA":     { "main": [[{ "node": "Montar payload final", "type": "main", "index": 0 }]] },
    "Montar payload final":  { "main": [[{ "node": "POST Webhook LeadFinder", "type": "main", "index": 0 }]] },
    "POST Webhook LeadFinder": { "main": [[{ "node": "Mover → Processados","type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" },
  "staticData": null,
  "meta": { "templateCredsSetupCompleted": false },
  "pinData": {}
}
```

- [ ] **Step 2: Configurar variáveis no n8n antes de importar**

No painel n8n → Settings → Variables, criar:

| Variável | Valor |
|----------|-------|
| `APOLLO_FOLDER_ID` | ID da pasta "Apollo Exports" no Google Drive |
| `APOLLO_PROCESSED_FOLDER_ID` | ID da subpasta "Processados" |
| `APOLLO_ERRORS_FOLDER_ID` | ID da subpasta "Erros" |
| `LEADFINDER_WEBHOOK_URL` | `https://prospect-pulse-54.vercel.app/api/leads/import/webhook` |

- [ ] **Step 3: Criar credenciais no n8n**

**Credencial 1 — LeadFinder API Key:**
- n8n → Credentials → New → HTTP Header Auth
- Name: `LeadFinder API Key`
- Header Name: `x-api-key`
- Header Value: key gerada em Settings → Integrações → Gerar Chave

**Credencial 2 — OpenAI API Key:**
- n8n → Credentials → New → HTTP Header Auth
- Name: `OpenAI API Key`
- Header Name: `Authorization`
- Header Value: `Bearer sk-...` (chave OpenAI do projeto)

**Credencial 3 — Google Drive OAuth2:**
- n8n → Credentials → New → Google Drive OAuth2
- Seguir fluxo OAuth2 com a conta Google que tem acesso à pasta

- [ ] **Step 4: Importar workflow no n8n**

n8n → Workflows → Import → colar conteúdo do JSON → Save.

Após importar, atualizar cada nó com credencial `CONFIGURE_*`:
- Todos os nós Google Drive: selecionar credencial Google Drive OAuth2
- Nó "Normalizar via IA": selecionar credencial `OpenAI API Key`
- Nó "POST Webhook LeadFinder": selecionar credencial `LeadFinder API Key`

→ Activate workflow.

- [ ] **Step 5: Commit**

```bash
git add docs/n8n/google-drive-apollo-workflow.json
git commit -m "feat(f18): workflow n8n Google Drive → Apollo → LeadFinder (11 nós com normalização IA)"
```

---

## Task 10: Deploy e validação

- [ ] **Step 1: Rodar suite completa de testes**

```bash
npx vitest run
```

Esperado: todos os testes passando.

- [ ] **Step 2: Build local**

```bash
npm run build 2>&1 | tail -20
```

Esperado: `✓ Compiled successfully` sem erros (warnings são OK).

- [ ] **Step 3: Deploy para produção**

```bash
cd C:\Projects\prospect-pulse-54
vercel --prod --yes 2>&1 | tail -8
```

Esperado: `Aliased: https://prospect-pulse-54.vercel.app`

- [ ] **Step 4: Push para remote**

```bash
git push origin main
```

- [ ] **Step 5: Validação manual — histórico na UI**

1. Acessar Settings → rolar até "Histórico de Importações"
2. Deve aparecer sem erros (tabela vazia ou com importações anteriores)
3. Disparar um import manual via modal → recarregar Settings → novo registro aparece com `source: Manual`

- [ ] **Step 6: Validação do banner em Leads**

1. Acessar `/leads` — banner deve estar visível se houver importação nas últimas 24h
2. Clicar "Ver histórico →" — deve navegar para `/settings?tab=integrations#import-history` com scroll automático

- [ ] **Step 7: Validação do workflow n8n**

1. Ativar o workflow no n8n
2. Fazer upload de um CSV Apollo na pasta "Apollo Exports" do Google Drive
3. Aguardar até 1 minuto (trigger polling)
4. Verificar no LeadFinder: novos leads aparecem com `origem: apollo`
5. Verificar em Settings → Histórico: novo registro com `source: Drive` e filename do CSV
6. Verificar no Google Drive: arquivo movido para "Processados/"

- [ ] **Step 8: Salvar contexto de sessão**

```bash
python "C:/Users/Dell/.claude/scripts/session-focus.py" \
  --done "F18 completa: import_history, ImportHistoryPanel, banner Leads, workflow n8n Google Drive" \
  --pending "Configurar Google OAuth no n8n + IDs das pastas do Drive + ativar workflow" \
  --focus "LeadFinder Pro — F18 em produção"
```
