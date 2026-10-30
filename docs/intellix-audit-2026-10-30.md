# IntelliX Code Audit — LeadFinder Pro (prospect-pulse-54)
**Data:** 2026-10-30
**Auditado por:** IntelliX Engineering Plugin — Fase 00b (`intellix:code-audit`)
**Escopo:** auditoria de entrada para o plano de ajuste do sistema + migração de hospedagem Vercel → Cloudflare.
**Estado de referência:** `main` @ `8aeac1a` (= GitHub = produção Vercel). Supabase `kzvnwqlcrtxwagxkghxq` (Postgres 17, sa-east-1).
**Modo:** somente leitura — nenhum código, banco ou infraestrutura foi alterado.

## Score Geral: 41/100

| Dimensão | Score | Status |
|----------|-------|--------|
| TypeScript & Qualidade | 3/10 | ❌ |
| Arquitetura de Camadas | 4/10 | ⚠️ |
| Banco de Dados | 5/10 | ⚠️ |
| Frontend & UI | 6/10 | ⚠️ |
| API Design | 3/10 | ❌ |
| State Management | 6/10 | ⚠️ |
| Segurança & DevSecOps | 3/10 | 🔴 |
| Testes | 3/10 | ❌ |
| Observabilidade | 3/10 | ❌ |
| DevOps & CI/CD | 3/10 | ❌ |
| Multi-tenancy | 6/10 | ⚠️ |
| LGPD & Privacy | 4/10 | ⚠️ |

(Soma 49/120, normalizada para 100.)

---

## 🔴 Críticos (resolver antes de nova feature e antes do cutover para Cloudflare)

1. **21 funções `SECURITY DEFINER` executáveis por `anon`** (sem login) via `/rest/v1/rpc/*` — ignoram RLS. Mais sensíveis: `atualizar_lead_por_whatsapp` (altera lead por número), `criar_lead_organico`, `find_lead_by_phone_digits(p_digits, p_user_id)` (consulta lead de qualquer usuário conhecendo o id), `get_user_by_webhook_url`, `get_user_by_evolution_instance`, `purge_expired_raw_payloads`, `generate_user_webhook_url`. Fonte: Supabase security advisor. Exploração real ainda não testada (`devsecops:attack-validation`).
2. **`next@14.2.35` com vulnerabilidade CRITICAL** (`npm audit`); a correção só existe em major nova (16.x). Next 14 está fora de suporte. **Acopla com a migração:** `@opennextjs/cloudflare` ≥1.16 exige Next ≥15.5 — hoje o projeto está preso no adapter 1.15.1. Upgrade de Next é pré-requisito de segurança *e* de uma migração sustentável.
3. **E-mail do admin hardcoded como portão de autorização** em 4 pontos: `lib/supabase/middleware.ts:99` (pula o bloqueio de `pending_setup`), `app/(protected)/pending/page.tsx:16`, `app/api/admin/init-user-settings/route.ts:27`, `app/api/admin/fix-admin/route.ts:10`.
4. **`app/api/admin/fix-admin`** — rota "temporária, DELETE após usar" ainda em produção; usa `service_role` sem checar se o chamador é admin (qualquer usuário autenticado chama). Impacto atual limitado (só reafirma o admin dono), mas é superfície desnecessária.
5. **Sem pipeline de segurança** — não existe `.github/workflows/` (nem Gitleaks/Semgrep/Trivy, nem CI de build/teste).

## ❌ Alta Prioridade

- **TypeScript não-strict**: `strict: false`, `noImplicitAny: false`, `strictNullChecks: false`; 134 usos de `any`; 122 `@ts-ignore`/`eslint-disable`.
- **Validação Zod** em só 10 de 46 route handlers.
- **Formato de resposta da API inconsistente** (`{ error: "string" }` ×185, `{ success }`, `{ ok }`, `{ data }`) — padrão IntelliX é `{ data, meta }` / `{ error: { code, message } }`.
- **Rate limiting** em só 1 rota (`init-user-settings`); ausente em busca LinkedIn/Apify, geração IA, webhooks.
- **`service_role` em 45 arquivos** — bypassa RLS; cada uso precisa de filtro explícito por `organization_id`/`user_id` (revisar com `multi-tenant-reviewer`).
- **Histórico de migrations dessincronizado** nos dois sentidos: banco 40 registradas × repo 31 arquivos. ~15 arquivos locais nunca registrados (aplicados via SQL Editor: `user_roles`, `webhook_keys`, `import_history`, `audit_logs_v2`…) e várias remotas ausentes do repo (`linkedin_channel_core`, `linkedin_lgpd`, lote 2026-01/02). Banco não é reproduzível a partir do repo.
- **`supabase/config.toml`** com `project_id = "swkukafujhsyfaoojhfj"` (inexistente); correto: `kzvnwqlcrtxwagxkghxq`.
- **LLM sem guardrails** — 16 arquivos chamam OpenAI; não há `guardrails.ts` nem `pii-redactor.ts`, e o sistema envia dados de leads (nome, telefone, empresa) ao modelo.
- **Sem error tracking** (Sentry ou equivalente).
- **npm audit**: 1 critical, 5 high (`next`, `postcss`, `zod`, `picomatch`, `source-map-js`, `xlsx` — este sem correção disponível; avaliar substituição por `exceljs`/SheetJS CDN).

## ⚠️ Média Prioridade

- **Camadas puladas**: 32 de 46 route handlers fazem `.from()` direto; 18 componentes/páginas acessam Supabase direto. Existem `src/lib/repositories/` (9) e `src/lib/services/` (15) — padrão começou, não foi aplicado no legado.
- **God files**: `app/(protected)/settings/page.tsx` (1520 linhas), `ProspectionForm.tsx` (959), `leads/page.tsx` (846), `ImportLeadsModal.tsx` (778), `supabaseCRM.ts` (696).
- **Código zumbi da era Vite**: `index.html`, `vite.config.ts` (+2 `.timestamp-*.mjs`), `src/App.tsx`, `src/main.tsx`, `src/vite-env.d.ts`, `react-router` em `src/App.tsx`, `tsconfig.app.json`.
- **Duplicação**: `lib/supabaseCRM.ts` e `src/lib/supabaseCRM.ts` divergentes; pastas `lib/` e `src/lib/` coexistem.
- **Lixo na raiz**: `build-*.txt`, `tsc-errors.txt`, `repomix-output.xml`, ~12 `.sql` soltos (`EXECUTAR_NO_SUPABASE*.sql`, `FIX_*.sql`), scripts `.ps1`.
- **16 funções sem `search_path` fixo**; extensão `vector` no schema `public`; *leaked password protection* desligada no Auth.
- **Documentação desatualizada**: `CLAUDE.md` descreve Vite/React Router; `DEPLOY_VERCEL.md` obsoleto.
- **8 branches remotas não mescladas** a triar (`v2`, `feature/consultant-inbox`, `feature/native-workflow-engine-*` (cliente legado), `feature/agent-improvements-phases-1-2-3-5`, `feature/atualizacoes-sistema`, `fix/city-dropdown-static`, `claude/fix-vercel-deploy-YTENE`, `copilot/*`).
- **LGPD**: faltam `consent_records`, `titular_requests`, `data_processing_log`; sem endpoint de exportação/exclusão do titular para leads.
- **Testes**: 9 specs Vitest (unit/parity/load) + suíte E2E em Python fora do padrão (Playwright TS); nenhuma roda em CI.

## ✅ Pontos Positivos

- **RLS ativo nas 30 tabelas** do schema `public`.
- **Multi-tenant por organização** já implementado (`organizations`, `organization_members`, roles admin/operador/visualizador) com correção de isolamento RLS aplicada (set/2026).
- **LGPD no canal LinkedIn bem feito**: `linkedin_suppression_list` (direito ao apagamento), `linkedin_raw`/`enrichment_raw` com retenção de 90 dias e purge.
- **Security headers** configurados em `next.config.js` (CSP, X-Frame-Options); CORS sem hardcode de domínio.
- **Audit log** (`audit_logs`, 93 registros).
- **Migração Cloudflare ~50% adiantada** (ver `CLOUDFLARE_MIGRATION_PLAN.md`): OpenNext 1.15.1 + `wrangler.jsonc` + `custom-worker.ts` com handler `scheduled()` para os 4 crons, `cf:build` passando, script de secrets pronto, decisões de domínio (`*.workers.dev`) e CI (Workers Builds) tomadas.
- Repositórios/serviços novos (canal LinkedIn) já seguem o padrão de camadas.
- App Router, shadcn/ui, TanStack Query.

---

## DevSecOps
CI/CD `security.yml`: ❌ | Tabelas LGPD: ❌ | Guardrails LLM: ❌ | npm audit: ❌ (1 critical, 5 high)

---

## Roadmap de Refatoração Integrado à Migração Cloudflare (proposta — aguarda aprovação)

> Ordem: segurança → base técnica → migração → qualidade. O cutover para Cloudflare só acontece com o `devsecops:security-gate == PASS`, então os críticos vêm antes.

### Sprint 0 — Higiene e DevSecOps Retrofit (~meio dia)
- [ ] Corrigir `supabase/config.toml` (`project_id`).
- [ ] Criar `.github/workflows/security.yml` (Gitleaks + Semgrep + Trivy) e `ci.yml` (lint + typecheck + test + `cf:build`).
- [ ] Remover lixo da raiz e mover `.sql` soltos para `docs/sql-legado/`.
- [ ] Atualizar `CLAUDE.md` para a stack real.
- [ ] Triar as 8 branches remotas não mescladas (decisão do usuário).

### Sprint 1 — Segurança crítica (~2–3 dias)
- [ ] Migration: `REVOKE EXECUTE … FROM anon, authenticated` nas funções `SECURITY DEFINER` que não são chamadas pelo cliente; fixar `search_path` nas 16+ funções; manter `EXECUTE` só onde o app chama via RPC autenticada (mapear chamadas antes).
- [ ] Validar com `devsecops:attack-validation` (antes/depois).
- [ ] Trocar e-mail hardcoded por checagem de role (`user_settings.role = 'admin'` / `is_admin()`) ou `ADMIN_EMAIL` em env.
- [ ] Remover `app/api/admin/fix-admin`.
- [ ] Ligar *leaked password protection* no Auth (ação no dashboard).
- [ ] Revisar os 45 usos de `service_role` (`multi-tenant-reviewer`).

### Sprint 2 — Base técnica: upgrade Next + reconciliação do banco (~3–5 dias)
- [ ] **Decisão:** Next 14 → 15.5 (mínimo do OpenNext atual) ou direto para 16 (padrão IntelliX). Upgrade de `@opennextjs/cloudflare` para a versão atual junto.
- [ ] Remover código zumbi Vite e duplicação `lib/` × `src/lib/`.
- [ ] Reconciliar migrations: `supabase db pull` / dump do schema remoto → baseline no repo; registrar as locais já aplicadas.
- [ ] Resolver `npm audit` (zod 4, substituir `xlsx`).

### Sprint 3 — Migração Vercel → Cloudflare (Fases 3, 6, 7, 8 do `CLOUDFLARE_MIGRATION_PLAN.md`)
- [ ] Fase 3: `wrangler login` (usuário) + `scripts/cloudflare-secrets-sync.sh`.
- [ ] Conectar Workers Builds ao repo (dashboard — usuário).
- [ ] Fase 6: staging no Cloudflare — validar login, prospecção Google/LinkedIn, kanban, WhatsApp, crons, `pdf-parse` no runtime Workers, middleware.
- [ ] Gate: `intellix:test-e2e` + `devsecops:security-gate == PASS`.
- [ ] Fase 7: cutover manual via `/intellix:deploy`; atualizar webhooks (Evolution/Meta/n8n) para a URL nova; Vercel pausada 1–2 semanas para rollback.
- [ ] Fase 8: remover `vercel.json`, `DEPLOY_VERCEL.md` → `DEPLOY_CLOUDFLARE.md`.

### Sprint 4 — Qualidade contínua (incremental, pós-migração)
- [ ] TypeScript strict progressivo (por pasta), zerar `any`.
- [ ] Padronizar respostas de API + Zod em todos os handlers + rate limit (Upstash já presente).
- [ ] Mover queries de route handlers/componentes para repositories/services; quebrar god files.
- [ ] Sentry/observabilidade (Workers Logs + error tracking).
- [ ] LGPD: guardrails LLM + `pii-redactor`, tabelas de consentimento/titular.
- [ ] E2E Playwright TS para fluxos críticos.
