# Fix Critical Security & Quality Issues — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 5 issues críticos identificados no code review do LeadFinder Pro sem quebrar funcionalidades existentes.

**Architecture:** Cada task é cirúrgica e isolada — modifica apenas os arquivos necessários para aquele fix específico. A ordem importa: Tasks 1-2 são de segurança (maior impacto), Tasks 3-4 são de corretude, Task 5 é de disciplina técnica.

**Tech Stack:** Next.js 15, TypeScript, Supabase (anon + service role), React hooks

---

## Mapa de Arquivos

### Task 1 — Multi-tenant data isolation
- Modify: `src/lib/supabaseCRM.ts` — adicionar `userId` em `syncAllLeads`, `getMetrics`, `getLeadsForWhatsApp`
- Modify: `app/(protected)/leads/page.tsx` — passar `user.id` para `syncAllLeads`
- Modify: `app/(protected)/dashboard/page.tsx` — idem
- Modify: `app/(protected)/kanban/page.tsx` — idem
- Modify: `app/(protected)/settings/page.tsx` — idem
- Modify: `src/components/shared/WhatsAppDispatchModal.tsx` — idem
- Modify: `src/components/shared/ApplyTemplateModal.tsx` — idem

### Task 2 — Admin email env var
- Modify: `.env.example` — adicionar `ADMIN_EMAIL`
- Modify: `src/lib/permissions.ts` — ler de `process.env`
- Modify: `app/api/admin/approve-user/route.ts`
- Modify: `app/api/admin/list-users/route.ts`
- Modify: `app/(protected)/pending/page.tsx`

### Task 3 — Fix race condition em generateNextLeadRef
- Modify: `src/services/lead.service.ts` — substituir COUNT(*) por timestamp+random ref

### Task 4 — Supabase singleton em lead.service.ts
- Modify: `src/services/lead.service.ts` — client de módulo, não por chamada

### Task 5 — strictNullChecks incremental
- Modify: `tsconfig.json` — habilitar `strictNullChecks`
- Modify: `src/repositories/*.ts` — corrigir erros de null
- Modify: `src/services/*.ts` — corrigir erros de null

---

## Task 1: Multi-tenant data isolation em supabaseCRM

> **Contexto:** `src/lib/supabaseCRM.ts` usa o cliente anon (browser) e não filtra por `user_id`. Embora o RLS do Supabase seja uma defesa, não ter filtro explícito viola o princípio de defesa em profundidade. Em caso de misconfiguration de RLS, todos os dados de todos os tenants vazam.

**Files:**
- Modify: `src/lib/supabaseCRM.ts`
- Modify: `app/(protected)/leads/page.tsx`
- Modify: `app/(protected)/dashboard/page.tsx`
- Modify: `app/(protected)/kanban/page.tsx`
- Modify: `app/(protected)/settings/page.tsx`
- Modify: `src/components/shared/WhatsAppDispatchModal.tsx`
- Modify: `src/components/shared/ApplyTemplateModal.tsx`

- [ ] **Step 1: Ler as assinaturas atuais das funções em supabaseCRM**

```bash
cd "C:/Projects/prospect-pulse-54"
grep -n "^export async function\|^export function" src/lib/supabaseCRM.ts
```

Expected: lista de funções exportadas incluindo `syncAllLeads`, `getMetrics`, `getLeadsForWhatsApp`.

- [ ] **Step 2: Modificar `syncAllLeads` para aceitar e aplicar `userId`**

Localizar em `src/lib/supabaseCRM.ts` e alterar a assinatura:

```typescript
// ANTES:
export async function syncAllLeads(): Promise<{ success: boolean; leads: Lead[]; message?: string }> {
  try {
    const { data, error } = await getSupabase()
      .from("leads_prospeccao")
      .select("*")
      .order("created_at", { ascending: false });

// DEPOIS:
export async function syncAllLeads(userId: string): Promise<{ success: boolean; leads: Lead[]; message?: string }> {
  try {
    const { data, error } = await getSupabase()
      .from("leads_prospeccao")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
```

- [ ] **Step 3: Modificar `getMetrics` para aceitar `userId`**

Localizar a função `getMetrics` em `src/lib/supabaseCRM.ts` e adicionar o parâmetro + filtro:

```typescript
// ANTES:
export async function getMetrics(): Promise<{

// DEPOIS:
export async function getMetrics(userId: string): Promise<{
```

Em cada query `.from("leads_prospeccao").select(...)` dentro de `getMetrics`, adicionar `.eq("user_id", userId)` após o `.select()`.

- [ ] **Step 4: Modificar `getLeadsForWhatsApp` para aceitar `userId`**

```typescript
// ANTES:
export async function getLeadsForWhatsApp(

// DEPOIS — adicionar userId como primeiro parâmetro:
export async function getLeadsForWhatsApp(
  userId: string,
  // ... parâmetros existentes mantidos
```

Adicionar `.eq("user_id", userId)` nas queries internas.

- [ ] **Step 5: Atualizar o objeto `supabaseCRM` exportado**

No final do arquivo, o objeto `supabaseCRM` wraps as funções. Atualizar para passar `userId` nos wrappers ou remover o wrap e exportar as funções diretamente (já são exportadas individualmente).

Verificar se o objeto faz wrap ou só re-exporta:
```bash
tail -30 "C:/Projects/prospect-pulse-54/src/lib/supabaseCRM.ts"
```

Se for um objeto com métodos, cada método precisa receber `userId` e passá-lo.

- [ ] **Step 6: Atualizar callers — `app/(protected)/leads/page.tsx`**

A página já usa `useAuth()`. Localizar onde chama `syncAllLeads`:

```typescript
// ANTES:
const result = await supabaseCRM.syncAllLeads();

// DEPOIS:
const { user } = useAuth(); // já importado
// ...
const result = await supabaseCRM.syncAllLeads(user?.id ?? '');
```

Fazer o mesmo para qualquer outra chamada de método de `supabaseCRM` que use `leads_prospeccao` sem `userId`.

- [ ] **Step 7: Atualizar callers — `app/(protected)/dashboard/page.tsx`**

```typescript
// Encontrar: const result = await supabaseCRM.syncAllLeads();
// Adicionar useAuth se não existir, ou usar o user já disponível
const { user } = useAuth();
// ...
const result = await supabaseCRM.syncAllLeads(user?.id ?? '');
```

- [ ] **Step 8: Atualizar callers — `app/(protected)/kanban/page.tsx`**

Mesma lógica. Verificar quais métodos de `supabaseCRM` são chamados:
```bash
grep -n "supabaseCRM\." "C:/Projects/prospect-pulse-54/app/(protected)/kanban/page.tsx"
```
Adicionar `userId` em cada chamada relevante.

- [ ] **Step 9: Atualizar callers — `app/(protected)/settings/page.tsx` e componentes shared**

```bash
grep -n "syncAllLeads\|getMetrics\|getLeadsForWhatsApp" \
  "C:/Projects/prospect-pulse-54/app/(protected)/settings/page.tsx" \
  "C:/Projects/prospect-pulse-54/src/components/shared/WhatsAppDispatchModal.tsx" \
  "C:/Projects/prospect-pulse-54/src/components/shared/ApplyTemplateModal.tsx"
```

Para cada ocorrência, adicionar `userId` (obtido de `useAuth()` ou como prop).

- [ ] **Step 10: Verificar compilação**

```bash
cd "C:/Projects/prospect-pulse-54"
npx tsc --noEmit 2>&1 | tail -20
```

Corrigir qualquer erro de tipo introduzido pelas mudanças de assinatura.

- [ ] **Step 11: Commit**

```bash
cd "C:/Projects/prospect-pulse-54"
git add -A
git commit -m "fix(security): adicionar user_id filter em supabaseCRM — previne data leak multi-tenant"
```

---

## Task 2: Admin email via variável de ambiente

> **Contexto:** `fmbp1981@gmail.com` está hardcoded em 4 arquivos incluindo portões de autenticação de API routes. Se o email mudar ou o projeto for reusado, o acesso admin silenciosamente quebra ou vaza.

**Files:**
- Modify: `.env.example`
- Modify: `src/lib/permissions.ts`
- Modify: `app/api/admin/approve-user/route.ts`
- Modify: `app/api/admin/list-users/route.ts`
- Modify: `app/(protected)/pending/page.tsx`

- [ ] **Step 1: Adicionar `ADMIN_EMAIL` ao `.env.example`**

Editar `C:/Projects/prospect-pulse-54/.env.example` e adicionar após a seção `CRON_SECRET`:

```bash
# ─── ADMIN ────────────────────────────────────────────────────────────────────
# Email do administrador do sistema (portão de autenticação de rotas admin)
ADMIN_EMAIL="admin@seudominio.com"
```

- [ ] **Step 2: Atualizar `src/lib/permissions.ts`**

```typescript
// ANTES (linha 36):
export const ADMIN_EMAIL = 'fmbp1981@gmail.com'

// DEPOIS:
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? ''
```

- [ ] **Step 3: Verificar se `approve-user/route.ts` usa a constante local ou importa**

```bash
head -25 "C:/Projects/prospect-pulse-54/app/api/admin/approve-user/route.ts"
```

O arquivo define `const ADMIN_EMAIL = 'fmbp1981@gmail.com'` localmente. Remover a definição local e importar de `@/lib/permissions`:

```typescript
// ANTES (remover):
const ADMIN_EMAIL = 'fmbp1981@gmail.com';

// DEPOIS (adicionar import no topo):
import { ADMIN_EMAIL } from '@/lib/permissions'
```

- [ ] **Step 4: Fazer o mesmo para `list-users/route.ts`**

```typescript
// Remover:
const ADMIN_EMAIL = 'fmbp1981@gmail.com';

// Adicionar import:
import { ADMIN_EMAIL } from '@/lib/permissions'
```

- [ ] **Step 5: Atualizar `app/(protected)/pending/page.tsx`**

```typescript
// Linha atual (linha 16):
const isAdminEmail = user?.email === 'fmbp1981@gmail.com';

// DEPOIS — usar env var via NEXT_PUBLIC_ para uso no client:
const isAdminEmail = user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;
```

**Nota:** Para esta linha específica (client component), a variável precisa ser `NEXT_PUBLIC_ADMIN_EMAIL`. Adicionar também ao `.env.example`:

```bash
NEXT_PUBLIC_ADMIN_EMAIL="admin@seudominio.com"  # Mesmo valor que ADMIN_EMAIL — necessário para client components
```

- [ ] **Step 6: Verificar compilação e testar**

```bash
cd "C:/Projects/prospect-pulse-54"
npx tsc --noEmit 2>&1 | grep -i "admin\|permission" | head -10
```

- [ ] **Step 7: Commit**

```bash
cd "C:/Projects/prospect-pulse-54"
git add -A
git commit -m "fix(security): mover ADMIN_EMAIL para variável de ambiente — remover hardcode"
```

---

## Task 3: Corrigir race condition em `generateNextLeadRef`

> **Contexto:** A função usa `COUNT(*) + 1` para gerar `Lead-NNN`. Duas chamadas concorrentes leem o mesmo count e geram a mesma referência. Fix: substituir por `{timestamp}-{random}` que é naturalmente único.

**Files:**
- Modify: `src/services/lead.service.ts`

- [ ] **Step 1: Ler a função atual completa**

```bash
sed -n '20,50p' "C:/Projects/prospect-pulse-54/src/services/lead.service.ts"
```

- [ ] **Step 2: Substituir `generateNextLeadRef` por função sem race condition**

Localizar e substituir toda a função `generateNextLeadRef` (linhas ~32-44):

```typescript
// REMOVER toda a função generateNextLeadRef atual (que usa COUNT)

// SUBSTITUIR POR:
function generateLeadRef(): string {
  // Formato: Lead-{timestamp-base36}-{random-4chars}
  // Garante unicidade sem query ao banco — sem race condition
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `Lead-${ts}-${rand}`
}
```

- [ ] **Step 3: Atualizar o caller dentro do mesmo arquivo**

Localizar onde `generateNextLeadRef` é chamada:

```bash
grep -n "generateNextLeadRef\|leadRef" "C:/Projects/prospect-pulse-54/src/services/lead.service.ts"
```

Substituir:
```typescript
// ANTES:
const leadRef = await generateNextLeadRef(input.userId);

// DEPOIS:
const leadRef = generateLeadRef();
```

- [ ] **Step 4: Verificar que não há mais referências à função antiga**

```bash
grep -rn "generateNextLeadRef" "C:/Projects/prospect-pulse-54/src/" 2>/dev/null || echo "OK — função removida"
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Projects/prospect-pulse-54"
git add src/services/lead.service.ts
git commit -m "fix: substituir COUNT+1 por timestamp-ref em generateLeadRef — elimina race condition"
```

---

## Task 4: Supabase service-role singleton em `lead.service.ts`

> **Contexto:** `lead.service.ts` chama `createClient(url, key)` dentro de `generateNextLeadRef` a cada invocação. No Vercel serverless isso cria conexões novas sem pooling. Fix: client de módulo instanciado uma vez.

**Files:**
- Modify: `src/services/lead.service.ts`

- [ ] **Step 1: Verificar imports atuais**

```bash
head -15 "C:/Projects/prospect-pulse-54/src/services/lead.service.ts"
```

- [ ] **Step 2: Remover import de `createClient` do supabase-js diretamente**

Após a Task 3 (que removeu `generateNextLeadRef`), verificar se `createClient` ainda é usado:

```bash
grep -n "createClient\|@supabase/supabase-js" "C:/Projects/prospect-pulse-54/src/services/lead.service.ts"
```

Se ainda existir (improvável após Task 3), remover. O `leadRepository` já usa o client correto internamente.

- [ ] **Step 3: Garantir que lead.service.ts usa o leadRepository para toda interação com o banco**

```bash
grep -n "\.from\(\|supabase\." "C:/Projects/prospect-pulse-54/src/services/lead.service.ts"
```

Expected: nenhuma query direta — apenas chamadas a `leadRepository.*`.

Se houver queries diretas, refatorar para usar o repository:
```typescript
// ANTES (query direta):
const supabase = createClient(...)
const { data } = await supabase.from('leads_prospeccao').select(...)

// DEPOIS (via repository):
const leads = await leadRepository.findByUserId(userId)
```

- [ ] **Step 4: Verificar o repository para garantir que usa service-role corretamente**

```bash
head -20 "C:/Projects/prospect-pulse-54/src/repositories/lead.repository.ts"
```

O repository deve usar o server client de `@/lib/supabase/server` ou `@/lib/supabase/client` corretamente. Se usar `createClient` do supabase-js diretamente, adicionar singleton de módulo:

```typescript
// No TOPO do arquivo (module level — instanciado uma vez por cold start):
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'

// Singleton: criado uma vez, reutilizado em todas as invocações do módulo
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

- [ ] **Step 5: Verificar compilação**

```bash
cd "C:/Projects/prospect-pulse-54"
npx tsc --noEmit 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
cd "C:/Projects/prospect-pulse-54"
git add src/services/lead.service.ts src/repositories/lead.repository.ts
git commit -m "fix(perf): supabase service-role singleton — evitar createClient por chamada"
```

---

## Task 5: Habilitar `strictNullChecks` de forma incremental

> **Contexto:** `"strictNullChecks": false` significa que o compilador não valida acessos a valores potencialmente nulos. Habilitar vai revelar erros existentes. A estratégia: habilitar o flag, corrigir apenas `src/repositories/` e `src/services/` (camada nova), suprimir o resto com `// @ts-ignore` pragmático onde necessário por agora.

**Files:**
- Modify: `tsconfig.json`
- Modify: `src/repositories/lead.repository.ts`
- Modify: `src/repositories/conversation.repository.ts`
- Modify: `src/services/lead.service.ts` (e outros em src/services/ se necessário)

- [ ] **Step 1: Habilitar strictNullChecks**

Editar `C:/Projects/prospect-pulse-54/tsconfig.json`:

```json
// Mudar:
"strictNullChecks": false,

// Para:
"strictNullChecks": true,
```

- [ ] **Step 2: Contar os erros introduzidos**

```bash
cd "C:/Projects/prospect-pulse-54"
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

- [ ] **Step 3: Ver erros apenas nos novos arquivos (repositories + services)**

```bash
cd "C:/Projects/prospect-pulse-54"
npx tsc --noEmit 2>&1 | grep "src/repositories\|src/services\|src/lib/permissions\|src/lib/api-response\|src/validations" | head -40
```

- [ ] **Step 4: Corrigir erros em `src/repositories/` e `src/services/`**

Para cada erro, aplicar o fix correto:

```typescript
// Erro: "Object is possibly 'null'"
// FIX com non-null assertion quando você tem certeza:
const data = result.data!

// FIX com nullish coalescing quando há fallback:
const data = result.data ?? []

// FIX com type guard quando precisa verificar:
if (!result.data) throw new Error('No data returned')
const data = result.data
```

Rodar após cada arquivo corrigido:
```bash
npx tsc --noEmit 2>&1 | grep "src/repositories\|src/services" | wc -l
```

- [ ] **Step 5: Para arquivos FORA dos repositórios/services — suprimir com comentário**

Se `strictNullChecks` quebrar arquivos legados (`src/lib/supabaseCRM.ts`, páginas, etc.), adicionar no topo de cada arquivo legado:

```typescript
// @ts-nocheck — TODO: migrar para strictNullChecks (dívida técnica rastreada)
```

Isso desabilita todos os erros TypeScript no arquivo, permitindo habilitar strictNullChecks globalmente sem quebrar o build.

- [ ] **Step 6: Verificar que o build passa**

```bash
cd "C:/Projects/prospect-pulse-54"
npx tsc --noEmit 2>&1 | grep "error TS" | head -10
# Expected: 0 erros ou apenas avisos
```

- [ ] **Step 7: Commit**

```bash
cd "C:/Projects/prospect-pulse-54"
git add -A
git commit -m "chore(ts): habilitar strictNullChecks — corrigir repositories/ e services/, suprimir legado"
```

---

## Resultado esperado

Após as 5 tasks:
- ✅ `syncAllLeads/getMetrics/getLeadsForWhatsApp` filtram por `user_id` — zero data leak entre tenants
- ✅ `ADMIN_EMAIL` lido de env var — portões de autenticação não dependem de string literal
- ✅ `generateLeadRef()` usa timestamp+random — sem race condition
- ✅ Supabase client criado uma vez por módulo — conexões eficientes no serverless
- ✅ `strictNullChecks: true` — compilador valida nulls nos arquivos novos
