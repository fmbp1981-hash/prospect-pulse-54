# Sprint 3 — Migração Vercel → Cloudflare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servir o LeadFinder Pro em produção pelo Worker `prospect-pulse-54` no Cloudflare, com os conectores por organização (PR #20) ligados, o agendamento nativo (Cron Triggers e Queue) no lugar do n8n e a Vercel pausada.

**Architecture:** O código sai da branch `claude/sprint3-cloudflare`, criada a partir de `claude/sprint2b-conectores`, porque o consumidor da fila envia pela conexão de WhatsApp da organização, que só existe no #20. A Parte A (Tasks 1–4) é código testável. A Parte B é o corte operacional: um runbook único, com passos do usuário e passos que exigem autorização naquele momento. A Parte C (Task 5) é a limpeza depois de 24 h de observação. O cron de follow-up passa a só *despachar* (claim + `sendBatch`). O consumidor da fila chama uma rota interna do Next, com o mesmo padrão `handler.fetch` + `CRON_SECRET` que o `scheduled()` já usa. Assim toda a regra de negócio continua no app Next.

**Tech Stack:** Next.js 14.2 (App Router), `@opennextjs/cloudflare` ^1.15.1, Wrangler 4, Cloudflare Workers Paid (Cron Triggers e Queues), Supabase (`kzvnwqlcrtxwagxkghxq`), Vitest, Zod.

**Spec:** `docs/superpowers/plans/2026-10-30-ajuste-sistema-e-migracao-cloudflare.md` (seção "SPRINT 3" + ADR), `CLOUDFLARE_MIGRATION_PLAN.md` (Fases 3, 5–8) e `docs/runbooks/corte-conectores.md` (corte do #20).

## Global Constraints

- **Ordem decidida pelo usuário:** Sprint 3 antes do Sprint 2. O Sprint 3 roda em Next 14, sem upgrade de framework.
- Nenhum cutover sem `devsecops:security-gate == PASS`. O deploy de produção é manual (`/intellix:deploy`, pelo usuário).
- Migration, `DELETE` ou `UPDATE` em produção: só com autorização explícita do usuário naquele momento, rollback no mesmo PR e backup prévio em `scripts/legacy/backup-<data>-<tema>.json`.
- Ações em painel (Cloudflare, Vercel, n8n, Meta, Evolution) são do usuário. O executor para e pede.
- Nunca imprimir valores de `.env`, `.env.local` ou secrets.
- Domínio: `*.workers.dev`, sem domínio próprio (Fase 4). O subdomínio exato vem de `npx wrangler whoami`.
- Conta Cloudflare: **Workers Paid**. No plano Free o SSR e os crons estouram 10 ms de CPU.
- Agendador único: Cron Triggers `* * * * *` (follow-up), `0 * * * *` (rescue-human-mode) e `0 12 * * 1-5` (long-followup). O keepalive é removido.
- Fila `follow-up-sends` (binding `FOLLOW_UP_QUEUE`): `max_batch_size` 10, `max_concurrency` 2, `max_retries` 3, DLQ `follow-up-sends-dlq`.
- Staging sem Cron Triggers e sem fila (`env.staging`), para não haver dois agendadores contra o banco de produção.
- Sem n8n: os 3 workflows "LeadFinder Pro" (`NE6oZxj0il18ZDUk`, `cTN9Q6FjuuguALdF`, `024Gues9qK94oCgI`) são desativados no mesmo passo em que o cron do Cloudflare assume.
- A Evolution não tem instância ativa (config limpa em 2026-11-01). Não há webhook de WhatsApp para migrar no corte.
- Commits semânticos terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Follow-up enviado duas vezes por atraso da fila:** se uma mensagem ficar na fila mais tempo que a trava do claim (5 min), o cron seguinte reivindica o mesmo lead. Espera-se no máximo um envio por `follow_up_count`. A Task 2 confere `follow_up_count == followUpCount` antes de enviar e limita o retry a 30 s × 3. Teste: `skips when follow_up_count advanced`.
2. **`sendBatch` falha depois do claim:** os leads ficariam travados 5 min sem envio. Espera-se a liberação imediata dos claims. Teste na Task 2: `releases claims when sendBatch throws`.
3. **Mensagem do WhatsApp cortada no Worker:** sem `ctx.waitUntil`, o processamento depois do 200 morre. Espera-se que a mensagem seja salva no Inbox. Teste na Task 1 e smoke no staging (B4).
4. **Rota interna chamada de fora:** `/api/internal/follow-up/process` dispara envios. Espera-se 401 sem `Bearer CRON_SECRET` e 400 com corpo fora do schema. Testes na Task 2.
5. **Staging consumindo produção:** um Cron Trigger no staging duplicaria os envios. Espera-se `env.staging` sem `triggers` e sem `queues`. Verificação na Task 3, Step 6.

---

# PARTE A — Código (branch `claude/sprint3-cloudflare`)

### Task 1: `waitUntil` do Cloudflare no lugar de `@vercel/functions`

**Files:**
- Create: `src/lib/runtime/after-response.ts`
- Modify: `src/lib/webhooks/connection-inbound.handler.ts:27,202-210`
- Modify: `tests/unit/connection-webhook.spec.ts:14`, `tests/unit/legacy-webhook-inbound-status.spec.ts:14`, `tests/unit/webhook-auth.spec.ts:14` (trocar o mock para `@/lib/runtime/after-response`)
- Modify: `package.json` (remover `@vercel/functions`)
- Test: `tests/unit/after-response.spec.ts`

**Interfaces:**
- Produces: `runAfterResponse(task: Promise<unknown>): void`. Registra a promise em `getCloudflareContext().ctx.waitUntil`. Quando não há contexto (Vitest ou `next dev` sem ctx), não lança erro, deixa a promise correr e loga a rejeição com `console.error('[after-response]', …)`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// tests/unit/after-response.spec.ts
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
it('registers the task in ctx.waitUntil', () => {
  const waitUntil = vi.fn();
  vi.mocked(getCloudflareContext).mockReturnValue({ ctx: { waitUntil } } as never);
  const task = Promise.resolve();
  runAfterResponse(task);
  expect(waitUntil).toHaveBeenCalledWith(task);
});
it('does not throw without Cloudflare context and logs rejection', async () => {
  vi.mocked(getCloudflareContext).mockImplementation(() => { throw new Error('no ctx'); });
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => runAfterResponse(Promise.reject(new Error('boom')))).not.toThrow();
  await new Promise((r) => setTimeout(r, 0));
  expect(spy).toHaveBeenCalledWith('[after-response]', expect.any(Error));
});
```

- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run tests/unit/after-response.spec.ts`. Esperado: FAIL, módulo não encontrado.
- [ ] **Step 3: Implementar `runAfterResponse`** e trocar o import e a chamada em `connection-inbound.handler.ts`. Atualizar os três mocks de teste para `vi.mock('@/lib/runtime/after-response', () => ({ runAfterResponse: (p: Promise<unknown>) => p }))`. Rodar `npm uninstall @vercel/functions`.
- [ ] **Step 4: Verificar.** `npm test` passa, `npx tsc --noEmit` limpo e `git grep -n "@vercel/functions" -- src app package.json` sem resultado.
- [ ] **Step 5: Commit** `refactor: troca waitUntil da Vercel pelo ctx.waitUntil do Cloudflare`

### Task 2: Follow-up despachado pela fila

**Files:**
- Create: `src/lib/jobs/follow-up.queue.ts` (tipos, despacho, processamento de uma mensagem)
- Modify: `src/lib/jobs/follow-up.job.ts` (extrair o envio de um lead para uma função reutilizada pelo job atual e pela fila)
- Modify: `src/lib/repositories/lead.repository.ts` (adicionar `findById`)
- Create: `app/api/internal/follow-up/process/route.ts`
- Modify: `app/api/cron/follow-up/route.ts` (despacha pela fila quando houver `FOLLOW_UP_QUEUE`; senão roda `runFollowUpJob()` como hoje)
- Test: `tests/unit/follow-up-queue.spec.ts`, `tests/unit/follow-up-process-route.spec.ts`

**Interfaces:**
- Consumes: `leadRepository.claimDueFollowUps(limit)`, `releaseFollowUpClaim(id)` e `incrementFollowUpCount(id)` (existentes); `getWhatsAppForOrganization(orgId)` e `resolveLeadOrganizationId(lead)` (PR #20).
- Produces:
  - `leadRepository.findById(id: string): Promise<LeadRow | null>` (service_role, somente servidor)
  - `type FollowUpMessage = { leadId: string; followUpCount: number }`
  - `interface FollowUpQueue { sendBatch(messages: { body: FollowUpMessage }[]): Promise<void> }`
  - `dispatchDueFollowUps(queue: FollowUpQueue, limit = 100): Promise<number>`: claim, um `sendBatch` com todos e retorno da quantidade. Se `sendBatch` lançar, libera todos os claims e relança.
  - `type FollowUpOutcome = 'sent' | 'skipped' | 'retry'`
  - `processFollowUpMessage(msg: FollowUpMessage): Promise<FollowUpOutcome>`: lead inexistente ou `follow_up_count !== msg.followUpCount` → `'skipped'`. Sem WhatsApp, sem organização ou sem conexão → libera o claim e retorna `'skipped'`. Envio com sucesso → incrementa e retorna `'sent'`. Falha de envio → `'retry'`.
  - `sendFollowUpToLead(lead: LeadRow, whatsappFor: (orgId: string) => Promise<OrgWhatsApp | null>): Promise<'sent' | 'released' | 'failed'>`: a lógica de envio extraída de `runFollowUpJob`, usada pelas duas rotas.
  - Rota `POST /api/internal/follow-up/process`. Exige `Authorization: Bearer <CRON_SECRET>` via `verifyCronRequest`. Corpo validado por Zod: `{ messages: { id: string; leadId: string (uuid); followUpCount: int 0–2; attempts: int ≥1 }[] }` (máx. 10). Resposta `{ data: { results: { id: string; outcome: FollowUpOutcome }[] } }`. Quando `outcome === 'retry'` e `attempts >= 3`, a rota libera o claim antes de responder.

- [ ] **Step 1: Escrever os testes que falham** em `tests/unit/follow-up-queue.spec.ts`, com mock de `leadRepository` e `getWhatsAppForOrganization`:
  - `dispatches one message per claimed lead`: 2 leads com `follow_up_count` 0 e 1 → `sendBatch` recebe `[{ body: { leadId, followUpCount: 0 } }, { body: { leadId, followUpCount: 1 } }]` e retorna `2`.
  - `releases claims when sendBatch throws`: `sendBatch` rejeita → `releaseFollowUpClaim` chamado 2 vezes e a promise rejeita.
  - `does not call sendBatch when nothing is due`: claim vazio → retorna `0`.
  - `skips when follow_up_count advanced`: `findById` devolve `follow_up_count: 1` para `msg.followUpCount: 0` → `'skipped'` e `sendText` não chamado.
  - `sends and increments`: `sendText` → `{ success: true }` → `'sent'` e `incrementFollowUpCount(leadId)`.
  - `returns retry on send failure`: `{ success: false }` → `'retry'` e nenhum incremento.
  - `skips without whatsapp connection`: `ConnectionNotConfiguredError` → `'skipped'` e `releaseFollowUpClaim(leadId)`.
- [ ] **Step 2: Escrever os testes da rota** em `tests/unit/follow-up-process-route.spec.ts`: `401 without bearer`, `400 on invalid body` (`followUpCount: 7`), `200 returns outcomes per id` e `releases claim on last retry attempt` (`attempts: 3` + `'retry'` → `releaseFollowUpClaim`).
- [ ] **Step 3: Rodar e ver falhar.** `npx vitest run tests/unit/follow-up-queue.spec.ts tests/unit/follow-up-process-route.spec.ts`. Esperado: FAIL.
- [ ] **Step 4: Implementar.** Extrair `sendFollowUpToLead` de `runFollowUpJob`, que passa a só iterar e chamá-la, sem mudar o comportamento atual. A rota de cron lê `FOLLOW_UP_QUEUE` com `getCloudflareContext({ async: true })` dentro de `try`: com o binding, chama `dispatchDueFollowUps`; sem ele, chama `runFollowUpJob()`.
- [ ] **Step 5: Verificar.** `npm test` passa (os testes antigos de follow-up seguem verdes) e `npx tsc --noEmit` está limpo.
- [ ] **Step 6: Commit** `feat: follow-up despachado por Cloudflare Queue com rota interna de processamento`

### Task 3: Worker — fila, consumidor, crons e ambiente de staging

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `custom-worker.ts`
- Create: `src/worker/follow-up-consumer.ts` (lógica pura do consumidor, testável sem `.open-next`)
- Delete: `app/api/cron/keepalive/route.ts`, `src/lib/jobs/supabase-keepalive.job.ts`; `leadRepository.keepAlive` (`lead.repository.ts:218`)
- Modify: `worker-configuration.d.ts` (regenerar com `npx wrangler types`)
- Test: `tests/unit/follow-up-consumer.spec.ts`

**Interfaces:**
- Consumes: a rota `POST /api/internal/follow-up/process` e `FollowUpOutcome` (Task 2).
- Produces: `handleFollowUpBatch(batch: MessageBatch<FollowUpMessage>, callRoute: (req: Request) => Promise<Response>, cronSecret: string): Promise<void>`. Monta um POST com `{ messages: [{ id, leadId, followUpCount, attempts }] }`. Para cada resultado: `'sent'` e `'skipped'` → `msg.ack()`; `'retry'` → `msg.retry({ delaySeconds: 30 })`. Resposta não-OK ou erro de rede → `batch.retryAll({ delaySeconds: 30 })`.

- [ ] **Step 1: Escrever os testes que falham:** `acks sent and skipped`, `retries with 30s delay on retry outcome`, `retryAll on non-ok response` e `sends bearer CRON_SECRET`.
- [ ] **Step 2: Rodar e ver falhar.** `npx vitest run tests/unit/follow-up-consumer.spec.ts`
- [ ] **Step 3: Implementar `handleFollowUpBatch`** e ligar no `custom-worker.ts` como `queue(batch, env, ctx)`, com `callRoute = (req) => handler.fetch(req, env, ctx)` e URL `https://internal/api/internal/follow-up/process`. Remover `'0 0 */5 * *'` de `CRON_ROUTES`.
- [ ] **Step 4: Editar o `wrangler.jsonc`:**
  - `triggers.crons`: `["* * * * *", "0 * * * *", "0 12 * * 1-5"]`.
  - `queues.producers`: `[{ "binding": "FOLLOW_UP_QUEUE", "queue": "follow-up-sends" }]`.
  - `queues.consumers`: `[{ "queue": "follow-up-sends", "max_batch_size": 10, "max_batch_timeout": 5, "max_concurrency": 2, "max_retries": 3, "dead_letter_queue": "follow-up-sends-dlq" }]`.
  - `env.staging`: `name` `prospect-pulse-54-staging`, `triggers: { "crons": [] }`, sem `queues`, `services` com `WORKER_SELF_REFERENCE` → `prospect-pulse-54-staging` e as mesmas `vars`. `NEXT_PUBLIC_APP_URL` aponta para a URL de staging.
  - `vars.NEXT_PUBLIC_APP_URL` fica com o subdomínio real, confirmado no passo B1.
- [ ] **Step 5: Apagar o keepalive** (rota, job, `keepAlive` e as referências em testes e docs: `git grep -n -i keepalive`). Rodar `npx wrangler types`.
- [ ] **Step 6: Verificar.** Rodar `npm test`, `npx tsc --noEmit`, `npm run cf:build` e `npx wrangler deploy --dry-run --outdir .wrangler/dry`, todos sem erro. `npx wrangler deploy --dry-run --env staging --outdir .wrangler/dry-staging` não deve listar triggers nem queues.
- [ ] **Step 7: Commit** `feat: consumidor da fila de follow-up, crons sem keepalive e ambiente de staging`

### Task 4: Secrets, runbook de corte e ADR

**Files:**
- Modify: `scripts/cloudflare-secrets-sync.sh`
- Create: `docs/runbooks/cutover-cloudflare.md` (a Parte B, passo a passo executável)
- Create: `docs/adr/0001-agendamento-cron-triggers-e-queues.md` (copiar a tabela ADR do plano mestre, mais o contexto e a consequência)
- Modify: `CLOUDFLARE_MIGRATION_PLAN.md` (Fases 3, 6 e 7 apontam para o runbook novo)

**Interfaces:**
- Produces: `scripts/cloudflare-secrets-sync.sh [--dry-run] [--env staging]`.
  - `SECRET_VARS` passa a ser `SUPABASE_SERVICE_ROLE_KEY CRON_SECRET CONNECTORS_MASTER_KEY_V1 CONNECTORS_ACTIVE_KEY_VERSION UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN`.
  - As credenciais de provedor saem da lista: elas ficam em `platform_credentials` e `organization_connections`.
  - `CONFIG_VARS` passa a ser só `NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY NEXT_PUBLIC_APP_URL`.
  - Variável ausente → o script lista e termina com código 1 antes de enviar qualquer coisa.

- [ ] **Step 1: Editar o script.** Rodar `bash -n scripts/cloudflare-secrets-sync.sh` (sem erro de sintaxe) e `./scripts/cloudflare-secrets-sync.sh --dry-run`. Esperado: só nomes e "presente/ausente", nunca valores.
- [ ] **Step 2: Escrever `docs/runbooks/cutover-cloudflare.md`** com os passos B1–B9 abaixo, cada um com dono, comando, verificação e rollback. Incorpora os passos 1, 2, 4, 6 e 7 de `corte-conectores.md`. Os passos 3 e 8 (Evolution e webhooks) viram "não se aplica, sem instância ativa; ver 2026-11-01".
- [ ] **Step 3: Escrever o ADR 0001.**
- [ ] **Step 4: Commit** `docs: runbook de cutover Cloudflare, ADR de agendamento e secrets atualizados`
- [ ] **Step 5: PR.** Abrir PR `claude/sprint3-cloudflare` → `main`, empilhado sobre o #20 e marcado "mergear junto com o #20 no passo B6". Rodar `superpowers:requesting-code-review` e a frota de revisores DevSecOps sobre o diff.

---

# PARTE B — Corte (runbook `docs/runbooks/cutover-cloudflare.md`)

Dono: **U** = usuário, **E** = executor. **[auth]** = autorização explícita naquele momento.

- [ ] **B1. Conta (U):** assinar o Workers Paid. Rodar `npx wrangler login` no terminal (`! npx wrangler login`). O executor roda `npx wrangler whoami` e grava o subdomínio `*.workers.dev` em `vars.NEXT_PUBLIC_APP_URL`.
- [ ] **B2. Filas (E, [auth]):** `npx wrangler queues create follow-up-sends` e `npx wrangler queues create follow-up-sends-dlq`.
- [ ] **B3. Banco e chave (E/U, [auth]):** passo 1 de `corte-conectores.md`: backup e aplicação de `20261031100000_organization_connections.sql`, depois `tests/db/organization-connections.sql` e `tests/db/function-privileges.sql`. O usuário gera `CONNECTORS_MASTER_KEY_V1` (`openssl rand -base64 32`), guarda no cofre e grava em `.env.local`. Em seguida, `./scripts/cloudflare-secrets-sync.sh --dry-run`, revisão com o usuário e envio real para produção e `--env staging`.
- [ ] **B4. Staging (E, [auth]):** `npm run cf:build && npx wrangler deploy --env staging`. Smoke em staging, sem crons: login, dashboard, leads, kanban, inbox, Configurações, Integrações, prospecção Google e LinkedIn, upload de PDF (`pdf-parse`). Conferir os Workers Logs sem erro. `npx wrangler dev --test-scheduled` local + `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"` → a fila recebe o despacho (log `Claimed`/`dispatched`).
- [ ] **B5. Gates (E):** `intellix:test-e2e` (smoke dos fluxos acima) e `devsecops:security-gate`. Os dois precisam dar PASS.
- [ ] **B6. Virada (U + E, [auth], fora das 12:00 UTC em dia útil):**
  1. U: pausar o projeto `prospect-pulse-54` na Vercel. Assim o merge na `main` não publica lá código sem as variáveis novas.
  2. U: conectar o Workers Builds ao repositório (build `npm run cf:build`, deploy `npx wrangler deploy`, branch `main`).
  3. E: merge do #20, depois do PR do Sprint 3, na `main`, e acompanhar o build até o deploy.
  4. U: desativar os 3 workflows do n8n.
  5. E: Workers Logs mostram `scheduled` do `* * * * *` sem erro em 2 minutos seguidos.
- [ ] **B7. Conectores (E/U, [auth]):** passos 4, 6 e 7 de `corte-conectores.md`: `scripts/migrate-connections.ts --dry-run`, revisão, `--apply` com backup; o usuário cadastra as credenciais da plataforma (OpenAI, Resend, Google Places, Apify, Firecrawl); testa e ativa as conexões. O WhatsApp fica "não configurado" até existir uma instância nova.
- [ ] **B8. Smoke de produção (E):** o mesmo de B4 na URL `*.workers.dev`, mais `GET /api/cron/follow-up` sem bearer → 401.
- [ ] **B9. Observar 24 h (E):** Workers Logs sem 5xx novos; `follow-up-sends-dlq` vazia; backlog da fila sem crescer. Rollback em qualquer ponto até aqui: despausar a Vercel, reativar os workflows do n8n e reverter o merge na `main`.

---

# PARTE C — Limpeza pós-corte (após B9 sem incidentes)

### Task 5: Remover a Vercel e o código legado

**Files:**
- Delete: `vercel.json`, `.vercelignore`, `DEPLOY_VERCEL.md`
- Create: `DEPLOY_CLOUDFLARE.md` (Workers Builds, secrets, filas, rollback)
- Modify: `app/api/cron/follow-up/route.ts` (remover o fallback `runFollowUpJob()`; sem `FOLLOW_UP_QUEUE` → 500 `{ error: { code: 'QUEUE_UNAVAILABLE', … } }`)
- Modify: `CLAUDE.md` do projeto (Deploy: "Current: Cloudflare Workers"), `CLOUDFLARE_MIGRATION_PLAN.md` (status final)
- Merge: `claude/sprint2b-limpeza-pos-corte`, conforme o passo 11 de `corte-conectores.md`: portão de tráfego, backups e migration `20261031110000` **[auth]**

- [ ] **Step 1: Teste da rota sem fila.** O teste `returns 500 QUEUE_UNAVAILABLE without binding` falha; implementar e ver passar.
- [ ] **Step 2: Remover os arquivos e atualizar a documentação.** `git grep -n "vercel.app\|@vercel/" -- app src lib scripts '*.md' ':!docs/superpowers' ':!CHANGELOG.md'` sem resultado.
- [ ] **Step 3: Verificar.** `npm test`, `npx tsc --noEmit` e `npm run cf:build` verdes.
- [ ] **Step 4: Commit e PR.** Commit `chore: remove Vercel e fallback do follow-up após o cutover`. Abrir o PR. O usuário decide quando apagar o projeto na Vercel, que fica pausado por 1 a 2 semanas.

**Critério de saída do Sprint 3:** produção servida pelo Worker; Cron Triggers disparando; DLQ vazia após 48 h; nenhum workflow do n8n deste sistema ativo; Vercel pausada; rollback documentado e testado em leitura (B9).
