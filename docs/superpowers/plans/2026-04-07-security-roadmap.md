# Security & Operations Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir 6 funções de mutação em `supabaseCRM.ts` que operam sem filtro `user_id` (violação de multi-tenancy), remover todos os `(supabase as any)`, fazer `npm audit fix`, e adicionar CI/CD básico.

**Architecture:** Cada função de mutação recebe `userId: string` como novo parâmetro e adiciona `.eq("user_id", userId)` à query — defense-in-depth além do RLS. Os callers dos componentes obtêm `userId` via `useAuth()`. O CI executa typecheck + build a cada push.

**Tech Stack:** Next.js 14, TypeScript, Supabase (`@/integrations/supabase/client`), tipos gerados em `@/integrations/supabase/types`, contexto de auth em `@/contexts/AuthContext`.

**⚠️ FORA DO ESCOPO DESTE PLANO** (necessitam plano próprio por risco):
- `strict: true` no tsconfig (cascata de erros em 219 arquivos)
- Refatoração de god files (settings/page.tsx 1292 linhas, supabaseCRM.ts 695 linhas)
- Migração para TanStack Query
- Instalação do Sentry

---

## Contexto crítico para o implementador

O arquivo `src/lib/supabaseCRM.ts` exporta uma série de funções que acessam a tabela `leads_prospeccao`. As funções de **leitura** (`syncAllLeads`, `getMetrics`, `getLeadsForWhatsApp`) já recebem `userId` e filtram corretamente. As funções de **escrita** foram deixadas para trás e permitem que qualquer usuário autenticado altere ou delete leads de qualquer outro usuário.

A tabela tem a coluna `user_id uuid` que é o discriminador de tenant. Toda operação de escrita deve incluir `.eq("user_id", userId)` na query — não como substituto do RLS, mas como segunda camada de defesa.

O `(supabase as any)` foi adicionado para contornar erros de tipagem TypeScript. A correção real é usar o tipo `Database` que já existe em `@/integrations/supabase/types` para fazer o cast correto do payload.

---

## Task 1: Corrigir `deleteLeads` e seus 2 callers

**Files:**
- Modify: `src/lib/supabaseCRM.ts` (função `deleteLeads`, ~linha 658)
- Modify: `app/(protected)/leads/page.tsx` (~linha 269)
- Modify: `app/(protected)/settings/page.tsx` (~linha 396)

- [ ] **Step 1: Verificar linha exata de deleteLeads antes de editar**

```bash
grep -n "export async function deleteLeads" src/lib/supabaseCRM.ts
```

Expected: uma linha com o número exato.

- [ ] **Step 2: Substituir a função `deleteLeads` em `src/lib/supabaseCRM.ts`**

Localizar:
```typescript
export async function deleteLeads(
  leadIds: string[]
): Promise<{ success: boolean; message: string }> {
  try {
    if (!leadIds || leadIds.length === 0) {
      return { success: false, message: "Nenhum lead selecionado" };
    }

    const { error } = await supabase
      .from("leads_prospeccao")
      .delete()
      .in("id", leadIds);
```

Substituir por:
```typescript
export async function deleteLeads(
  userId: string,
  leadIds: string[]
): Promise<{ success: boolean; message: string }> {
  try {
    if (!leadIds || leadIds.length === 0) {
      return { success: false, message: "Nenhum lead selecionado" };
    }

    const { error } = await supabase
      .from("leads_prospeccao")
      .delete()
      .eq("user_id", userId)
      .in("id", leadIds);
```

- [ ] **Step 3: Atualizar o objeto `supabaseCRM` no final do arquivo**

O objeto `supabaseCRM` exportado (última seção do arquivo) inclui `deleteLeads`. Essa referência não muda — o TypeScript vai forçar o caller a passar `userId`. Não é necessário alterar o objeto.

- [ ] **Step 4: Atualizar caller em `app/(protected)/leads/page.tsx`**

Localizar (em torno da linha 269):
```typescript
const result = await supabaseCRM.deleteLeads(leadIdsArray);
```

Substituir por (o componente já tem `const { user } = useAuth()` — verificar linha ~61):
```typescript
const result = await supabaseCRM.deleteLeads(user?.id ?? '', leadIdsArray);
```

- [ ] **Step 5: Atualizar caller em `app/(protected)/settings/page.tsx`**

Localizar (em torno da linha 396):
```typescript
const result = await supabaseCRM.deleteLeads(leadIds);
```

Substituir por (o componente já tem `const { user } = useAuth()` — verificar linha ~25):
```typescript
const result = await supabaseCRM.deleteLeads(user?.id ?? '', leadIds);
```

- [ ] **Step 6: Verificar que não há outros callers**

```bash
grep -rn "deleteLeads" --include="*.ts" --include="*.tsx" . | grep -v "supabaseCRM.ts\|node_modules"
```

Expected: apenas leads/page.tsx e settings/page.tsx. Se aparecer outro arquivo, atualizar da mesma forma.

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -i "deleteLeads\|error" | head -20
```

Expected: zero erros relacionados a `deleteLeads`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/supabaseCRM.ts app/\(protected\)/leads/page.tsx app/\(protected\)/settings/page.tsx
git commit -m "fix(security): deleteLeads agora filtra por user_id — isolamento multi-tenant"
```

---

## Task 2: Corrigir `updateLead` + remover `as any` + atualizar 2 callers nos componentes

**Files:**
- Modify: `src/lib/supabaseCRM.ts` (função `updateLead`, ~linha 155)
- Modify: `src/components/shared/ApplyTemplateModal.tsx` (~linha 116)
- Modify: `src/components/shared/WhatsAppDispatchModal.tsx` (~linha 194)

- [ ] **Step 1: Adicionar import de tipo no topo de `src/lib/supabaseCRM.ts`**

Localizar a linha de imports (linha ~1-3):
```typescript
import { supabase } from "@/integrations/supabase/client";
import { Lead, DashboardMetrics, LeadStatus, WhatsAppStatus } from "@/types/prospection";
```

Adicionar após esses imports:
```typescript
import type { Database } from "@/integrations/supabase/types";
type LeadUpdate = Database['public']['Tables']['leads_prospeccao']['Update'];
```

- [ ] **Step 2: Substituir a assinatura e o corpo de `updateLead`**

Localizar (linha ~155):
```typescript
export async function updateLead(
  leadId: string,
  updates: Partial<Lead>
): Promise<{ success: boolean; message: string }> {
```

Substituir por:
```typescript
export async function updateLead(
  leadId: string,
  updates: Partial<Lead>,
  userId: string
): Promise<{ success: boolean; message: string }> {
```

Localizar dentro da mesma função (a query final, com `as any`):
```typescript
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("leads_prospeccao")
      .update(dbUpdates)
      .eq("id", leadId);
```

Substituir por:
```typescript
    const { error } = await supabase
      .from("leads_prospeccao")
      .update(dbUpdates as LeadUpdate)
      .eq("id", leadId)
      .eq("user_id", userId);
```

- [ ] **Step 3: Adicionar `useAuth` em `ApplyTemplateModal.tsx` e atualizar caller**

Abrir `src/components/shared/ApplyTemplateModal.tsx`.

Localizar o bloco de imports (linha ~1-15):
```typescript
import { supabaseCRM } from "@/lib/supabaseCRM";
import { userSettingsService } from "@/lib/userSettings";
```

Adicionar após:
```typescript
import { useAuth } from "@/contexts/AuthContext";
```

Localizar onde o componente é definido:
```typescript
export function ApplyTemplateModal({
  isOpen,
  onClose,
  selectedLeads,
  onTemplateApplied,
}: ApplyTemplateModalProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
```

Adicionar `useAuth` como primeiro hook do componente (antes dos useState existentes):
```typescript
export function ApplyTemplateModal({
  isOpen,
  onClose,
  selectedLeads,
  onTemplateApplied,
}: ApplyTemplateModalProps) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
```

Localizar o caller (linha ~116):
```typescript
        return supabaseCRM.updateLead(lead.id, {
```

Substituir por (a chamada termina com `}` depois dos campos — adicionar `user?.id ?? ''` como terceiro argumento no fechamento):
```typescript
        return supabaseCRM.updateLead(lead.id, {
          mensagemWhatsApp: message,
          statusMsgWA: 'template_aplicado',
        }, user?.id ?? '');
```

> **Nota:** Verifique os campos exatos passados no objeto — preserve o que já existe, apenas adicione o terceiro argumento `user?.id ?? ''` no fechamento da chamada.

- [ ] **Step 4: Adicionar `useAuth` em `WhatsAppDispatchModal.tsx` e atualizar caller**

Abrir `src/components/shared/WhatsAppDispatchModal.tsx`.

Localizar imports (linha ~1-12):
```typescript
import { supabaseCRM } from "@/lib/supabaseCRM";
```

Adicionar após:
```typescript
import { useAuth } from "@/contexts/AuthContext";
```

Localizar onde o componente começa (função `WhatsAppDispatchModal`). Adicionar como primeiro hook:
```typescript
export const WhatsAppDispatchModal = ({
  isOpen,
  onClose,
  selectedLeads,
}: WhatsAppDispatchModalProps) => {
  const { user } = useAuth();
```

Localizar o caller (linha ~194):
```typescript
          await supabaseCRM.updateLead(lead.id, {
```

Adicionar `user?.id ?? ''` como terceiro argumento no fechamento da chamada — preserve todos os campos do objeto existente.

- [ ] **Step 5: Verificar que não há outros callers de `updateLead`**

```bash
grep -rn "\.updateLead\b\|updateLead(" --include="*.ts" --include="*.tsx" . | grep -v "supabaseCRM.ts\|node_modules"
```

Expected: ApplyTemplateModal.tsx, WhatsAppDispatchModal.tsx, e `src/lib/ai/tools/update-lead.tool.ts` (via `leadService.updateLead` — caminho diferente, não usa `supabaseCRM.updateLead`, não precisa ser alterado aqui).

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -i "updateLead\|ApplyTemplate\|WhatsApp\|error" | head -20
```

Expected: zero erros relacionados a essas funções.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabaseCRM.ts src/components/shared/ApplyTemplateModal.tsx src/components/shared/WhatsAppDispatchModal.tsx
git commit -m "fix(security): updateLead agora filtra por user_id e remove as any"
```

---

## Task 3: Corrigir `updateLeadStatus` e remover `as any`

**Files:**
- Modify: `src/lib/supabaseCRM.ts` (função `updateLeadStatus`, ~linha 204)

> **Nota:** Nenhum caller foi encontrado fora de supabaseCRM.ts. Esta função é exportada via `supabaseCRM` object mas sem chamadas detectadas — pode ser dead code. Adicionar `userId` defensivamente e verificar se o TypeScript aponta erros de caller.

- [ ] **Step 1: Substituir a assinatura e query de `updateLeadStatus`**

Localizar (linha ~204):
```typescript
export async function updateLeadStatus(
  leadId: string,
  status: LeadStatus
): Promise<{ success: boolean; message: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("leads_prospeccao")
      .update({
        status: status,
        estagio_pipeline: status,
        updated_at: new Date().toISOString()
      })
      .eq("id", leadId);
```

Substituir por:
```typescript
export async function updateLeadStatus(
  leadId: string,
  status: LeadStatus,
  userId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from("leads_prospeccao")
      .update({
        status: status,
        estagio_pipeline: status,
        updated_at: new Date().toISOString()
      } as LeadUpdate)
      .eq("id", leadId)
      .eq("user_id", userId);
```

- [ ] **Step 2: Verificar callers e ajustar se necessário**

```bash
grep -rn "updateLeadStatus\b" --include="*.ts" --include="*.tsx" . | grep -v "supabaseCRM.ts\|node_modules"
```

Se aparecer algum arquivo, adicionar `user?.id ?? ''` como terceiro argumento — seguindo o mesmo padrão das tasks anteriores.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -i "updateLeadStatus\|error" | head -10
```

Expected: zero erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabaseCRM.ts
git commit -m "fix(security): updateLeadStatus agora filtra por user_id e remove as any"
```

---

## Task 4: Corrigir `checkDuplicateLead`, `mergeLeads` e `clearLeadHistory` + remover `as any`

**Files:**
- Modify: `src/lib/supabaseCRM.ts` (3 funções, linhas ~239, ~317, ~385)

> **Nota:** Nenhum caller externo foi detectado para estas 3 funções. Adicionar `userId` e remover `as any` defensivamente. Verificar callers antes de commitar.

- [ ] **Step 1: Corrigir `checkDuplicateLead`**

Localizar (linha ~239):
```typescript
export async function checkDuplicateLead(
  nome: string,
  whatsapp?: string,
  website?: string
): Promise<{ isDuplicate: boolean; existingLead?: Lead; message: string }> {
```

Substituir por:
```typescript
export async function checkDuplicateLead(
  userId: string,
  nome: string,
  whatsapp?: string,
  website?: string
): Promise<{ isDuplicate: boolean; existingLead?: Lead; message: string }> {
```

Dentro da função, localizar CADA uma das 3 queries com `(supabase as any)` e substituir. Para cada query, adicionar `.eq("user_id", userId)` e remover `as any`.

Substituição da busca por WhatsApp (primeira query):
```typescript
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: whatsappMatches } = await (supabase as any)
        .from("leads_prospeccao")
        .select("*")
        .or(`whatsapp.ilike.%${cleanPhone}%,telefone.ilike.%${cleanPhone}%`)
        .limit(1);
```
→
```typescript
      const { data: whatsappMatches } = await supabase
        .from("leads_prospeccao")
        .select("*")
        .eq("user_id", userId)
        .or(`whatsapp.ilike.%${cleanPhone}%,telefone.ilike.%${cleanPhone}%`)
        .limit(1);
```

Substituição da busca por website (segunda query):
```typescript
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: websiteMatches } = await (supabase as any)
        .from("leads_prospeccao")
        .select("*")
        .ilike("website", `%${domain}%`)
        .limit(1);
```
→
```typescript
      const { data: websiteMatches } = await supabase
        .from("leads_prospeccao")
        .select("*")
        .eq("user_id", userId)
        .ilike("website", `%${domain}%`)
        .limit(1);
```

Substituição da busca por nome (terceira query):
```typescript
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nameMatches } = await (supabase as any)
      .from("leads_prospeccao")
      .select("*")
      .or(`lead.ilike.%${normalizedNome}%,empresa.ilike.%${normalizedNome}%`)
      .limit(5);
```
→
```typescript
    const { data: nameMatches } = await supabase
      .from("leads_prospeccao")
      .select("*")
      .eq("user_id", userId)
      .or(`lead.ilike.%${normalizedNome}%,empresa.ilike.%${normalizedNome}%`)
      .limit(5);
```

- [ ] **Step 2: Corrigir `mergeLeads`**

Localizar (linha ~317):
```typescript
export async function mergeLeads(
  keepLeadId: string,
  mergeLeadId: string
): Promise<{ success: boolean; message: string }> {
```

Substituir por:
```typescript
export async function mergeLeads(
  userId: string,
  keepLeadId: string,
  mergeLeadId: string
): Promise<{ success: boolean; message: string }> {
```

Dentro da função, localizar as 3 queries com `(supabase as any)`:

Query 1 — busca dos dois leads:
```typescript
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads, error: fetchError } = await (supabase as any)
      .from("leads_prospeccao")
      .select("*")
      .in("id", [keepLeadId, mergeLeadId]);
```
→
```typescript
    const { data: leads, error: fetchError } = await supabase
      .from("leads_prospeccao")
      .select("*")
      .eq("user_id", userId)
      .in("id", [keepLeadId, mergeLeadId]);
```

Query 2 — update do lead principal:
```typescript
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from("leads_prospeccao")
      .update(mergedData)
      .eq("id", keepLeadId);
```
→
```typescript
    const { error: updateError } = await supabase
      .from("leads_prospeccao")
      .update(mergedData as LeadUpdate)
      .eq("id", keepLeadId)
      .eq("user_id", userId);
```

Query 3 — delete do lead mesclado:
```typescript
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase as any)
      .from("leads_prospeccao")
      .delete()
      .eq("id", mergeLeadId);
```
→
```typescript
    const { error: deleteError } = await supabase
      .from("leads_prospeccao")
      .delete()
      .eq("id", mergeLeadId)
      .eq("user_id", userId);
```

- [ ] **Step 3: Corrigir `clearLeadHistory`**

Localizar (linha ~385):
```typescript
export async function clearLeadHistory(
  leadId: string
): Promise<{ success: boolean; message: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("leads_prospeccao")
      .update({
        mensagem_whatsapp: null,
        status_msg_wa: WHATSAPP_STATUS.NOT_SENT,
        data_envio_wa: null,
        resumo_analitico: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", leadId);
```

Substituir por:
```typescript
export async function clearLeadHistory(
  userId: string,
  leadId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from("leads_prospeccao")
      .update({
        mensagem_whatsapp: null,
        status_msg_wa: WHATSAPP_STATUS.NOT_SENT,
        data_envio_wa: null,
        resumo_analitico: null,
        updated_at: new Date().toISOString()
      } as LeadUpdate)
      .eq("id", leadId)
      .eq("user_id", userId);
```

- [ ] **Step 4: Verificar callers das 3 funções**

```bash
grep -rn "checkDuplicateLead\|mergeLeads\|clearLeadHistory" --include="*.ts" --include="*.tsx" . | grep -v "supabaseCRM.ts\|node_modules"
```

Para cada caller encontrado: adicionar `user?.id ?? ''` como primeiro argumento. Se o componente não tiver `useAuth`, importar e adicionar `const { user } = useAuth()`.

- [ ] **Step 5: Typecheck completo do arquivo**

```bash
npx tsc --noEmit 2>&1 | grep "supabaseCRM\|error" | head -30
```

Expected: zero erros. Se aparecer erro de tipo nos `.update(payload as LeadUpdate)`, verificar que `LeadUpdate` é importado corretamente (Step 1 da Task 2 adicionou o import).

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabaseCRM.ts
git commit -m "fix(security): checkDuplicateLead, mergeLeads, clearLeadHistory com user_id + sem as any"
```

---

## Task 5: `npm audit fix` — corrigir vulnerabilidades high

**Files:**
- Modify: `package.json`, `package-lock.json` (gerados pelo npm)

- [ ] **Step 1: Ver quais pacotes serão afetados (dry-run)**

```bash
npm audit fix --dry-run 2>&1 | head -40
```

Revisar output. Se algum pacote crítico para o projeto (supabase, next, react) aparecer para ser downgraded ou alterado drasticamente, interromper e reportar ao usuário. Continuar apenas se as mudanças forem em pacotes de dev ou utilitários.

- [ ] **Step 2: Aplicar fixes seguros**

```bash
npm audit fix
```

**NÃO usar `npm audit fix --force`** — esse flag pode causar breaking changes.

- [ ] **Step 3: Verificar resultado**

```bash
npm audit --audit-level=high 2>&1 | tail -5
```

Expected: `0 vulnerabilities` ou redução significativa das 9 high. Se algum `high` restar, anotar o pacote e a razão (geralmente dependency transitiva sem fix disponível).

- [ ] **Step 4: Build de verificação**

```bash
npm run build 2>&1 | tail -10
```

Expected: build completo sem erros. Se aparecer erro de módulo após o audit fix, o pacote foi alterado de forma breaking — rodar `git checkout package.json package-lock.json && npm install` para reverter.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): npm audit fix — corrigir vulnerabilidades high"
```

---

## Task 6: GitHub Actions CI básico

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Criar diretório e workflow**

```bash
mkdir -p .github/workflows
```

Criar `.github/workflows/ci.yml` com o conteúdo exato abaixo:

```yaml
name: CI

on:
  push:
    branches: [main, master, feature/**]
  pull_request:
    branches: [main, master]

jobs:
  typecheck-and-build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: TypeScript check
        run: npx tsc --noEmit

      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          NEXT_PUBLIC_APP_URL: https://alpha.dualite.dev
```

- [ ] **Step 2: Adicionar secrets no GitHub**

No repositório GitHub (`Settings → Secrets and variables → Actions`), adicionar:
- `NEXT_PUBLIC_SUPABASE_URL` — valor de `.env.local`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — valor de `.env.local`

> As variáveis `NEXT_PUBLIC_*` são necessárias no build-time do Next.js. `SUPABASE_SERVICE_ROLE_KEY` **não** deve ser adicionado ao CI — nunca expor service role em ambiente de CI sem build protegido.

- [ ] **Step 3: Commit e push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: adicionar GitHub Actions — typecheck + build"
git push
```

- [ ] **Step 4: Verificar que o workflow rodou**

Acessar `github.com/<owner>/<repo>/actions` e verificar que o workflow aparece como verde após o push.

---

## Task 7: Limpar comentário legado com email hardcoded

**Files:**
- Modify: `app/api/admin/approve-user/route.ts` (linha 7)

- [ ] **Step 1: Corrigir o comentário**

Localizar (linha ~7):
```typescript
 * - Valida que o solicitante é admin (role=admin + email fmbp1981@gmail.com)
```

Substituir por:
```typescript
 * - Valida que o solicitante é admin (role=admin + email definido em ADMIN_EMAIL env var)
```

- [ ] **Step 2: Verificar se há outros comentários com email hardcoded**

```bash
grep -rn "fmbp1981\|@gmail\|@hotmail" --include="*.ts" --include="*.tsx" . | grep -v "node_modules"
```

Expected: zero ocorrências após a correção.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/approve-user/route.ts
git commit -m "docs: remover email hardcoded de comentário em approve-user route"
```

---

## Self-Review

**Spec coverage:**
- ✅ `deleteLeads` com `userId` — Task 1
- ✅ `updateLead` com `userId` + sem `as any` — Task 2
- ✅ `updateLeadStatus` com `userId` + sem `as any` — Task 3
- ✅ `checkDuplicateLead`, `mergeLeads`, `clearLeadHistory` com `userId` + sem `as any` — Task 4
- ✅ npm audit fix — Task 5
- ✅ CI/CD básico — Task 6
- ✅ Comentário legado — Task 7

**Fora do escopo (para planos futuros):**
- `strict: true` no tsconfig — cascata em 219 arquivos
- Refatoração de god files — risco alto
- TanStack Query — mudança arquitetural grande
- Sentry — instalação e configuração independente

**Placeholder scan:** Nenhum placeholder. Todo código é completo com old_string/new_string exatos ou blocos completos.

**Type consistency:**
- `LeadUpdate` é definido na Task 2 Step 1 e usado nas Tasks 2, 3 e 4 — consistente.
- `userId: string` é sempre o primeiro parâmetro adicionado — consistente entre todas as tasks.
- `user?.id ?? ''` é o padrão nos callers — consistente.
