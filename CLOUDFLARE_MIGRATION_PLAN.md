# Plano de Execução — Migração Vercel → Cloudflare

**Status:** Fase 1 concluída e validada (build local passa). Fases 2-8 ainda não iniciadas.
**Criado em:** 2026-09-17
**Decisão de origem:** `~/.claude/WORKFLOW-SPINE-VS-ORBIT.md`, seção 3 (2026-09-07) — stack de deploy passa a ser Cloudflare (Workers), não mais Vercel.
**Gate de execução:** deploy real (`wrangler deploy` / cutover de DNS) é sempre manual, via `/intellix:deploy`, e exige Fase 07 concluída + `devsecops:security-gate == PASS`. Este documento cobre até o ponto de "pronto para o usuário rodar o deploy".

---

## 0. Diagnóstico (já concluído nesta sessão)

O projeto está 100% configurado para Vercel hoje. Nada foi migrado ainda:

- Sem `@opennextjs/cloudflare`, sem `wrangler.toml`/`wrangler.jsonc`, sem `open-next.config.ts`.
- `vercel.json` ativo com 2 cron jobs nativos da Vercel (`/api/cron/follow-up` a cada minuto, `/api/cron/long-followup` seg-sex 12h).
- **Achado incidental:** existem 4 rotas de cron no código (`follow-up`, `long-followup`, `rescue-human-mode`, `keepalive`), mas só 2 estão no `vercel.json` — `rescue-human-mode` e `keepalive` já não são acionadas por nada hoje, nem na Vercel.
- `next.config.js` tem `prospect-pulse-54.vercel.app` hardcoded em CORS/CSP e um comentário sobre "bundle do Vercel".
- Várias rotas usam `export const runtime = 'nodejs'` (crons, busca LinkedIn, etc.) — isso **descarta** `@cloudflare/next-on-pages` (só Edge Runtime). O caminho correto e oficial desde dez/2025 é **`@opennextjs/cloudflare`** (Node.js runtime, SSR, ISR, middleware). [Cloudflare blog](https://blog.cloudflare.com/deploying-nextjs-apps-to-cloudflare-workers-with-the-opennext-adapter/) · [OpenNext docs](https://opennext.js.org/cloudflare)
- `src/lib/services/pdf-analyzer.service.ts` e `app/api/agent/rag/route.ts` usam `pdf-parse`, que historicamente lê um arquivo de teste do disco (`fs`) ao ser importado — **risco de compatibilidade com o runtime de Workers**, precisa validação na Fase 6.
- `DEPLOY_VERCEL.md` está desatualizado (ainda descreve o setup antigo em Vite/`dist`, anterior à migração para Next.js).
- Não existe `.github/workflows/` — deploy hoje é via integração Git nativa da Vercel, sem pipeline próprio.
- 23 variáveis de ambiente identificadas em uso (lista completa na Fase 3).

**Ferramenta descartada para este caso:** `/Users/felipemaranhao/Downloads/deploy-cloudflare.skill` (inspecionada) publica HTML/JS estático direto como Worker via API REST, sem wrangler — o próprio arquivo da skill avisa que Cloudflare Pages e builds de framework **não funcionam** por esse caminho ("use wrangler local ou Git + Workers Builds"). Não se aplica a este app Next.js com SSR, cron e middleware. Pode ser útil no futuro só para uma página estática isolada (ex: landing de marketing separada), não para esta migração.

---

## Fase 1 — Adapter e configuração base ✅ concluída

**Objetivo:** o app builda para Cloudflare Workers localmente, sem ainda trocar nada em produção.

1. ~~Instalar dependências~~ — feito. **Achado crítico:** `@opennextjs/cloudflare` >=1.16 dropou suporte a Next 14 (peer dep exige Next >=15.5). A última versão compatível com Next 14 é **1.15.1** (peer `next: ^14.2.35`). Instalado `@opennextjs/cloudflare@1.15.1` + `wrangler@^4.133.0`.
2. ~~Pré-requisito descoberto durante a execução:~~ bump de `next` `^14.2.21` → `^14.2.35` (patch dentro da mesma major, exigido pelo peer dep acima — já estava resolvido em `node_modules` para `14.2.35`, sem quebra).
3. ~~Criar `open-next.config.ts`~~ — feito, config mínima (`defineCloudflareConfig({})`), sem cache incremental R2 ainda (fica para Fase 6/8).
4. ~~Criar `wrangler.jsonc`~~ — feito, `name: leadfinder-pro`, `compatibility_date: 2025-09-17`, `compatibility_flags: [nodejs_compat, global_fetch_strictly_public]`, bloco de cron comentado (Fase 2).
5. ~~Editar `next.config.js`~~ — feito: removido todo hardcode de `prospect-pulse-54.vercel.app` (CORS de página e de API agora usam só `NEXT_PUBLIC_APP_URL`, com fallback `localhost:3000` em dev e string vazia — falha fechada — em produção se a env var não estiver setada); comentário do `outputFileTracingIncludes` atualizado; adicionado `initOpenNextCloudflareForDev()` guardado por `NODE_ENV === 'development'`.
6. ~~Adicionar scripts~~ — feito: `cf:build`, `cf:preview`, `cf:deploy` no `package.json` (não executados além do `cf:build` local).
7. ~~Rodar `npm run cf:build`~~ — **passou**, gerou `.open-next/worker.js`. `next dev` também validado funcionando normalmente depois da mudança no `next.config.js`.

**Bug pré-existente destravado durante a Fase 1 (bloqueava build em qualquer plataforma, não só Cloudflare):** `supabase.auth.admin.listUsers()` tem um tipo de retorno em union discriminada (`{data: {users: User[]} & Pagination, error: null} | {data: {users: []}, error: AuthError}`) que o checker de build do Next.js (diferente de um `tsc --noEmit` isolado) não narrowa corretamente a partir do branch de sucesso — `data.users` colapsa para `never[]` mesmo depois de checar `error`. Corrigido com cast explícito (`as User[]`) após a checagem de erro em 4 arquivos: `app/api/admin/rag-ingest/route.ts`, `app/api/admin/register-templates/route.ts`, `app/api/admin/test-email/route.ts`, `app/api/admin/list-users/route.ts`. `app/api/admin/fix-admin/route.ts` já tinha annotation explícita no callback e não foi afetado.

**Critério de saída:** ✅ build OpenNext passa localmente sem erros (`npm run cf:build`), `tsc --noEmit` limpo, `next dev` funcional.

---

## Fase 2 — Cron jobs ✅ concluída

**Objetivo:** os jobs agendados continuam rodando depois do cutover.

1. ~~Decidir com o usuário~~ — decidido: religar os 4 (`follow-up`, `long-followup`, `rescue-human-mode`, `keepalive`).
2. ~~Adicionar bloco de triggers~~ — feito em `wrangler.jsonc` → `triggers.crons`, com os 4 schedules (mesma sintaxe POSIX que já estava nos comentários dos arquivos de rota / no `vercel.json` antigo).
3. ~~Implementar handler `scheduled`~~ — feito via **Custom Worker** (padrão oficial do OpenNext, [opennext.js.org/cloudflare/howtos/custom-worker](https://opennext.js.org/cloudflare/howtos/custom-worker)): criado `custom-worker.ts` na raiz, que importa o `handler.fetch` gerado em `.open-next/worker.js` e adiciona um `scheduled(event, env, ctx)`. Como Cron Triggers não fazem request HTTP real, o `scheduled()` mapeia `event.cron` → rota (`CRON_ROUTES`) e chama `handler.fetch()` **in-process** com uma `Request` sintética autenticada com `Authorization: Bearer ${env.CRON_SECRET}` — reaproveita 100% da lógica e da autenticação que as rotas já tinham, sem duplicar código. `wrangler.jsonc`'s `main` agora aponta pra `custom-worker.ts` em vez de direto pro worker gerado.
4. `vercel.json` mantido intacto por enquanto (só será removido na Fase 7, pós-cutover confirmado).

Gerado também `worker-configuration.d.ts` via `wrangler types` (ambient types de `Env`, incluindo todas as 23 env vars da Fase 3 — bônus: já dá tipagem correta pra elas).

**Critério de saída:** ✅ `wrangler deploy --dry-run` bundla `custom-worker.ts` + `.open-next/worker.js` sem erro (bindings `WORKER_SELF_REFERENCE` e `ASSETS` resolvidos corretamente). Não rodei `wrangler dev --test-scheduled` interativo (não é necessário validar além do dry-run nesta fase; fica como parte da Fase 6, validação em staging).

---

## Fase 3 — Variáveis de ambiente e secrets

**Objetivo:** nada quebra por variável faltando no ambiente novo.

Variáveis identificadas no código (`process.env.*`):

| Variável | Natureza | Ação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` | pública | `vars` no `wrangler.toml` |
| `SUPABASE_SERVICE_ROLE_KEY` | secreta | `wrangler secret put` |
| `APIFY_API_KEY`, `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`, `RESEND_API_KEY` | secreta | `wrangler secret put` |
| `EVOLUTION_API_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_DEFAULT_INSTANCE`, `EVOLUTION_INSTANCE_NAME` | secreta/config | `wrangler secret put` / `vars` conforme sensibilidade |
| `META_WA_TOKEN`, `META_WA_VERIFY_TOKEN`, `META_WA_PHONE_NUMBER_ID`, `META_WA_VERSION` | secreta | `wrangler secret put` |
| `WHATSAPP_PROVIDER`, `FROM_EMAIL`, `XPAG_CONSULTANT_INSTANCE`, `XPAG_CONSULTANT_WHATSAPP` | config | `vars` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | secreta | `wrangler secret put` |
| `CRON_SECRET` | secreta | `wrangler secret put` — usado pelos endpoints de cron para autenticar a chamada |
| `NODE_ENV` | automática | gerenciada pelo runtime, não precisa setar |

1. Levantar os valores atuais direto no dashboard da Vercel (**só o usuário tem acesso** — eu não devo pedir para colar segredos no chat).
2. `/wizard` (mattpocock-skills) é a skill recomendada pelo projeto para esse tipo de passo manual — gera um script interativo que guia a captura de cada secret e já grava via `wrangler secret put`. Sugerir ao chegar nesta fase.

**Critério de saída:** todas as 23 variáveis replicadas no Cloudflare (públicas em `vars`, sensíveis via `wrangler secret put`), nenhuma só na Vercel.

---

## Fase 4 — Domínio e DNS

1. Confirmar com o usuário: existe domínio próprio (ex: um domínio customizado) ou o app fica em `*.workers.dev` por enquanto?
2. Se houver domínio: adicionar/confirmar no Cloudflare (zona já deve existir, já que o `cluster Cloudflare` do projeto pressupõe conta ativa), configurar rota customizada do Worker (`routes` no `wrangler.toml` ou domínio custom via dashboard).
3. Definir estratégia de corte: DNS só muda na Fase 7, depois de validar em staging.

---

## Fase 5 — CI/CD

**Objetivo:** manter o mesmo conforto que a Vercel dava (deploy automático a cada push).

Opção recomendada (mais próxima do que a Vercel fazia, nativa, sem gerenciar secret de CI):
- **Cloudflare Workers Builds** — conecta o repositório GitHub direto no dashboard Cloudflare, builda e publica a cada push, sem precisar de `.github/workflows` nem guardar `CLOUDFLARE_API_TOKEN` como GitHub secret.

Alternativa (mais controle, mais manutenção):
- `.github/workflows/deploy.yml` rodando `wrangler deploy` com `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` como GitHub Secrets.

Decisão fica com o usuário na hora de executar esta fase.

---

## Fase 6 — Validação em preview/staging

1. `wrangler dev` local completo: login, prospecção (Google Maps e LinkedIn — feature nova desta sessão), tabela de leads, kanban, envio de WhatsApp, cron manual.
2. Validar especificamente:
   - `pdf-parse` (risco identificado no diagnóstico) — testar upload/análise de PDF sob o runtime de Workers.
   - Latência de cold start das rotas de API mais pesadas (busca LinkedIn via Apify, geração de mensagem IA).
   - Middleware de auth (`middleware.ts` → `updateSession`) funcionando igual.
3. Deploy para um ambiente de preview no Cloudflare (`wrangler deploy --env staging` ou Preview Deployments do Workers Builds) antes de qualquer DNS mudar.
4. Gate formal: Fase 07 do IntelliX (`intellix:test-e2e`) + `devsecops:security-gate == PASS` antes de autorizar o cutover.

---

## Fase 7 — Cutover

1. Deploy de produção via `/intellix:deploy` (manual, pelo usuário).
2. Apontar DNS do domínio de produção para o Worker.
3. Manter o projeto na Vercel pausado (não deletado) por um período de rollback (sugestão: 1–2 semanas).
4. Remover o bloco `crons` do `vercel.json` (ou apagar o arquivo inteiro) já com o cutover confirmado.
5. Substituir `DEPLOY_VERCEL.md` por `DEPLOY_CLOUDFLARE.md` com o passo a passo real do setup novo.

---

## Fase 8 — Limpeza pós-migração

1. Remover qualquer dependência/config específica de Vercel que sobrar sem uso.
2. Confirmar que nenhum CORS/CSP ou webhook ainda aponta pro domínio `.vercel.app`.
3. Atualizar `CLAUDE.md` do projeto se necessário (a tabela "Stack Padrão" já lista Cloudflare desde 2026-09-07 — só confirmar que reflete a URL final).

---

## Riscos abertos a validar durante a execução

- **`pdf-parse`** sob runtime de Workers (Fase 6).
- **Cron Triggers não são HTTP** — a lógica dos jobs precisa ser refatorada para ser chamável fora de uma request (Fase 2).
- **`CRON_SECRET`** hoje provavelmente valida um header enviado pela própria Vercel na chamada do cron — validar se o mesmo mecanismo faz sentido vindo de um `scheduled()` handler (não há request HTTP externo nesse caso).
