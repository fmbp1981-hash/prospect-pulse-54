# Ajuste do Sistema + Migração Vercel → Cloudflare — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar o LeadFinder Pro de score 41/100 a um estado sem críticos de segurança, em Next 16, hospedado em Cloudflare Workers, com CI e banco reproduzível.

**Architecture:** Cinco sprints sequenciais. Este documento detalha em nível executável os **Sprints 0 e 1** (higiene + CI, segurança crítica). Os **Sprints 2, 3 e 4** estão como marcos com escopo e critério de saída; cada um recebe seu próprio plano detalhado (`superpowers:writing-plans`) quando o anterior fechar — o upgrade para Next 16 (Sprint 2) muda arquivos e APIs que os Sprints 3–4 tocam, então detalhá-los agora geraria plano obsoleto.

**Tech Stack:** Next.js 14.2.35 → 16 (App Router), TypeScript, Supabase (Postgres 17, projeto `kzvnwqlcrtxwagxkghxq`), `@opennextjs/cloudflare`, Wrangler 4, Vitest, GitHub Actions.

**Spec:** `docs/intellix-audit-2026-10-30.md` (auditoria Fase 00b) + `CLOUDFLARE_MIGRATION_PLAN.md` (fases 1–8 da migração).

## Global Constraints

- Ordem aprovada: Sprint 0 → 1 → 2 → 3 → 4. Nenhum cutover para Cloudflare antes de `devsecops:security-gate == PASS`.
- Versão alvo do framework: **Next 16** (decisão do usuário, 2026-10-30).
- Toda mudança em branch `claude/<sprint>-<tema>`; merge em `main` só via PR aprovado pelo usuário.
- **Migration em produção** (`apply_migration` no projeto `kzvnwqlcrtxwagxkghxq`) exige autorização explícita do usuário **naquele momento**, com SQL de rollback pronto no mesmo PR.
- Ações em painel (Supabase Auth, n8n, Cloudflare, Vercel) são do usuário — o executor para e pede.
- Nunca imprimir valores de `.env`/`.env.local` nem chaves em logs, commits ou respostas.
- Commits semânticos (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`), terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Não alterar `src/components/ui/` (gerado pelo shadcn).
- **Visão do produto:** plataforma de jornada completa do lead (prospecção → qualificação → reunião → …) de **aplicação geral**, para qualquer negócio. Este plano só corrige/ajusta o existente; features novas vêm em planos futuros. Não introduzir regra específica de um cliente. O ex-cliente que saiu da carteira ("cliente legado") deve desaparecer do projeto: código, docs, prompts, dados e workflows — removido, não generalizado (Task 3).
- **Decisões do usuário (2026-10-30):** histórico do git **não** é reescrito (só o código/dados atuais são limpos do cliente legado); conta Cloudflare vai para **Workers Paid**; Supabase **continua no Free** — antes de todo `apply_migration`/`DELETE` em produção, exportar via `execute_sql` as linhas e definições afetadas para `scripts/legacy/backup-<data>-<tema>.json` (fora do git); os 3 workflows de agendamento do n8n ficam ativos **só como despertador** até o cutover do Sprint 3.
- **Sem n8n**, salvo quando estritamente necessário e sem alternativa. Todo fluxo que hoje depende do n8n é substituído pelo equivalente nativo (Next.js route/service + Supabase `service_role` no servidor).

## Review Focus

1. **Follow-up parar ou duplicar durante a transição** — a Vercel está no plano Hobby (sem cron por minuto); hoje quem dispara `/api/cron/follow-up` a cada minuto é o n8n (~2 chamadas/min nos logs de 2026-10-30). Desligar os agendadores do n8n antes do cutover para Cloudflare para os follow-ups; ter dois agendadores ao mesmo tempo sem trava envia em dobro. Task 5 torna o envio idempotente (claim atômico) e os agendadores do n8n só são desligados no cutover (Sprint 3), no mesmo passo em que os Cron Triggers assumem.
2. **Funções-helper de RLS** (`is_org_member`, `is_org_writer`, `is_org_admin`, `is_admin`, `can_write`, `get_my_organization_id`, `get_user_tenant_id`) — se perderem `EXECUTE` para `authenticated`, toda listagem do app quebra para usuário logado. Task 5 verifica com query autenticada real.
3. **Usuário admin dono da plataforma ao trocar e-mail por role** — se `user_settings.role` do admin não for `'admin'`, ele cai em `/pending` e perde acesso. Task 6 confere o dado antes de mudar o código.
4. **Triggers que usam funções `SECURITY DEFINER`** (`set_organization_id_from_member` em 26 tabelas, `set_user_id_on_insert`, `set_tenant_and_origem_on_insert`, `set_conversation_user_id`, `handle_new_user_webhook`) — revogar `EXECUTE` não pode quebrar INSERT. Task 5 testa um INSERT autenticado.
5. **CI vermelho desde o primeiro dia** por lint/teste já quebrados hoje — Task 2 mede o baseline antes de tornar jobs bloqueantes.

---

# SPRINT 0 — Higiene e DevSecOps Retrofit

Branch: `claude/sprint0-higiene-ci`

### Task 1: Configuração, limpeza da raiz e documentação

**Files:**
- Modify: `supabase/config.toml:1` (`project_id`)
- Modify: `CLAUDE.md` (seções Technology Stack, Directory Structure, Development Workflows, Environment Variables)
- Move (git mv): `EXECUTAR_NO_SUPABASE*.sql`, `FIX_*.sql`, `LIMPAR_USUARIOS_PENDENTES.sql`, `RESET_SUPABASE_DATA_AND_SET_ADMIN.sql`, `SQL_MINIMO.sql`, `fix-rls-policies.sql` → `docs/sql-legado/`
- Delete (git rm): `build-check.txt`, `build-full.txt`, `build-log.txt`, `build-output.txt`, `build-stderr.txt`, `build-stdout.txt`, `tsc-errors.txt`, `repomix-output.xml`, `vite.config.ts.timestamp-*.mjs`
- Move (git mv): `test_api_simple.ps1`, `test_evolution_api.ps1`, `test_evolution_api.sh` → `scripts/legacy/`
- Modify: `.gitignore` (adicionar `build-*.txt`, `tsc-errors.txt`, `repomix-output.xml`, `*.timestamp-*.mjs`)

**Interfaces:**
- Produces: `supabase/config.toml` com `project_id = "kzvnwqlcrtxwagxkghxq"` (usado pela CLI no Sprint 2).

- [ ] **Step 1:** Trocar `project_id` em `supabase/config.toml` para `"kzvnwqlcrtxwagxkghxq"`.
- [ ] **Step 2:** Executar os `git mv`/`git rm` listados acima e atualizar `.gitignore`.
- [ ] **Step 3:** Reescrever as seções do `CLAUDE.md` para a stack real: Next.js 14 App Router (pasta `app/`, `middleware.ts`), `lib/` + `src/lib/` (repositories/services), Supabase multi-tenant por `organizations`/`organization_members`, deploy atual Vercel → alvo Cloudflare via OpenNext (`wrangler.jsonc`, `custom-worker.ts`, scripts `cf:*`), variáveis `NEXT_PUBLIC_SUPABASE_*`. Remover referências a Vite/React Router/`npm run dev` na porta 8080. Manter as seções de segurança/RLS.
- [ ] **Step 4: Verificar que nada quebrou**
  Run: `npm run build && npm run cf:build`
  Expected: ambos terminam com exit 0.
- [ ] **Step 5: Commit**
  `git commit -m "chore: corrige project_id do supabase, limpa raiz e atualiza CLAUDE.md"`

### Task 2: CI de build/teste e pipeline de segurança

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/security.yml` (copiar o YAML de `~/.claude/plugins/marketplaces/intellix-plugin/intellix-templates/references-template/security.md`)
- Create: `references/security.md` (cópia do mesmo template)

**Interfaces:**
- Produces: workflow `CI` com jobs `typecheck`, `lint`, `test`, `cf-build` — Sprints 2–4 dependem de `typecheck` e `cf-build` verdes.

- [ ] **Step 1: Medir baseline local**
  Run: `npx tsc --noEmit; echo "tsc=$?"; npm run lint; echo "lint=$?"; npx vitest run; echo "test=$?"`
  Registrar os três exit codes no corpo do PR.
- [ ] **Step 2:** Criar `ci.yml` (trigger: `pull_request` e `push` em `main`; Node 22; `npm ci`). Jobs: `typecheck` (`npx tsc --noEmit`), `lint` (`npm run lint`), `test` (`npx vitest run`), `cf-build` (`npm run cf:build`, env `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` com placeholders não-secretos). Todo job cujo baseline do Step 1 foi ≠ 0 recebe `continue-on-error: true` com comentário `# TODO Sprint 4: tornar bloqueante (baseline 2026-10-30 falhando)`.
- [ ] **Step 3:** Criar `security.yml` e `references/security.md` a partir do template.
- [ ] **Step 4: Validar sintaxe**
  Run: `npx --yes @action-validator/cli .github/workflows/ci.yml && npx --yes @action-validator/cli .github/workflows/security.yml`
  Expected: sem erros.
- [ ] **Step 5: Commit**
  `git commit -m "chore: adiciona CI (typecheck/lint/test/cf-build) e pipeline de seguranca"`
- [ ] **Step 6: Push e PR** — **parar e pedir autorização ao usuário** para `git push -u origin claude/sprint0-higiene-ci` e `gh pr create`. Depois: `gh pr checks --watch`. Expected: `typecheck` e `cf-build` verdes; achados do Gitleaks/Semgrep/Trivy anotados no PR para triagem (não corrigir neste sprint).

### Task 3: Remover o cliente legado do projeto

O ex-cliente saiu da carteira e não usará mais o sistema. O executor recebe o termo de busca no despacho (variável `LEGACY_TERM`) — o termo não é repetido neste plano. Levantamento de 2026-10-30: 45 arquivos versionados, 6 linhas em `agent_configs` e 1 em `rag_documents` contêm o termo; workflow n8n `acu_vtlHg2LYtUHbyRXgt` ativo; branch remota `feature/native-workflow-engine-*`.

**Files:**
- Rename (git mv): `src/lib/workflows/<legado>-lead-handler.workflow.ts` → `src/lib/workflows/lead-conversation.workflow.ts`; export `run<Legado>Workflow` → `runLeadConversationWorkflow`
- Modify: `app/api/webhooks/evolution/route.ts` (import/uso do workflow renomeado), `app/(protected)/inbox/page.tsx`, `app/(protected)/tutorial/page.tsx`, `app/api/agent/config/route.ts`, `src/lib/ai/agent-config.service.ts`, `src/lib/ai/ai-agent.service.ts`, `src/lib/ai/tools/transfer-consultant.tool.ts`, `src/lib/services/long-followup-rules.service.ts`, `src/lib/ai/rag/intellix-docs.ts`, `supabase/functions/prospection/index.ts`, `tests/load/concurrent-messages.spec.ts`, `.env.example`, `supabase/.env.example`, `scripts/cloudflare-secrets-sync.sh`, `CHANGELOG.md`, `SISTEMA_TECNICO.md`, `TUTORIAL.md`, `CLOUDFLARE_MIGRATION_PLAN.md`
- Replace: `src/lib/ai/prompts/system-prompt.v3.4.ts` e `system-prompt.v4.0.ts` → um único `src/lib/ai/prompts/default-system-prompt.ts` genérico
- Delete (git rm): `data/prompts/<legado>-*.md`, `docs/PROMPT_AGENTE_IA_<LEGADO>_*.md`, `docs/SQL_NOVOS_CAMPOS_AGENTE_v3.sql`, `feature-flags.json`, `docs/GUIA_WORKFLOW_N8N_LEADS_ORGANICOS.md`, `GUIA_INTEGRACAO_N8N.md`, `docs/n8n/`, `docs/n8n_node_atualizar_lead.json`, `supabase/functions/prospection/index.backup.ts`, `docs/superpowers/plans/2026-03-19-consultant-inbox.md` (plano antigo já executado), e — se o conteúdo for específico do cliente — `scripts/rag-docs/RAG_INST_02_Produtos_ICP_Personas.md`
- Modify: `docs/migracao-n8n.md` → reescrever como `docs/arquitetura-atendimento-whatsapp.md` (mapa do fluxo nativo, sem nomes de cliente nem n8n)
- Test: `tests/unit/organic-lead-native.spec.ts`
- Fora do escopo: migrations já aplicadas (`supabase/migrations/20260225_native_workflow_engine.sql`) não são editadas — somem na consolidação do baseline do Sprint 2.

**Interfaces:**
- Produces: `runLeadConversationWorkflow(normalized: NormalizedMessage): Promise<void>` em `src/lib/workflows/lead-conversation.workflow.ts`; `DEFAULT_SYSTEM_PROMPT: string` e `DEFAULT_SYSTEM_PROMPT_VERSION: string` em `src/lib/ai/prompts/default-system-prompt.ts`.
- Produces: o número do consultor para transferência vem só de `user_settings.consultant_whatsapp` (env `*_CONSULTANT_WHATSAPP`/`*_CONSULTANT_INSTANCE` removidas).

- [ ] **Step 1: Rede de segurança** — `tests/unit/organic-lead-native.spec.ts` com `leadRepository` mockado (padrão de `tests/unit/lead-service.spec.ts`), cobrindo `leadService.findOrCreate`: (a) número inexistente → `leadRepository.create` chamado uma vez com `whatsapp: '+5511999998888'` para entrada `'11 99999-8888'`, retorno `isNew: true`; (b) número existente → `create` não chamado, `isNew: false`; (c) `'5511999998888'` → `'+5511999998888'` (não duplica DDI). Run `npx vitest run` — Expected: tudo PASS (caracterização; se falhar, parar e tratar com `superpowers:systematic-debugging`).
- [ ] **Step 2: Confirmar que o webhook nativo recebe tudo** — para cada `evolution_instance_name` de `user_settings` (só nomes, via `execute_sql`), `GET {EVOLUTION_API_URL}/webhook/find/{instance}` com `EVOLUTION_API_KEY` de `.env` (sem ecoar a chave); listar `instance → url`. Expected: todas terminam em `/api/webhooks/evolution`. Instância apontando para o n8n → **parar** e pedir autorização ao usuário para `POST /webhook/set/{instance}`.
- [ ] **Step 3: Workflow n8n do cliente legado (usuário)** — pedir ao usuário que desative/apague `acu_vtlHg2LYtUHbyRXgt` no n8n. Os 3 workflows "LeadFinder Pro" de agendamento **continuam ativos** até o cutover (Sprint 3).
- [ ] **Step 4:** Renomear o workflow e atualizar o webhook; criar `default-system-prompt.ts` (SDR genérico em PT-BR, com placeholders preenchidos por `agent_configs`: nome da empresa, oferta, ICP, critérios de qualificação, regra de transferência para humano) e apontar `agent-config.service.ts` e `app/api/agent/config/route.ts` para ele; remover os dois prompts antigos; trocar as envs de consultor por `user_settings.consultant_whatsapp`; remover regras específicas do cliente em `long-followup-rules.service.ts` mantendo as regras genéricas; limpar os demais arquivos da lista.
- [ ] **Step 5: Verificar ausência do termo**
  Run: `git grep -il "$LEGACY_TERM" -- . ':!supabase/migrations' ':!.claude'`
  Expected: nenhuma saída.
- [ ] **Step 6:** Run `npx vitest run && npx tsc --noEmit && npm run build && npm run cf:build` — Expected: exit 0.
- [ ] **Step 7: Dados no banco** — exportar (via `execute_sql`, salvo só localmente em `scripts/legacy/backup-<data>.json`, fora do git) as 6 linhas de `agent_configs` e 1 de `rag_documents` que contêm o termo; **parar e pedir autorização explícita** para `DELETE` delas (e dos `rag_document_chunks` filhos). Com autorização, executar e confirmar contagem 0.
- [ ] **Step 8: Smoke (usuário)** — enviar mensagem de um número novo para uma instância: lead criado em `leads_prospeccao`, conversa gravada em `whatsapp_conversations`, agente responde com o prompt genérico.
- [ ] **Step 9: Commit**
  `git commit -m "refactor: remove cliente legado — workflow e prompt de atendimento genericos"`

### Checkpoint Sprint 0 — Decisão do usuário (sem código)
- [ ] Triar as 8 branches remotas não mescladas (`v2`, `feature/consultant-inbox`, `feature/native-workflow-engine-*` (do cliente legado — candidata a deletar), `feature/agent-improvements-phases-1-2-3-5`, `feature/atualizacoes-sistema`, `fix/city-dropdown-static`, `claude/fix-vercel-deploy-YTENE`, `copilot/*`): apresentar `git log main..origin/<branch> --oneline | head` de cada uma; usuário decide arquivar (deletar remota) ou manter. Executor só deleta com autorização explícita por branch.

---

# SPRINT 1 — Segurança Crítica

Branch: `claude/sprint1-seguranca`

### Task 4: Follow-up idempotente e multi-tenant (base para trocar o agendador)

Achados de 2026-10-30: `src/lib/jobs/follow-up.job.ts` envia **todos** os follow-ups pela instância única `EVOLUTION_DEFAULT_INSTANCE` (leads de outras organizações saem pelo número errado); `findLeadsForFollowUp` (`lead.repository.ts:96`) não trava as linhas, então dois disparos simultâneos (n8n + outro agendador, ou execução que passa de 1 min) mandam a mesma mensagem duas vezes; o laço serial com `setTimeout(2000)` em até 150 leads estoura o `maxDuration` de 60 s.

**Files:**
- Create: `supabase/migrations/20261030110000_follow_up_claim.sql` (+ `supabase/migrations/rollback/20261030110000_follow_up_claim.down.sql`)
- Modify: `src/lib/repositories/lead.repository.ts` (`findLeadsForFollowUp` → `claimDueFollowUps`; `incrementFollowUpCount` limpa a trava; novo `releaseFollowUpClaim`)
- Modify: `src/lib/services/tenant-resolver.service.ts` (novo `resolveInstanceForUser`)
- Modify: `src/lib/jobs/follow-up.job.ts`
- Test: `tests/unit/follow-up-job.spec.ts`, `tests/db/follow-up-claim.sql`

**Interfaces:**
- Produces (SQL): coluna `leads_prospeccao.follow_up_lock_until timestamptz null`; função `public.claim_due_follow_ups(p_limit integer default 20) returns setof public.leads_prospeccao` — `SECURITY DEFINER`, `search_path = public, pg_temp`, `EXECUTE` só para `service_role`. Seleciona com as janelas atuais (`follow_up_count` 0 → 15 min, 1 → 60 min, 2 → 1440 min desde `data_ultima_interacao`), `modo_atendimento = 'bot'`, `status_msg_wa in ('Em Conversa','Qualificando')`, `whatsapp is not null`, `follow_up_lock_until is null or < now()`, `for update skip locked`, e grava `follow_up_lock_until = now() + interval '5 minutes'` nas linhas devolvidas.
- Produces (TS): `leadRepository.claimDueFollowUps(limit?: number): Promise<LeadRow[]>`; `leadRepository.releaseFollowUpClaim(id: string): Promise<void>`; `resolveInstanceForUser(userId: string): Promise<string | null>` (lê `user_settings.evolution_instance_name`).
- Consumed by: Sprint 3 (dispatcher do Cron Trigger + fila).

- [ ] **Step 1: Teste do job (falha)** — `tests/unit/follow-up-job.spec.ts`, mockando `leadRepository`, `resolveInstanceForUser` e `sendWhatsAppText`:
  ```ts
  // envia pela instância da organização do lead, nunca por env
  expect(sendWhatsAppText).toHaveBeenCalledWith(expect.objectContaining({ instanceName: 'inst-org-a' }));
  // sem instância configurada → não envia e libera a trava
  expect(sendWhatsAppText).not.toHaveBeenCalled(); expect(leadRepository.releaseFollowUpClaim).toHaveBeenCalledWith('lead-sem-inst');
  // envio falhou → libera a trava, não incrementa
  expect(leadRepository.releaseFollowUpClaim).toHaveBeenCalledWith('lead-falha'); expect(leadRepository.incrementFollowUpCount).not.toHaveBeenCalledWith('lead-falha');
  // sucesso → incrementa
  expect(leadRepository.incrementFollowUpCount).toHaveBeenCalledWith('lead-ok');
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/follow-up-job.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Teste de banco (falha)** — `tests/db/follow-up-claim.sql`: dentro de `begin; … rollback;`, inserir um lead elegível (count 0, interação há 20 min, bot, 'Em Conversa'), chamar `claim_due_follow_ups(20)` duas vezes seguidas e retornar `(primeira_contem_lead, segunda_contem_lead)`. Expected depois da migration: `(true, false)`. Agora: erro "function does not exist".
- [ ] **Step 4:** Escrever a migration e o rollback; **parar e pedir autorização explícita** para `apply_migration`; aplicar; rodar o Step 3 — Expected: `(true, false)`.
- [ ] **Step 5:** Implementar `claimDueFollowUps` (via `rpc('claim_due_follow_ups', { p_limit })`), `releaseFollowUpClaim` (zera `follow_up_lock_until`), `incrementFollowUpCount` zerando `follow_up_lock_until` no mesmo update, `resolveInstanceForUser`; no job, trocar `findLeadsForFollowUp` por `claimDueFollowUps(20)`, resolver a instância por `lead.user_id`, remover `EVOLUTION_DEFAULT_INSTANCE`, manter as mensagens atuais e reduzir o intervalo entre envios para 1000 ms.
- [ ] **Step 6:** Run `npx vitest run && npx tsc --noEmit && npm run build` — Expected: exit 0.
- [ ] **Step 7: Verificar em produção** — após deploy na Vercel (merge autorizado), `execute_sql`: `select count(*) from leads_prospeccao where follow_up_lock_until > now() + interval '10 minutes'` → 0 (nenhuma trava presa) e conferir nos logs de `/api/cron/follow-up` que não há erro.
- [ ] **Step 8: Commit**
  `git commit -m "fix: follow-up com trava atomica e envio pela instancia de cada organizacao"`

### Task 5: Endurecer funções `SECURITY DEFINER` (privilégios + `search_path`)

**Files:**
- Create: `supabase/migrations/20261030120000_harden_security_definer_functions.sql`
- Create: `supabase/migrations/rollback/20261030120000_harden_security_definer_functions.down.sql`
- Create: `tests/db/function-privileges.sql`
- Create: `scripts/attack-validation/rpc-anon-probe.sh`

**Interfaces:**
- Produces: matriz de privilégios final (consumida pelo gate do Sprint 1 e pelo `database-architect`):

| Grupo | Funções | anon | authenticated | service_role |
|---|---|---|---|---|
| A — só trigger | `set_organization_id_from_member`, `set_user_id_on_insert`, `set_tenant_and_origem_on_insert`, `set_conversation_user_id`, `handle_new_user_webhook`, `leads_enqueue_trigger_function` | ✗ | ✗ | ✓ |
| B — helper de RLS | `is_admin`, `can_write`, `is_org_admin`, `is_org_member`, `is_org_writer`, `get_my_organization_id`, `get_user_tenant_id` | ✗ | ✓ | ✓ |
| C — só servidor (app chama com service_role) | `find_lead_by_phone_digits`, `get_user_by_evolution_instance`, `match_document_chunks`, `purge_expired_raw_payloads`, `generate_user_webhook_url`, `get_user_by_webhook_url` | ✗ | ✗ | ✓ |
| D — legado (sem chamador após a Task 3) | `criar_lead_organico`, `atualizar_lead_por_whatsapp` | ✗ | ✗ | ✓ |

- [ ] **Step 1: Pré-condição** — Task 3 concluída (workflow do cliente legado desativado no n8n e webhooks da Evolution confirmados no endpoint nativo). O grupo D fica só com `service_role` agora; o `DROP FUNCTION` dessas duas entra na reconciliação de migrations do Sprint 2, depois de 2 semanas sem uso.
- [ ] **Step 2: Escrever o teste que falha** — `tests/db/function-privileges.sql`: uma query que retorna uma linha por violação da matriz acima (para cada função: `has_function_privilege('anon', oid, 'EXECUTE')` deve ser false em todos os grupos; `has_function_privilege('authenticated', …)` false nos grupos A, C, D e true no B; `has_function_privilege('service_role', …)` true em todos; e `proconfig` contendo `search_path=` para toda função `SECURITY DEFINER` do schema `public`).
- [ ] **Step 3: Rodar o teste e ver falhar**
  Run (MCP Supabase `execute_sql`, projeto `kzvnwqlcrtxwagxkghxq`): conteúdo de `tests/db/function-privileges.sql`
  Expected: ≥ 21 linhas de violação.
- [ ] **Step 4: Escrever o probe de ataque** — `scripts/attack-validation/rpc-anon-probe.sh`: lê `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` de `.env.local` (sem ecoar), faz `POST /rest/v1/rpc/<fn>` com body `{}` para cada função dos grupos A, C e D, e imprime só `<fn> <http_status>`. Rodar e salvar a saída "antes" no PR. Expected antes: status ≠ 401/403 (ex.: 200, 400, 404 por argumento) — a função é alcançável.
- [ ] **Step 5: Escrever a migration** — para cada função da matriz: `REVOKE EXECUTE ON FUNCTION public.<fn>(<args exatos>) FROM PUBLIC, anon;` + `REVOKE … FROM authenticated` nos grupos A, C, D + `GRANT EXECUTE … TO service_role` (e `TO authenticated` no grupo B) + `ALTER FUNCTION … SET search_path = public, pg_temp` nas que hoje têm `proconfig` nulo. Assinaturas exatas: obter com `pg_get_function_identity_arguments` (query já usada na auditoria). Rollback: `GRANT EXECUTE … TO PUBLIC, anon, authenticated` + `ALTER FUNCTION … RESET search_path` só nas que eram nulas.
- [ ] **Step 6: Aplicar em produção** — **parar e pedir autorização explícita ao usuário**, mostrando a migration e o rollback. Com autorização: MCP `apply_migration` (name `harden_security_definer_functions`).
- [ ] **Step 7: Rodar o teste e ver passar**
  Run: `tests/db/function-privileges.sql` via `execute_sql`
  Expected: 0 linhas.
- [ ] **Step 8: Regressão funcional (Review Focus 2 e 4)** — via `execute_sql`, simulando usuário autenticado real do org existente:
  `set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub','<user_id de organization_members>','role','authenticated')::text, true); select count(*) from leads_prospeccao;`
  Expected: mesmo número de leads que o service_role vê para aquela organização (sem erro `permission denied for function`). Repetir com um `insert` dentro de `begin; … rollback;` em `lead_notes` e confirmar que `organization_id` foi preenchido pelo trigger.
- [ ] **Step 9: Probe "depois"** — rodar `rpc-anon-probe.sh` de novo. Expected: todas as funções retornam 401 ou 403 (`42501 permission denied`). Anexar a saída ao PR.
- [ ] **Step 10: Advisor**
  Run: MCP `get_advisors` (security)
  Expected: zero achados `anon_security_definer_function_executable` e `function_search_path_mutable`; `authenticated_security_definer_function_executable` só para as 7 funções do grupo B (aceito e documentado no PR).
- [ ] **Step 11: Commit**
  `git commit -m "fix: revoga execucao anonima de funcoes SECURITY DEFINER e fixa search_path"`

### Task 6: Remover e-mail hardcoded como portão de autorização + rota temporária

**Files:**
- Create: `lib/supabase/pending-gate.ts`
- Test: `tests/unit/pending-gate.spec.ts`
- Modify: `lib/supabase/middleware.ts:97-115`
- Modify: `app/(protected)/pending/page.tsx:16-17`
- Modify: `app/api/admin/init-user-settings/route.ts:27` e seus usos
- Modify: `.env.example` (adicionar `PLATFORM_ADMIN_EMAIL=`)
- Delete: `app/api/admin/fix-admin/route.ts`

**Interfaces:**
- Produces: `shouldBlockPendingUser(settings: { pending_setup: boolean | null; role: string | null } | null): boolean` em `lib/supabase/pending-gate.ts`.

- [ ] **Step 1: Pré-checagem de dado (Review Focus 3)** — via `execute_sql`: `select us.role, us.pending_setup from user_settings us join auth.users u on u.id = us.user_id where u.email = '<e-mail do admin, o mesmo literal hoje em lib/supabase/middleware.ts:99>'`. Expected: `role = 'admin'` e `pending_setup = false`. Se não, **parar** e pedir ao usuário autorização para corrigir o registro antes de mudar o código.
- [ ] **Step 2: Escrever o teste que falha** — `tests/unit/pending-gate.spec.ts`:
  ```ts
  expect(shouldBlockPendingUser(null)).toBe(true);
  expect(shouldBlockPendingUser({ pending_setup: true, role: 'operador' })).toBe(true);
  expect(shouldBlockPendingUser({ pending_setup: null, role: 'visualizador' })).toBe(false);
  expect(shouldBlockPendingUser({ pending_setup: false, role: 'operador' })).toBe(false);
  expect(shouldBlockPendingUser({ pending_setup: true, role: 'admin' })).toBe(false);
  ```
- [ ] **Step 3:** Run `npx vitest run tests/unit/pending-gate.spec.ts` — Expected: FAIL (módulo não existe).
- [ ] **Step 4:** Implementar `shouldBlockPendingUser` (admin nunca bloqueia; sem settings bloqueia; senão bloqueia só se `pending_setup === true`).
- [ ] **Step 5:** Run o mesmo teste — Expected: PASS.
- [ ] **Step 6:** Em `lib/supabase/middleware.ts`: remover `ADMIN_EMAIL`, selecionar `pending_setup, role` e usar `shouldBlockPendingUser(settings)`. Em `pending/page.tsx`: remover `isAdminEmail`; `shouldRedirect = isAdmin || (!isLoading && !isPending)`. Em `init-user-settings/route.ts`: trocar a constante por `process.env.PLATFORM_ADMIN_EMAIL` (sem fallback; se ausente, tratar todo usuário como não-admin). Adicionar `PLATFORM_ADMIN_EMAIL=` ao `.env.example`. Deletar `app/api/admin/fix-admin/route.ts`.
- [ ] **Step 7: Verificar ausência do literal**
  Run: `grep -rn "@gmail.com" app src lib middleware.ts --include='*.ts' --include='*.tsx'`
  Expected: nenhuma saída.
- [ ] **Step 8:** Run `npx vitest run && npx tsc --noEmit && npm run build` — Expected: exit 0.
- [ ] **Step 9: Smoke manual (usuário)** — com `npm run dev`, pedir ao usuário para logar como admin (deve cair no dashboard, não em `/pending`) e como um usuário pendente (deve cair em `/pending`).
- [ ] **Step 10: Commit**
  `git commit -m "fix: substitui email hardcoded por role no gate de pending e remove rota fix-admin"`
  Lembrete ao usuário: adicionar `PLATFORM_ADMIN_EMAIL` nas variáveis da Vercel (e no Sprint 3, no Cloudflare).

### Task 7: Revisão dos usos de `service_role` (somente leitura → backlog de correções)

**Files:**
- Create: `docs/security/service-role-review-2026-10.md`

- [ ] **Step 1:** Despachar o agente `multi-tenant-reviewer` com a lista de arquivos de `grep -rl SERVICE_ROLE app src lib --include='*.ts'` e a pergunta: em cada uso, a query filtra explicitamente por `organization_id`/`user_id` derivado da sessão (não do body)? Classificar Critical/High/Medium.
- [ ] **Step 2:** Registrar o resultado em `docs/security/service-role-review-2026-10.md`. Para cada Critical/High: criar uma Task nova neste plano (Sprint 1) com teste de IDOR antes da correção. Medium vai para o Sprint 4.
- [ ] **Step 3: Commit** `git commit -m "docs: revisao de isolamento dos usos de service_role"`

### Checkpoint Sprint 1 — Ações do usuário e gate
- [ ] Usuário liga **Leaked password protection** em Supabase → Authentication → Providers → Email.
- [ ] Revisão de branch inteira: `security-reviewer`, `database-architect`, `multi-tenant-reviewer` em paralelo sobre `git diff main...claude/sprint1-seguranca`.
- [ ] Critério de saída: zero achados `anon_security_definer_function_executable`; nenhum literal de e-mail como autorização; nenhum Critical/High aberto da Task 7. (O CVE crítico do Next fica para o Sprint 2 por decisão de ordem.)
- [ ] PR → aprovação do usuário → merge.

---

# SPRINT 2 — Base técnica (marco; plano detalhado a escrever ao fechar o Sprint 1)

**Escopo:**
- Upgrade **Next 14 → 16** e React 18 → 19 (codemod oficial `@next/codemod upgrade`; APIs de request assíncronas `cookies()/headers()/params`; `middleware.ts` → convenção nova do Next 16; revisar `next.config.js`). Consultar Context7 (`/vercel/next.js`) antes de cada mudança.
- `@opennextjs/cloudflare` 1.15.1 → versão atual compatível com Next 16; revalidar `custom-worker.ts` e `wrangler.jsonc`.
- Remover código zumbi Vite (`index.html`, `vite.config.ts`, `src/App.tsx`, `src/main.tsx`, `src/vite-env.d.ts`, `tsconfig.app.json`, dependências `vite`/`react-router-dom` se sem uso) e unificar `lib/` × `src/lib/` (incluindo os dois `supabaseCRM.ts` divergentes).
- `npm audit` sem critical/high: zod 3 → 4, substituir `xlsx` (sem correção) por `exceljs`.
- **Reconciliar migrations:** `supabase db pull` → baseline do schema remoto no repo; marcar como aplicadas as locais que já existem no banco (`supabase migration repair`); validar com `supabase db diff` vazio.

**Critério de saída:** `npm audit --omit=dev` sem critical/high; `ci.yml` verde em `typecheck` e `cf-build`; `supabase db diff` vazio; smoke dos fluxos principais em `next dev` e `npm run cf:preview`.

# SPRINT 3 — Migração Vercel → Cloudflare (marco)

**Escopo** (fases pendentes do `CLOUDFLARE_MIGRATION_PLAN.md`):
- Fase 3: usuário roda `npx wrangler login`; executor roda `scripts/cloudflare-secrets-sync.sh --dry-run`, revisa com o usuário, depois envio real (incluindo `PLATFORM_ADMIN_EMAIL`).
- Fase 5: usuário conecta Workers Builds ao repo (build `npm run cf:build`, deploy `npx wrangler deploy`, worker `prospect-pulse-54`).
- Fase 6: staging (`wrangler versions upload` / preview do Workers Builds) — validar login, prospecção Google/LinkedIn, kanban, envio WhatsApp, 4 crons (`wrangler dev --test-scheduled`), `pdf-parse` no runtime Workers, middleware; `intellix:test-e2e` + `devsecops:security-gate`.
- **Agendamento nativo — substitui os 3 workflows do n8n** (decisão de arquitetura, ver ADR abaixo):
  - Pré-requisito de conta: **Workers Paid (US$ 5/mês)**. No plano Free o Worker tem 10 ms de CPU por request (o SSR do Next estoura), 10 ms por Cron Trigger e 50 subrequests — inviável para o app e para os jobs. No Paid: 30 s de CPU por cron de intervalo < 1 h, 15 min de wall time, 10.000 subrequests, 250 Cron Triggers.
  - **Cron Triggers** (já ligados em `wrangler.jsonc` + `custom-worker.ts`) como agendador único: `* * * * *` follow-up, `0 * * * *` rescue-human-mode, `0 12 * * 1-5` long-followup. **Remover o keepalive** (rota, job e trigger): o follow-up consulta o banco a cada minuto, o que já mantém o projeto Supabase ativo.
  - **Cloudflare Queue `follow-up-sends`** (binding `FOLLOW_UP_QUEUE`, disponível no Free e no Paid): o cron vira só *dispatcher* — chama `leadRepository.claimDueFollowUps(100)` (Task 4) e faz `sendBatch` de `{ leadId, followUpCount }`; um *consumer* no `custom-worker.ts` (`queue()` handler) envia pela instância da organização, com `max_batch_size` 10, `max_concurrency` 2 (controle de vazão no lugar do `setTimeout`), `max_retries` 3 com backoff e **dead-letter queue** `follow-up-sends-dlq`. Sucesso → `incrementFollowUpCount`; falha definitiva → `releaseFollowUpClaim` + log. O mesmo padrão serve para o long-followup.
  - Staging **sem** triggers contra o banco de produção (`env.staging.triggers.crons = []`), para não haver dois agendadores.
- Fase 7: cutover manual via `/intellix:deploy`; setar `NEXT_PUBLIC_APP_URL` para a URL `*.workers.dev`; atualizar URLs de webhook na Evolution API e na Meta; **no mesmo passo**, o usuário desativa os 3 workflows "LeadFinder Pro" do n8n (`NE6oZxj0il18ZDUk`, `cTN9Q6FjuuguALdF`, `024Gues9qK94oCgI`) e confirmamos nos Workers Logs que o cron do Cloudflare assumiu. Vercel **pausada** (não deletada) por 1–2 semanas.
- **Remover APIs específicas da Vercel:** `waitUntil` de `@vercel/functions` em `app/api/webhooks/evolution/route.ts:13,140,147` → `getCloudflareContext().ctx.waitUntil` do `@opennextjs/cloudflare` (sem isso o processamento da mensagem do WhatsApp é cortado no Worker); desinstalar `@vercel/functions`.
- Fase 8: remover `vercel.json`, `.vercelignore`, `DEPLOY_VERCEL.md` → `DEPLOY_CLOUDFLARE.md`; garantir zero referências a `.vercel.app`; registrar `docs/adr/0001-agendamento-cron-triggers-e-queues.md`.

**ADR — por que Cron Triggers + Queues (e não as alternativas):**
| Opção | Veredito |
|---|---|
| Cron Triggers + Queues (escolhida) | Nativo do host, sem serviço extra, retries + DLQ + controle de vazão, trava no Postgres evita duplicidade. |
| Só Cron Triggers (laço no handler) | Funciona em volume baixo, mas sem retry/DLQ e um lote grande compete com o limite de CPU do minuto. |
| Supabase `pg_cron` + `pg_net` chamando o app | Viável e grátis, mas põe segredo do cron no banco e acopla agendamento ao plano Free do Supabase (pausa por inatividade, sem backup). Fica como plano B. |
| Cloudflare Workflows (`step.sleep` por lead) | Melhor modelo para **cadências da jornada do lead** (enviar → esperar → checar resposta → próximo passo, cancelável quando o lead responde). Reservado para o plano de features; agora seria reescrever regra que já funciona. |
| Manter n8n | Descartado pela diretriz do produto. |

**Critério de saída:** produção servida pelo Worker; Cron Triggers disparando e fila sem backlog crescente (Workers Logs / `env.FOLLOW_UP_QUEUE.metrics()`); DLQ vazia após 48 h; webhooks recebendo; n8n sem nenhum workflow deste sistema ativo; rollback documentado.

# SPRINT 4 — Qualidade contínua (marco, incremental)

- TypeScript strict por pasta (começando por `src/lib/services` e `src/lib/repositories`), zerar 134 `any`; tornar `lint`/`test` bloqueantes no CI.
- Contrato de API IntelliX (`{ data, meta }` / `{ error: { code, message } }`) + Zod nos 36 handlers sem validação + rate limit (Upstash) em busca LinkedIn, IA e webhooks.
- Mover `.from()` de 32 route handlers e 18 componentes para repositories/services; quebrar god files (`settings/page.tsx`, `ProspectionForm.tsx`, `leads/page.tsx`).
- Observabilidade: error tracking + logging estruturado sem PII.
- LGPD: `guardrails.ts` + `pii-redactor.ts` nas 16 chamadas OpenAI; tabelas `consent_records`/`titular_requests`/`data_processing_log`; exportação/exclusão do titular para leads.
- E2E Playwright TS dos fluxos críticos (substitui a suíte Python em `e2e_tests/`).
- Mover extensão `vector` para schema `extensions`.
- **Configuração por organização das mensagens de follow-up** (hoje constantes em `follow-up.job.ts`): mover para `agent_configs`, mantendo as atuais como padrão.
