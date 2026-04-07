# IntelliX Workflow Reorganization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar o projeto `prospect-pulse-54` para conformidade com o workflow IntelliX (`MASTER-ARCHITECTURE.md`), sem quebrar nenhuma funcionalidade existente.

**Architecture:** Aplicar a estrutura canônica IntelliX em 3 camadas de risco crescente: (1) documentação e scaffolding puro — zero risco; (2) arquivos de infraestrutura adicionais — risco baixo; (3) promoção de módulos e reorganização de componentes — risco médio com atualização cirúrgica de imports.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase, Tailwind CSS, Shadcn/UI, Zod

---

## Diagnóstico — Gaps vs. Padrão IntelliX

| Gap | Gravidade | Risco de Correção |
|-----|-----------|-------------------|
| Diretório `prospect-pulse-54/` aninhado (não-trackado pelo git) | Alto | Zero |
| Raiz poluída com 8+ logs de build + 7+ arquivos SQL soltos | Médio | Zero |
| Sem `.intellix-phase` | Médio | Zero |
| Sem `references/` (architecture.md, DESIGN.md, workflow.md) | Alto | Zero |
| Sem `issues/` (atomic issue tracking) | Médio | Zero |
| Sem `.claude/agents/` (agentes especializados) | Médio | Zero |
| Sem `SPEC.md` na raiz | Médio | Zero |
| Sem `src/lib/api-response.ts` (respostas padronizadas) | Alto | Baixo (additive) |
| Sem `src/lib/permissions.ts` (RBAC centralizado) | Alto | Baixo (additive) |
| Sem `src/types/index.ts` (fonte única de verdade) | Médio | Baixo |
| Sem `src/validations/` (Zod schemas isolados) | Médio | Baixo |
| `src/lib/repositories/` não promovido para `src/repositories/` | Alto | Médio (10 imports) |
| `src/lib/services/` não promovido para `src/services/` | Alto | Médio (10 imports) |
| `src/components/` flat — sem `layout/` e `shared/` | Médio | Médio |

---

## Mapa de Arquivos

### Fase 1 — Scaffolding (criar, não mover)
- Criar: `.intellix-phase`
- Criar: `references/architecture.md`
- Criar: `references/DESIGN.md`
- Criar: `references/workflow.md`
- Criar: `references/specification.md`
- Criar: `issues/.gitkeep` + issues das features existentes
- Criar: `.claude/agents/component-writer.md`
- Criar: `.claude/agents/action-writer.md`
- Criar: `.claude/agents/hook-writer.md`
- Criar: `.claude/agents/route-writer.md`
- Criar: `.claude/agents/test-writer.md`
- Criar: `SPEC.md`

### Fase 2 — Infraestrutura (arquivos novos, sem mover)
- Criar: `src/lib/api-response.ts`
- Criar: `src/lib/permissions.ts`
- Criar: `src/types/index.ts` (consolida `prospection.ts` + `roles.ts`)
- Criar: `src/validations/lead.schema.ts`
- Criar: `src/validations/agent.schema.ts`

### Fase 3 — Promoção de módulos (mover + atualizar imports)
- Mover: `src/lib/repositories/` → `src/repositories/`
- Mover: `src/lib/services/` → `src/services/`
- Reorganizar: `src/components/` → `src/components/layout/` + `src/components/shared/`
- Arquivar: logs de build e SQL soltos em `archive/`

---

## Task 1: Remover diretório aninhado `prospect-pulse-54/`

> **Risco:** Zero — não está trackado pelo git (`git ls-files` confirmou `not_tracked`)

**Files:**
- Delete: `prospect-pulse-54/` (diretório inteiro)

- [ ] **Step 1: Confirmar que não está no git**

```bash
cd C:/Projects/prospect-pulse-54
git ls-files prospect-pulse-54 | head -5
# Expected: nenhuma saída (não trackado)
```

- [ ] **Step 2: Remover o diretório**

```bash
rm -rf "C:/Projects/prospect-pulse-54/prospect-pulse-54"
```

- [ ] **Step 3: Verificar que o projeto continua funcionando**

```bash
cd C:/Projects/prospect-pulse-54
npx tsc --noEmit 2>&1 | tail -5
# Expected: sem erros relacionados ao diretório removido
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove nested duplicate prospect-pulse-54 directory (untracked)"
```

---

## Task 2: Arquivar arquivos temporários da raiz

> **Risco:** Zero — mover logs e SQL soltos para `archive/`, sem afetar código

**Files:**
- Criar: `archive/build-logs/` (mover build*.txt, lint-out.txt)
- Criar: `archive/sql/` (mover *.sql que não são migrações oficiais)
- Manter na raiz: `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `ROADMAP.md`, `SISTEMA_TECNICO.md`

- [ ] **Step 1: Criar estrutura de archive**

```bash
mkdir -p "C:/Projects/prospect-pulse-54/archive/build-logs"
mkdir -p "C:/Projects/prospect-pulse-54/archive/sql"
mkdir -p "C:/Projects/prospect-pulse-54/archive/guides"
```

- [ ] **Step 2: Mover logs de build**

```bash
cd C:/Projects/prospect-pulse-54
mv build-check.txt build-full.txt build-log.txt build-output.txt \
   build-stderr.txt build-stdout.txt build-verification.log \
   lint-out.txt .cloudflared.log \
   archive/build-logs/ 2>/dev/null || true
```

- [ ] **Step 3: Mover arquivos SQL soltos (que não são migrações oficiais)**

```bash
cd C:/Projects/prospect-pulse-54
mv EXECUTAR_NO_SUPABASE.sql EXECUTAR_NO_SUPABASE_FASE2.sql \
   EXECUTAR_NO_SUPABASE_v2.sql EXECUTAR_SUPABASE_FIX_XPAG.sql \
   FIX_ADMIN_PENDING.sql FIX_RLS_USER_SETTINGS_ADMIN.sql \
   fix-rls-policies.sql LIMPAR_USUARIOS_PENDENTES.sql \
   RESET_SUPABASE_DATA_AND_SET_ADMIN.sql \
   archive/sql/ 2>/dev/null || true
```

- [ ] **Step 4: Mover guias operacionais para archive/guides**

```bash
cd C:/Projects/prospect-pulse-54
mv CONFIGURACAO_EMAIL.md DEPLOY_VERCEL.md EVOLUTION_AI_SETUP.md \
   EVOLUTION_API_CONFIG.md GUIA_IA_TEMPLATES.md GUIA_INTEGRACAO_N8N.md \
   GUIA_ROLES.md GUIA_TESTE_FINAL.md PIPELINE_E_ESTAGIOS.md \
   PRD_ANALYSIS.md \
   archive/guides/ 2>/dev/null || true
```

- [ ] **Step 5: Adicionar archive/ ao .gitignore (logs de build não devem ser versionados)**

Editar `.gitignore` e adicionar ao final:
```
# Build logs e temporários arquivados
archive/build-logs/
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: arquivar logs de build, sql soltos e guias operacionais em archive/"
```

---

## Task 3: Criar arquivo `.intellix-phase`

> **Risco:** Zero — novo arquivo de controle de fase

**Files:**
- Criar: `.intellix-phase`

- [ ] **Step 1: Criar o arquivo com fase atual**

O projeto está em produção com features implementadas → fase `dev` (desenvolvimento ativo).

```bash
echo "dev" > "C:/Projects/prospect-pulse-54/.intellix-phase"
```

- [ ] **Step 2: Commit**

```bash
cd C:/Projects/prospect-pulse-54
git add .intellix-phase
git commit -m "chore: adicionar .intellix-phase (fase: dev)"
```

---

## Task 4: Criar pasta `references/` com documentação de arquitetura

> **Risco:** Zero — criação de novos arquivos de documentação

**Files:**
- Criar: `references/architecture.md`
- Criar: `references/DESIGN.md`
- Criar: `references/workflow.md`
- Criar: `references/specification.md`

- [ ] **Step 1: Criar `references/architecture.md`**

```markdown
# LeadFinder Pro — Architecture Reference

> Regras de arquitetura específicas deste projeto. Em conflito com MASTER-ARCHITECTURE.md, este arquivo perde.

## Stack
- **Framework:** Next.js 15 App Router
- **Language:** TypeScript (strict: false — migration pendente para strict: true)
- **Database:** Supabase PostgreSQL 17.6 (projeto: kzvnwqlcrtxwagxkghxq, sa-east-1)
- **Auth:** Supabase Auth + JWT
- **Styling:** Tailwind CSS + Shadcn/UI
- **AI:** OpenAI GPT-4.1 (via AIAgentService com circuit breaker)
- **WhatsApp:** Evolution API (provider abstrato — suporta Meta Cloud API também)

## Princípios Locais

1. **Multi-tenancy por user_id** — toda tabela tem `user_id` com RLS ativo
2. **Thin Client** — nenhuma chave de API no frontend, toda lógica de negócio em API routes
3. **Workflow Engine nativo** — sem dependência de n8n; lógica em `src/lib/workflows/`
4. **Repository → Service → Route** — nunca acessar Supabase direto em route handlers

## Estrutura de Domínios

| Domínio | Repository | Service | Route |
|---------|-----------|---------|-------|
| Leads | `src/lib/repositories/lead.repository.ts` | `src/lib/services/` | `app/api/leads/` |
| Agente IA | — | `src/lib/ai/ai-agent.service.ts` | `app/api/agent/` |
| WhatsApp | — | `src/lib/integrations/whatsapp/` | `app/api/webhooks/evolution/` |
| Inbox | `src/lib/repositories/conversation.repository.ts` | — | `app/api/inbox/` |
| Clientes | (a criar) | (a criar) | `app/api/clientes/` |

## Segurança
- Toda API route valida sessão Supabase antes de operar
- Cron jobs autenticados via `CRON_SECRET` no header `Authorization`
- Webhook Evolution autenticado via `WEBHOOK_SECRET`
- Nenhuma chave exposta via `NEXT_PUBLIC_`

## Restrições
- **NÃO** usar Supabase direto em componentes React
- **NÃO** colocar lógica de agente IA em components
- **NÃO** criar tabelas sem RLS
- **NÃO** usar `any` em arquivos novos (legado tolerado temporariamente)
```

- [ ] **Step 2: Criar `references/DESIGN.md`**

```markdown
# LeadFinder Pro — Design Reference

## Paleta de Cores (Shadcn/UI — Dark Mode Default)
- Background: `hsl(var(--background))` — slate-950
- Foreground: `hsl(var(--foreground))` — slate-50
- Primary: indigo-600 / `hsl(var(--primary))`
- Destructive: red-500
- Border: slate-800
- Card: slate-900

## Tipografia
- Font: Inter (sistema — não carregada externamente)
- Heading: font-semibold, tracking-tight
- Body: text-sm, text-muted-foreground para secundário

## Componentes UI
- Biblioteca base: Shadcn/UI (Radix UI primitives)
- Localização: `src/components/ui/` — **nunca editar diretamente**
- Ícones: Lucide React

## Padrões de Layout
- Sidebar: AppSidebar (collapsible, 240px expandido / 60px colapsado)
- Main content: padding p-4 md:p-6
- Cards: rounded-lg border bg-card shadow-sm
- Mobile-first: breakpoints sm (640) / md (768) / lg (1024)

## Animações
- Biblioteca: Framer Motion
- Utilitários: `src/lib/animations.ts`
- Padrão: fade-in 200ms ease-out para modais e drawers

## Formulários
- Hook: React Hook Form + Zod resolver
- Validação: Zod schemas em `src/validations/`
- Feedback: Toast (Sonner) para sucesso/erro
```

- [ ] **Step 3: Criar `references/workflow.md`**

```markdown
# LeadFinder Pro — Workflow Reference

## Os 4 Comandos IntelliX para Novas Features

```
/spec  → criar/atualizar SPEC.md
/break → criar issues/ atômicas
/plan  → plano técnico com 7 seções (nunca pular)
/execute → implementar APENAS arquivos listados no /plan
```

## Ordem de Implementação Obrigatória

1. Protótipo de UI (componente sem lógica, dados mockados)
2. Schema SQL em `supabase/migrations/`
3. Tipos em `src/types/index.ts`
4. Zod schema em `src/validations/`
5. Repository em `src/repositories/` (ou `src/lib/repositories/` — ver nota)
6. Service em `src/services/` (ou `src/lib/services/` — ver nota)
7. Route Handler em `app/api/`
8. Conectar UI ao backend
9. Testes

> **Nota de migração:** Repositories e services ainda estão em `src/lib/repositories/` e
> `src/lib/services/`. A promoção para `src/repositories/` e `src/services/` está planejada.
> Novas features devem seguir o padrão canônico (`src/repositories/`, `src/services/`).

## Checklist pós-implementação

- [ ] Só arquivos do /plan foram modificados
- [ ] RLS ativo na tabela criada
- [ ] Nenhum secret exposto no frontend
- [ ] Sessão Supabase validada na API route
- [ ] `npx tsc --noEmit` sem erros
- [ ] Feature funcional em dev local antes de commitar
```

- [ ] **Step 4: Criar `references/specification.md`** (template de spec para futuras features)

```markdown
# Template de Especificação — LeadFinder Pro

> Use este template ao criar SPEC.md ou issues/ para novas features.

## Formato SPEC.md

```markdown
# [Nome da Feature]

## Overview
[O que faz em 2-3 linhas. O QUÊ existe, não o COMO implementar]

## [/rota-da-pagina]
[Propósito desta rota]

### Components
- **NomeEmPascalCase**: [O que renderiza e sua responsabilidade única]

### Behaviors
- **nome-em-kebab-case**: [O que acontece quando o usuário faz esta ação]
```

## Formato de Issue (issues/NN-nome.md)

```markdown
# Implement [nome-do-behavior] in [/rota]

[Descrição em 1-2 linhas]

## Functional Specification

### Behavior: [nome]
File: `app/(protected)/[rota]/behaviors/[nome]/`

### Preconditions
* [...]

### Happy Path
#### Input: [...]
#### Workflow: [...]
#### Output: [...]

### Edge Cases
### Error Cases

## Database Schema (se aplicável)
## Files to Create / Modify
## Tasks
- [ ] ...
```
```

- [ ] **Step 5: Commit**

```bash
cd C:/Projects/prospect-pulse-54
git add references/
git commit -m "docs: criar references/ com architecture, design e workflow IntelliX"
```

---

## Task 5: Criar pasta `issues/` com features existentes documentadas

> **Risco:** Zero — documentação pura

**Files:**
- Criar: `issues/.gitkeep`
- Criar: `issues/F14-base-clientes.md`
- Criar: `issues/F15-campanhas.md`
- Criar: `issues/F16-importacao-leads.md`

- [ ] **Step 1: Criar `issues/.gitkeep`**

```bash
mkdir -p "C:/Projects/prospect-pulse-54/issues"
touch "C:/Projects/prospect-pulse-54/issues/.gitkeep"
```

- [ ] **Step 2: Criar issue F14 — Base de Clientes**

Arquivo `issues/F14-base-clientes.md`:
```markdown
# Implement base-de-clientes in /clientes

Repositório permanente de clientes convertidos, separado do funil `leads_prospeccao`.

## Status: implementado em 2026-04-02 (commit 0ad6b8f)

## Behaviors implementados
- **converter-lead**: lead → cliente (copia dados, cria histórico, remove do funil)
- **listar-clientes**: GET /api/clientes com busca e filtro
- **editar-cliente**: PATCH /api/clientes/[id]
- **devolver-cliente**: reprospectar cliente como novo lead

## Files
- `app/(protected)/clientes/page.tsx`
- `app/api/clientes/route.ts`
- `app/api/clientes/[id]/route.ts`
- `app/api/clientes/converter/route.ts`
- `app/api/clientes/[id]/devolver/route.ts`

## Pendências
- [ ] Criar `supabase/migrations/` para tabelas `clientes` e `cliente_historico`
- [ ] Validar que RLS está ativo nessas tabelas
```

- [ ] **Step 3: Criar issue F15 — Campanhas**

Arquivo `issues/F15-campanhas.md`:
```markdown
# Implement campanhas in /campanhas

Criação e disparo de campanhas WhatsApp/email para segmentos de leads/clientes.

## Status: implementado em 2026-04-02 (commit 0ad6b8f)

## Files
- `app/(protected)/campanhas/page.tsx`
- `app/api/campaigns/route.ts`
- `app/api/campaigns/[id]/route.ts`
- `app/api/campaigns/[id]/send/route.ts`

## Pendências
- [ ] Tabela `campaigns` e `campaign_sends` no Supabase
- [ ] Validar RLS nas tabelas de campanha
```

- [ ] **Step 4: Criar issue F16 — Importação de Leads**

Arquivo `issues/F16-importacao-leads.md`:
```markdown
# Implement importacao-de-leads in /leads

Importar leads em massa via CSV, XLSX, VCF ou TXT.

## Status: implementado em 2026-04-02 (commit 0ad6b8f)

## Files
- `src/components/ImportLeadsModal.tsx` (ou similar)
- `app/api/leads/import/route.ts`

## Pendências
- [ ] Confirmar componente de UI implementado
- [ ] Validar normalização de telefone BR → +55XXXXXXXXXXX
```

- [ ] **Step 5: Commit**

```bash
cd C:/Projects/prospect-pulse-54
git add issues/
git commit -m "docs: criar issues/ com features existentes documentadas (F14-F16)"
```

---

## Task 6: Criar `.claude/agents/` com agentes especializados

> **Risco:** Zero — novos arquivos de configuração Claude Code

**Files:**
- Criar: `.claude/agents/component-writer.md`
- Criar: `.claude/agents/action-writer.md`
- Criar: `.claude/agents/hook-writer.md`
- Criar: `.claude/agents/route-writer.md`
- Criar: `.claude/agents/test-writer.md`

- [ ] **Step 1: Criar `component-writer.md`**

```bash
mkdir -p "C:/Projects/prospect-pulse-54/.claude/agents"
```

Arquivo `.claude/agents/component-writer.md`:
```markdown
---
name: component-writer
description: Escreve componentes React/Next.js para o LeadFinder Pro. Use para criar ou modificar arquivos .tsx em src/components/ ou app/(protected)/*/
---

# Component Writer — LeadFinder Pro

## Responsabilidade
Criar e modificar componentes React. NÃO implementar lógica de negócio.

## Regras absolutas
1. Componentes em `src/components/shared/` ou `src/components/layout/`
2. Componentes de página em `app/(protected)/[rota]/components/`
3. Shadcn/UI para primitivos — nunca criar botões/inputs do zero
4. Framer Motion para animações
5. Mobile-first: classes Tailwind começam sem prefixo, depois md: lg:
6. Sem lógica de negócio — chamar hooks ou props, não Supabase direto
7. Sem any — TypeScript estrito nos arquivos novos

## Stack de UI
- Shadcn/UI: `@/components/ui/*`
- Ícones: `lucide-react`
- Animações: `framer-motion`
- Classes: `cn()` de `@/lib/utils`

## Template de componente
```tsx
import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

interface MyComponentProps {
  className?: string
}

export function MyComponent({ className }: MyComponentProps) {
  return (
    <div className={cn('...', className)}>
      {/* content */}
    </div>
  )
}
```

## Checklist pós-escrita
- [ ] Props tipadas (sem any)
- [ ] Sem import de supabase diretamente
- [ ] Sem lógica de negócio inline
- [ ] Mobile-first CSS
```

- [ ] **Step 2: Criar `route-writer.md`**

Arquivo `.claude/agents/route-writer.md`:
```markdown
---
name: route-writer
description: Escreve Route Handlers Next.js para o LeadFinder Pro. Use para criar ou modificar arquivos route.ts em app/api/
---

# Route Writer — LeadFinder Pro

## Responsabilidade
Criar e modificar API Route Handlers. Camada HTTP apenas — sem lógica de negócio.

## Regras absolutas
1. SEMPRE validar sessão Supabase antes de operar
2. SEMPRE usar `apiResponse.*` de `@/lib/api-response` para respostas
3. NUNCA acessar Supabase direto — usar services ou repositories
4. NUNCA expor erros internos ao cliente
5. Cron routes: verificar `Authorization: Bearer ${CRON_SECRET}`
6. Webhook routes: responder HTTP 200 imediatamente, processar async

## Template de route handler
```typescript
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api-response'
import type { NextRequest } from 'next/server'

export async function GET(_req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return apiResponse.unauthorized()

    // chamar service aqui
    return apiResponse.ok(data)
  } catch (err) {
    console.error('[GET /api/...]', err)
    return apiResponse.serverError()
  }
}
```

## Checklist pós-escrita
- [ ] Sessão validada
- [ ] apiResponse usado em todas as saídas
- [ ] Nenhum secret no response body
- [ ] Try/catch cobrindo toda a lógica
```

- [ ] **Step 3: Criar `hook-writer.md`**

Arquivo `.claude/agents/hook-writer.md`:
```markdown
---
name: hook-writer
description: Escreve React hooks customizados para o LeadFinder Pro. Use para criar ou modificar arquivos use-*.ts em src/hooks/
---

# Hook Writer — LeadFinder Pro

## Responsabilidade
Criar hooks que encapsulam state + side effects do frontend.

## Regras
1. Nomenclatura: `use-nome-do-hook.ts` (arquivo) / `useNomeDoHook` (export)
2. Hooks chamam APIs REST (`fetch /api/...`) — nunca Supabase direto
3. Retornar objeto nomeado, nunca array (exceto pares [value, setter])
4. Tipagem completa no retorno

## Template
```typescript
import { useState, useEffect } from 'react'

interface UseLeadsReturn {
  leads: Lead[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useLeads(): UseLeadsReturn {
  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLeads = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/leads')
      const { data } = await res.json()
      setLeads(data)
    } catch (e) {
      setError('Erro ao carregar leads')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchLeads() }, [])

  return { leads, isLoading, error, refetch: fetchLeads }
}
```
```

- [ ] **Step 4: Criar `action-writer.md` e `test-writer.md`**

Arquivo `.claude/agents/action-writer.md`:
```markdown
---
name: action-writer
description: Escreve Server Actions Next.js para o LeadFinder Pro.
---

# Action Writer — LeadFinder Pro

## Responsabilidade
Server Actions para mutações a partir de componentes React (alternativa a route handlers para forms).

## Regras
1. Sempre `'use server'` no topo
2. Sempre validar com Zod antes de persistir
3. Retornar `{ success: boolean, error?: string, data?: T }`
4. Revalidar cache com `revalidatePath()` após mutações

## Template
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const schema = z.object({ name: z.string().min(1) })

export async function createSomething(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: 'Dados inválidos' }

  // persistir...
  revalidatePath('/rota')
  return { success: true }
}
```
```

Arquivo `.claude/agents/test-writer.md`:
```markdown
---
name: test-writer
description: Escreve testes para o LeadFinder Pro. Use para criar ou modificar arquivos *.spec.ts em tests/ ou e2e_tests/
---

# Test Writer — LeadFinder Pro

## Responsabilidade
Testes unitários (Vitest em tests/unit/), E2E (Pytest em e2e_tests/).

## Cobertura obrigatória para cada behavior
1. **Happy Path** — fluxo principal funciona
2. **Edge Case** — limites e casos especiais
3. **Error Case** — falhas e respostas de erro

## Estrutura de teste unitário (Vitest)
```typescript
import { describe, it, expect, vi } from 'vitest'
import { functionToTest } from '@/lib/...'

describe('functionToTest', () => {
  it('happy path: should...', () => {
    const result = functionToTest(validInput)
    expect(result).toBe(expected)
  })

  it('edge case: should handle empty input', () => {
    const result = functionToTest('')
    expect(result).toBeNull()
  })

  it('error case: should throw when...', () => {
    expect(() => functionToTest(invalidInput)).toThrow('expected error')
  })
})
```

## Rodar testes
```bash
npx vitest run tests/unit/          # unitários
cd e2e_tests && python -m pytest    # E2E
```
```

- [ ] **Step 5: Commit**

```bash
cd C:/Projects/prospect-pulse-54
git add .claude/agents/
git commit -m "chore: adicionar agentes especializados Claude Code em .claude/agents/"
```

---

## Task 7: Criar `SPEC.md` na raiz

> **Risco:** Zero — novo arquivo de especificação

**Files:**
- Criar: `SPEC.md`

- [ ] **Step 1: Criar `SPEC.md`**

```markdown
# LeadFinder Pro — Especificação Viva

> **Versão:** 2.0 — 2026-04-07
> **Status:** Produção ativa em `alpha.dualite.dev`
> **Produto:** Sistema de prospecção e qualificação de leads B2B com agente IA WhatsApp

---

## Overview
LeadFinder Pro é uma plataforma SaaS multi-tenant que automatiza a prospecção de leads (Google Places), o atendimento qualificado via WhatsApp com agente IA (OpenAI GPT-4.1) e a gestão do pipeline comercial em Kanban. Elimina dependência de n8n — toda a lógica roda em TypeScript nativo no Next.js.

---

## [/] — Prospecção

### Components
- **ProspectionForm**: Formulário com nicho/produto, localização e quantidade; dispara Edge Function
- **QuickSelectNiches**: Chips de seleção rápida de nicho
- **QuickSelectLocations**: Chips de seleção rápida de localização
- **SearchHistory**: Histórico de prospecções anteriores

### Behaviors
- **prospeccao-por-nicho**: Busca por Google Places + enriquecimento OpenAI → leads salvos
- **prospeccao-por-produto**: Toggle produto: busca com searchMode='product'

---

## [/leads] — Gestão de Leads

### Components
- **LeadTable**: Tabela com filtros, ordenação, busca
- **LeadDetailDrawer**: Drawer de detalhes + histórico de conversa
- **LeadEditModal**: Edição de campos do lead
- **BulkActionsBar**: Ações em massa selecionadas
- **WhatsAppDispatchModal**: Envio manual de WhatsApp
- **ExportModal**: Export CSV/Excel
- **EmailCampaignModal**: Disparo de email em massa via Resend
- **ImportLeadsModal**: Importação CSV/XLSX/VCF

### Behaviors
- **filtrar-leads**: Filtro por status, estágio, cidade, categoria
- **enviar-whatsapp-manual**: Disparo individual via Evolution API
- **bulk-delete**: Exclusão em massa (admin only)
- **exportar-leads**: CSV/Excel com auditoria
- **enviar-email-campanha**: Resend batch para leads selecionados
- **importar-leads**: Parse CSV/XLSX → normalização → upsert

---

## [/kanban] — Pipeline Visual

### Components
- **KanbanBoard**: Colunas drag-and-drop (dnd-kit)

### Behaviors
- **mover-lead-kanban**: Drag-and-drop → atualiza estagio_pipeline + Realtime sync

---

## [/dashboard] — Analytics

### Components
- **MetricsCards**: Total leads, qualificados, taxa de conversão
- **PipelineChart**: Distribuição por estágio (Chart.js)

---

## [/inbox] — Atendimento Humano

### Components
- **ConversationList**: Leads transferidos para humano
- **WhatsAppConversationDrawer**: Histórico + envio de mensagens

### Behaviors
- **assumir-conversa**: Consultor entra na conversa (modo humano)
- **enviar-mensagem-consultor**: Envio de texto via Evolution API
- **devolver-ao-bot**: Retorna conversa ao agente IA

---

## [/clientes] — Base de Clientes (F14)

### Behaviors
- **converter-lead**: lead qualificado → cliente permanente
- **listar-clientes**: filtro por status/categoria
- **devolver-cliente**: cliente → reprospectar como lead

---

## [/campanhas] — Campanhas (F15)

### Behaviors
- **criar-campanha**: audience builder + canal (WA/email)
- **disparar-campanha**: envio em batch com tracking individual

---

## [/settings] — Configurações

### Behaviors
- **configurar-agente**: prompt, modelo, temperatura, RAG
- **aprovar-usuario**: admin aprova pendentes + define role
- **configurar-consultor**: whatsapp + instância Evolution do consultor

---

## Agente IA (Backend — sem rota própria)

### Behaviors
- **processar-webhook-evolution**: recebe mensagem → dispara workflow
- **qualificar-lead**: fluxo 5 etapas → atualizar_lead ou transferir_para_consultor
- **follow-up-curto-prazo**: cron 1min → 3 estágios (10min / 1h / 24h)
- **follow-up-longo-prazo**: cron diário 9h → 5 cenários de reengajamento
```

- [ ] **Step 2: Commit**

```bash
cd C:/Projects/prospect-pulse-54
git add SPEC.md
git commit -m "docs: criar SPEC.md com especificação viva do LeadFinder Pro v2.0"
```

---

## Task 8: Criar `src/lib/api-response.ts`

> **Risco:** Baixo — novo arquivo, nenhum import quebra; routes existentes continuam funcionando

**Files:**
- Criar: `src/lib/api-response.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/lib/api-response.ts
import { NextResponse } from 'next/server'

type ApiSuccess<T> = {
  data: T
  meta?: {
    total?: number
    page?: number
    pageSize?: number
    cursor?: string
  }
}

export const apiResponse = {
  ok: <T>(data: T, meta?: ApiSuccess<T>['meta'], status = 200) =>
    NextResponse.json({ data, ...(meta ? { meta } : {}) }, { status }),

  created: <T>(data: T) =>
    NextResponse.json({ data }, { status: 201 }),

  noContent: () =>
    new NextResponse(null, { status: 204 }),

  badRequest: (message: string, details?: unknown) =>
    NextResponse.json(
      { error: { code: 'BAD_REQUEST', message, details } },
      { status: 400 }
    ),

  unauthorized: (message = 'Authentication required') =>
    NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message } },
      { status: 401 }
    ),

  forbidden: (message = 'Insufficient permissions') =>
    NextResponse.json(
      { error: { code: 'FORBIDDEN', message } },
      { status: 403 }
    ),

  notFound: (resource = 'Resource') =>
    NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `${resource} not found` } },
      { status: 404 }
    ),

  tooManyRequests: () =>
    NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429, headers: { 'Retry-After': '10' } }
    ),

  serverError: (message = 'Internal server error') =>
    NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    ),
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd C:/Projects/prospect-pulse-54
npx tsc --noEmit 2>&1 | grep "api-response" || echo "OK — sem erros em api-response.ts"
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-response.ts
git commit -m "feat: adicionar src/lib/api-response.ts com formato padronizado RFC 7807"
```

---

## Task 9: Criar `src/lib/permissions.ts`

> **Risco:** Baixo — centraliza RBAC que hoje está espalhado em hooks

**Files:**
- Criar: `src/lib/permissions.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/lib/permissions.ts
// Centraliza toda a lógica de RBAC. Espelho do que existe em src/hooks/useUserRole.ts
// mas reutilizável no lado servidor (API routes).

export type UserRole = 'admin' | 'operador' | 'visualizador'

export const PERMISSIONS = {
  canCreate:            ['admin', 'operador'],
  canUpdate:            ['admin', 'operador'],
  canDelete:            ['admin', 'operador'],
  canBulkDelete:        ['admin'],
  canExport:            ['admin', 'operador', 'visualizador'],
  canSendWhatsApp:      ['admin', 'operador'],
  canManageAgent:       ['admin', 'operador'],
  canManageRoles:       ['admin'],
  canViewAuditLogs:     ['admin'],
  canManageIntegrations: ['admin'],
  canManageCampaigns:   ['admin', 'operador'],
  canViewClientes:      ['admin', 'operador', 'visualizador'],
  canManageClientes:    ['admin', 'operador'],
} as const

export type Permission = keyof typeof PERMISSIONS

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role)
}

export function isAdmin(role: UserRole): boolean {
  return role === 'admin'
}

export const ADMIN_EMAIL = 'fmbp1981@gmail.com'
```

- [ ] **Step 2: Verificar compilação**

```bash
cd C:/Projects/prospect-pulse-54
npx tsc --noEmit 2>&1 | grep "permissions" || echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/permissions.ts
git commit -m "feat: adicionar src/lib/permissions.ts centralizando RBAC para uso server-side"
```

---

## Task 10: Criar `src/types/index.ts` (fonte única de verdade)

> **Risco:** Baixo — novo arquivo; não remove os existentes ainda

**Files:**
- Criar: `src/types/index.ts`

- [ ] **Step 1: Criar `src/types/index.ts`** re-exportando os tipos existentes e adicionando os que faltam

```typescript
// src/types/index.ts — Fonte única de verdade para tipos TypeScript
// Re-exporta arquivos existentes + centraliza tipos de domínio

// ─── Re-exports existentes ────────────────────────────────────
export type { ProspectionResult, SearchLocation } from './prospection'
export type { UserRole, RolePermissions } from './roles'

// ─── Lead ─────────────────────────────────────────────────────
export interface Lead {
  id: string
  user_id: string
  empresa: string
  contato: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  instagram: string | null
  cidade: string | null
  categoria: string | null
  status_msg_wa: string | null
  estagio_pipeline: string | null
  modo_atendimento: 'bot' | 'humano'
  faturamento_declarado: number | null
  usa_meios_pagamento: string | null
  mensagem_personalizada: string | null
  data_ultima_interacao: string | null
  created_at: string
  updated_at: string
}

// ─── Cliente ──────────────────────────────────────────────────
export interface Cliente {
  id: string
  user_id: string
  lead_id_original: string | null
  empresa: string
  contato: string | null
  whatsapp: string | null
  email: string | null
  status: 'Ativo' | 'Inativo' | 'Reprospectar'
  data_conversao: string
  created_at: string
}

// ─── Campaign ─────────────────────────────────────────────────
export interface Campaign {
  id: string
  user_id: string
  name: string
  channel: 'whatsapp' | 'email'
  status: 'draft' | 'sent' | 'failed'
  subject: string | null
  body: string
  created_at: string
}

// ─── API ──────────────────────────────────────────────────────
export interface ApiSuccess<T> {
  data: T
  meta?: { total?: number }
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown }
}
```

- [ ] **Step 2: Verificar compilação**

```bash
cd C:/Projects/prospect-pulse-54
npx tsc --noEmit 2>&1 | grep "types/index" || echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: criar src/types/index.ts como fonte única de verdade para tipos"
```

---

## Task 11: Criar `src/validations/` com Zod schemas

> **Risco:** Baixo — novos arquivos, zero breaking changes

**Files:**
- Criar: `src/validations/lead.schema.ts`
- Criar: `src/validations/agent.schema.ts`
- Criar: `src/validations/campaign.schema.ts`

- [ ] **Step 1: Criar `src/validations/lead.schema.ts`**

```typescript
// src/validations/lead.schema.ts
import { z } from 'zod'

export const createLeadSchema = z.object({
  empresa: z.string().min(1, 'Nome da empresa obrigatório').max(200),
  contato: z.string().max(100).optional(),
  whatsapp: z.string().regex(/^\+55\d{10,11}$/, 'WhatsApp inválido (formato: +55XXXXXXXXXXX)').optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  cidade: z.string().max(100).optional(),
  categoria: z.string().max(100).optional(),
})

export const updateLeadSchema = createLeadSchema.partial().extend({
  estagio_pipeline: z.enum([
    'Novo',
    'Contato Inicial',
    'Qualificação',
    'Follow-up',
    'Transferido para Consultor',
    'Fechado Ganho',
    'Fechado Perdido',
  ]).optional(),
  status_msg_wa: z.enum([
    'Em Conversa',
    'Qualificando',
    'Qualificado',
    'Follow-up',
    'Transferido',
  ]).optional(),
})

export const emailCampaignSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1, 'Selecione ao menos um lead'),
  subject: z.string().min(1, 'Assunto obrigatório').max(200),
  body: z.string().min(1, 'Corpo do email obrigatório'),
})

export type CreateLeadInput = z.infer<typeof createLeadSchema>
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>
export type EmailCampaignInput = z.infer<typeof emailCampaignSchema>
```

- [ ] **Step 2: Criar `src/validations/agent.schema.ts`**

```typescript
// src/validations/agent.schema.ts
import { z } from 'zod'

export const agentConfigSchema = z.object({
  name: z.string().min(1).max(100),
  systemPrompt: z.string().min(10, 'Prompt muito curto'),
  model: z.enum(['gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']),
  temperature: z.number().min(0).max(2),
  maxIterations: z.number().int().min(1).max(10),
})

export type AgentConfigInput = z.infer<typeof agentConfigSchema>
```

- [ ] **Step 3: Criar `src/validations/campaign.schema.ts`**

```typescript
// src/validations/campaign.schema.ts
import { z } from 'zod'

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  channel: z.enum(['whatsapp', 'email']),
  subject: z.string().max(200).optional(),
  body: z.string().min(1),
})

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>
```

- [ ] **Step 4: Verificar compilação**

```bash
cd C:/Projects/prospect-pulse-54
npx tsc --noEmit 2>&1 | grep "validations" || echo "OK"
```

- [ ] **Step 5: Commit**

```bash
git add src/validations/
git commit -m "feat: criar src/validations/ com Zod schemas para leads, agente e campanhas"
```

---

## Task 12: Promover `src/lib/repositories/` → `src/repositories/`

> **Risco:** Médio — requer atualização de imports. **Verificar build após execução.**

**Arquivos afetados (imports a atualizar):**
- `app/api/webhooks/evolution/route.ts` (único arquivo de app/ que importa de lib/repositories)
- Possíveis imports dentro de `src/lib/workflows/` e `src/lib/services/`

**Files:**
- Criar: `src/repositories/` (mover conteúdo de `src/lib/repositories/`)
- Modificar: todos os arquivos que importam `@/lib/repositories/*`

- [ ] **Step 1: Mapear todos os imports afetados**

```bash
cd C:/Projects/prospect-pulse-54
grep -r "@/lib/repositories\|../repositories\|./repositories" \
  src/ app/ --include="*.ts" --include="*.tsx" -n
```

- [ ] **Step 2: Criar diretório `src/repositories/` e copiar arquivos**

```bash
mkdir -p "C:/Projects/prospect-pulse-54/src/repositories"
cp -r "C:/Projects/prospect-pulse-54/src/lib/repositories/." \
      "C:/Projects/prospect-pulse-54/src/repositories/"
```

- [ ] **Step 3: Atualizar imports** (substituir `@/lib/repositories` por `@/repositories`)

```bash
cd C:/Projects/prospect-pulse-54
# Windows-safe: usar node para substituição
node -e "
const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const updated = content.replace(/@\/lib\/repositories/g, '@/repositories');
  if (content !== updated) {
    fs.writeFileSync(filePath, updated);
    console.log('Updated:', filePath);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory() && !f.startsWith('.') && f !== 'node_modules' && f !== '.next') {
      walkDir(full);
    } else if (f.endsWith('.ts') || f.endsWith('.tsx')) {
      replaceInFile(full);
    }
  });
}

walkDir('src');
walkDir('app');
"
```

- [ ] **Step 4: Verificar build**

```bash
cd C:/Projects/prospect-pulse-54
npx tsc --noEmit 2>&1 | tail -20
# Expected: sem erros de import
```

- [ ] **Step 5: Remover diretório antigo**

```bash
rm -rf "C:/Projects/prospect-pulse-54/src/lib/repositories"
```

- [ ] **Step 6: Commit**

```bash
cd C:/Projects/prospect-pulse-54
git add -A
git commit -m "refactor: promover src/lib/repositories/ → src/repositories/ (padrão IntelliX)"
```

---

## Task 13: Promover `src/lib/services/` → `src/services/`

> **Risco:** Médio — mesmo processo do Task 12

**Files:**
- Criar: `src/services/` (mover conteúdo de `src/lib/services/`)
- Modificar: todos os arquivos que importam `@/lib/services/*`

- [ ] **Step 1: Mapear imports afetados**

```bash
cd C:/Projects/prospect-pulse-54
grep -r "@/lib/services" src/ app/ --include="*.ts" --include="*.tsx" -n
```

- [ ] **Step 2: Copiar para novo local**

```bash
mkdir -p "C:/Projects/prospect-pulse-54/src/services"
cp -r "C:/Projects/prospect-pulse-54/src/lib/services/." \
      "C:/Projects/prospect-pulse-54/src/services/"
```

- [ ] **Step 3: Atualizar imports**

```bash
cd C:/Projects/prospect-pulse-54
node -e "
const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const updated = content.replace(/@\/lib\/services/g, '@/services');
  if (content !== updated) {
    fs.writeFileSync(filePath, updated);
    console.log('Updated:', filePath);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory() && !f.startsWith('.') && f !== 'node_modules' && f !== '.next') {
      walkDir(full);
    } else if (f.endsWith('.ts') || f.endsWith('.tsx')) {
      replaceInFile(full);
    }
  });
}

walkDir('src');
walkDir('app');
"
```

- [ ] **Step 4: Verificar build**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

- [ ] **Step 5: Remover diretório antigo**

```bash
rm -rf "C:/Projects/prospect-pulse-54/src/lib/services"
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: promover src/lib/services/ → src/services/ (padrão IntelliX)"
```

---

## Task 14: Reorganizar `src/components/` em `layout/` e `shared/`

> **Risco:** Médio — requer atualização de imports de componentes

**Classificação dos componentes:**
- **`layout/`** → `AppSidebar.tsx`, `Layout.tsx`, `NavLink.tsx`, `Logo.tsx`, `ThemeToggle.tsx`
- **`shared/`** → `RoleGuard.tsx`, `RoleBadge.tsx`, `ProtectedRoute.tsx`, todos os outros
- **Manter em `src/components/`** → pastas `ui/`, `dashboard/`, `inbox/`, `leads/`

**Files:**
- Criar: `src/components/layout/` (5 componentes)
- Criar: `src/components/shared/` (componentes cross-feature)

- [ ] **Step 1: Criar pastas e mover componentes de layout**

```bash
mkdir -p "C:/Projects/prospect-pulse-54/src/components/layout"
mkdir -p "C:/Projects/prospect-pulse-54/src/components/shared"

cd "C:/Projects/prospect-pulse-54/src/components"
cp AppSidebar.tsx Layout.tsx NavLink.tsx Logo.tsx ThemeToggle.tsx layout/
```

- [ ] **Step 2: Mover componentes shared**

```bash
cd "C:/Projects/prospect-pulse-54/src/components"
cp RoleGuard.tsx RoleBadge.tsx RoleManagement.tsx ProtectedRoute.tsx \
   ExportModal.tsx WhatsAppDispatchModal.tsx WhatsAppConversationDrawer.tsx \
   LeadDetailDrawer.tsx LeadEditModal.tsx BulkActionsBar.tsx \
   ProspectionForm.tsx KanbanBoard.tsx SearchHistory.tsx \
   LocationCascade.tsx QuickSelectLocations.tsx QuickSelectNiches.tsx \
   QuickStats.tsx AITemplateGenerator.tsx ApplyTemplateModal.tsx \
   TemplateManager.tsx ChangePassword.tsx \
   shared/
```

- [ ] **Step 3: Atualizar imports (substituição em batch)**

```bash
cd "C:/Projects/prospect-pulse-54"
node -e "
const fs = require('fs');
const path = require('path');

const layoutComponents = ['AppSidebar', 'Layout', 'NavLink', 'Logo', 'ThemeToggle'];
const sharedComponents = ['RoleGuard', 'RoleBadge', 'RoleManagement', 'ProtectedRoute',
  'ExportModal', 'WhatsAppDispatchModal', 'WhatsAppConversationDrawer',
  'LeadDetailDrawer', 'LeadEditModal', 'BulkActionsBar', 'ProspectionForm',
  'KanbanBoard', 'SearchHistory', 'LocationCascade', 'QuickSelectLocations',
  'QuickSelectNiches', 'QuickStats', 'AITemplateGenerator', 'ApplyTemplateModal',
  'TemplateManager', 'ChangePassword'];

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  layoutComponents.forEach(c => {
    const pattern = new RegExp('@/components/' + c, 'g');
    const replacement = '@/components/layout/' + c;
    if (pattern.test(content)) { content = content.replace(pattern, replacement); changed = true; }
  });

  sharedComponents.forEach(c => {
    const pattern = new RegExp('@/components/' + c, 'g');
    const replacement = '@/components/shared/' + c;
    if (pattern.test(content)) { content = content.replace(pattern, replacement); changed = true; }
  });

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log('Updated:', filePath);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const full = path.join(dir, f);
    const skip = ['.', 'node_modules', '.next', 'layout', 'shared', 'ui'];
    if (fs.statSync(full).isDirectory() && !skip.includes(f)) walkDir(full);
    else if ((f.endsWith('.ts') || f.endsWith('.tsx')) && !skip.some(s => full.includes(s+'/'))) replaceInFile(full);
  });
}

walkDir('src');
walkDir('app');
"
```

- [ ] **Step 4: Verificar build**

```bash
cd C:/Projects/prospect-pulse-54
npx tsc --noEmit 2>&1 | tail -20
# Se houver erros, os imports não foram atualizados — corrigir manualmente
```

- [ ] **Step 5: Remover arquivos duplicados da raiz de components/** (após confirmar que tsc passou)

```bash
cd "C:/Projects/prospect-pulse-54/src/components"
rm AppSidebar.tsx Layout.tsx NavLink.tsx Logo.tsx ThemeToggle.tsx
rm RoleGuard.tsx RoleBadge.tsx RoleManagement.tsx ProtectedRoute.tsx \
   ExportModal.tsx WhatsAppDispatchModal.tsx WhatsAppConversationDrawer.tsx \
   LeadDetailDrawer.tsx LeadEditModal.tsx BulkActionsBar.tsx \
   ProspectionForm.tsx KanbanBoard.tsx SearchHistory.tsx \
   LocationCascade.tsx QuickSelectLocations.tsx QuickSelectNiches.tsx \
   QuickStats.tsx AITemplateGenerator.tsx ApplyTemplateModal.tsx \
   TemplateManager.tsx ChangePassword.tsx 2>/dev/null || true
```

- [ ] **Step 6: Verificar build final**

```bash
cd C:/Projects/prospect-pulse-54
npx tsc --noEmit && echo "BUILD OK"
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: reorganizar src/components/ em layout/ e shared/ (padrão IntelliX)"
```

---

## Resultado Final — Estrutura Pós-Reorganização

```
prospect-pulse-54/
│
├── .intellix-phase              ← "dev" (novo)
├── SPEC.md                      ← especificação viva (novo)
├── CLAUDE.md                    ← contexto Claude (existente)
├── SISTEMA_TECNICO.md           ← doc técnico vivo (existente)
├── README.md / CHANGELOG.md / ROADMAP.md
│
├── references/                  ← NOVO — referências imutáveis
│   ├── architecture.md
│   ├── DESIGN.md
│   ├── workflow.md
│   └── specification.md
│
├── issues/                      ← NOVO — issues atômicas
│   ├── F14-base-clientes.md
│   ├── F15-campanhas.md
│   └── F16-importacao-leads.md
│
├── archive/                     ← NOVO — arquivos temporários
│   ├── build-logs/
│   ├── sql/
│   └── guides/
│
├── .claude/
│   └── agents/                  ← NOVO — agentes especializados
│       ├── component-writer.md
│       ├── action-writer.md
│       ├── hook-writer.md
│       ├── route-writer.md
│       └── test-writer.md
│
├── app/                         ← SEM ALTERAÇÃO (risco zero)
│   ├── (auth)/
│   ├── (protected)/
│   └── api/
│
├── src/
│   ├── components/
│   │   ├── ui/                  ← sem alteração
│   │   ├── layout/              ← NOVO (AppSidebar, Layout, NavLink...)
│   │   ├── shared/              ← NOVO (RoleGuard, LeadEditModal...)
│   │   ├── dashboard/           ← sem alteração
│   │   ├── inbox/               ← sem alteração
│   │   └── leads/               ← sem alteração
│   │
│   ├── repositories/            ← PROMOVIDO de src/lib/repositories/
│   ├── services/                ← PROMOVIDO de src/lib/services/
│   │
│   ├── lib/
│   │   ├── ai/                  ← sem alteração
│   │   ├── integrations/        ← sem alteração
│   │   ├── workflows/           ← sem alteração
│   │   ├── jobs/                ← sem alteração
│   │   ├── supabase/ (→ /lib/supabase/) ← sem alteração
│   │   ├── api-response.ts      ← NOVO
│   │   └── permissions.ts       ← NOVO
│   │
│   ├── validations/             ← NOVO
│   │   ├── lead.schema.ts
│   │   ├── agent.schema.ts
│   │   └── campaign.schema.ts
│   │
│   ├── types/
│   │   ├── index.ts             ← NOVO (fonte única de verdade)
│   │   ├── prospection.ts       ← existente
│   │   └── roles.ts             ← existente
│   │
│   ├── hooks/                   ← sem alteração
│   └── contexts/                ← sem alteração
│
└── supabase/                    ← sem alteração
```

---

## Ordem de Execução Recomendada

| Fase | Tasks | Risco | Pode fazer em paralelo? |
|------|-------|-------|------------------------|
| **1 — Zero risco** | 1, 2, 3, 4, 5, 6, 7 | Zero | Sim (todas independentes) |
| **2 — Baixo risco** | 8, 9, 10, 11 | Baixo | Sim (todas aditivas) |
| **3 — Médio risco** | 12, 13, 14 | Médio | **NÃO** — executar sequencialmente e verificar `tsc --noEmit` entre cada task |

**Regra de ouro para Fase 3:** Se `tsc --noEmit` retornar erros após qualquer move, **não remover o diretório original** até corrigir todos os imports.
