# Runbook — cutover Vercel → Cloudflare (Sprint 3)

Passo a passo executável da virada de produção da Vercel para o Cloudflare
Workers. Siga os passos **na ordem** (B1 a B9). Complementa
`CLOUDFLARE_MIGRATION_PLAN.md` (Fases 3, 6 e 7) e incorpora os passos 1, 2, 4,
6 e 7 de `docs/runbooks/corte-conectores.md`. Decisão de agendamento:
`docs/adr/0001-agendamento-cron-triggers-e-queues.md`.

Convenções:

- **Dono:** **U** = usuário, **E** = executor (agente). Passo com U exige a
  ação do usuário; passo só de E roda sem ele, exceto onde marcado **[auth]**.
- **[auth]** = autorização explícita do usuário **naquele momento**.
  Autorização anterior não vale (regra de produção do `CLAUDE.md`).
- Nenhum valor de segredo é colado no chat nem impresso em log. Backups vão
  para `scripts/legacy/backup-<AAAA-MM-DD>-<tema>.json` (git-ignored); alguns
  contêm segredo em texto puro: guarde fora do repositório depois do corte.
- Workers: produção `prospect-pulse-54`; staging `prospect-pulse-54-staging`
  (sem crons e sem filas, para não haver dois agendadores contra o banco de
  produção).

## Pré-requisitos

- Branches `claude/sprint3-cloudflare` e a do PR #20 revisadas e aprovadas
  (`npm run lint`, `npm test`, `npx tsc --noEmit`, `npm run build`,
  `npm run cf:build`).
- `npm audit` sem vulnerabilidades altas/críticas.
- Acesso ao SQL Editor do Supabase de produção, ao painel da Vercel, ao
  Cloudflare e ao n8n.

## Passos que não se aplicam

| Passo de `corte-conectores.md` | Situação |
|---|---|
| 3. Conferir a apikey da Evolution | **Não se aplica.** Sem instância Evolution ativa; configuração limpa em 2026-11-01. |
| 8. Trocar a URL do webhook nos provedores | **Não se aplica.** Sem instância ativa; ver 2026-11-01. O WhatsApp fica "não configurado" até existir uma instância nova, e a `webhookUrl` dela já nasce com o domínio `*.workers.dev`. |

---

## B1. Conta e subdomínio

- **Dono:** U (assinatura e login), E (`whoami` e edição).
- **Ação:**
  1. U assina o plano **Workers Paid** (Queues em produção).
  2. U autentica o wrangler no terminal: `! npx wrangler login`.
  3. E confirma a conta e descobre o subdomínio `*.workers.dev`:
     ```bash
     npx wrangler whoami
     ```
  4. E grava a URL final `https://prospect-pulse-54.<subdomínio>.workers.dev`
     em `vars.NEXT_PUBLIC_APP_URL` do `wrangler.jsonc` (e a de staging,
     `https://prospect-pulse-54-staging.<subdomínio>.workers.dev`, em
     `env.staging.vars`). É variável de build: o valor tem de estar no arquivo
     antes do `cf:build`.
- **Verificação:** `whoami` lista a conta correta e o plano Paid;
  `git diff wrangler.jsonc` mostra só as URLs.
- **Rollback:** reverter o commit das URLs. Cancelar o plano Paid, se for o
  caso, é decisão do usuário no painel.

## B2. Filas — [auth]

- **Dono:** E.
- **Ação:**
  ```bash
  npx wrangler queues create follow-up-sends
  npx wrangler queues create follow-up-sends-dlq
  ```
  Binding `FOLLOW_UP_QUEUE`; consumer com `max_batch_size` 10,
  `max_concurrency` 2, `max_retries` 3, atraso de retry de 30 s e
  `dead_letter_queue` `follow-up-sends-dlq` (já em `wrangler.jsonc`).
- **Verificação:** `npx wrangler queues list` mostra as duas filas.
- **Rollback:** `npx wrangler queues delete follow-up-sends` e
  `npx wrangler queues delete follow-up-sends-dlq` (só antes do B6; depois,
  esvaziar a fila antes de apagar).

## B3. Banco e chave mestra — [auth]

- **Dono:** E (banco), U (chave). Incorpora o passo 1 de `corte-conectores.md`
  e a parte de variáveis do passo 2.
- **Ação:**
  1. E: backup do estado atual (lista de tabelas e funções de `public`) em
     `scripts/legacy/backup-<data>-pre-conectores.json`.
  2. E: aplicar `supabase/migrations/20261031100000_organization_connections.sql`
     em produção (a migration só cria objetos).
  3. E: rodar, cada um em transação com `rollback` no fim:
     - `tests/db/organization-connections.sql`
     - `tests/db/function-privileges.sql` (confere `set_connection_webhook_key`
       no grupo A: sem EXECUTE para `anon`/`authenticated`).
  4. U: gerar a chave mestra e guardá-la no cofre de senhas. Perder a chave =
     perder todos os segredos cifrados.
     ```bash
     openssl rand -base64 32
     ```
  5. U: gravar em `.env.local` (sem commitar):
     `CONNECTORS_MASTER_KEY_V1=<chave gerada>` e
     `CONNECTORS_ACTIVE_KEY_VERSION=v1`.
  6. E: conferir o que será enviado. A saída só traz nomes e
     presente/ausente; se faltar variável, o script lista e termina com
     código 1 sem enviar nada.
     ```bash
     ./scripts/cloudflare-secrets-sync.sh --dry-run
     ./scripts/cloudflare-secrets-sync.sh --dry-run --env staging
     ```
  7. E + U: revisar a saída juntos e, com a autorização do usuário, enviar
     para produção e para staging:
     ```bash
     ./scripts/cloudflare-secrets-sync.sh
     ./scripts/cloudflare-secrets-sync.sh --env staging
     ```
     Secrets enviados: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
     `CONNECTORS_MASTER_KEY_V1`, `CONNECTORS_ACTIVE_KEY_VERSION`,
     `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Credenciais de
     provedor **não** entram: ficam em `platform_credentials` e
     `organization_connections` (B7).
- **Verificação:** os dois scripts SQL terminam sem `EXCEPTION`;
  `npx wrangler secret list` e `npx wrangler secret list --env staging`
  mostram as 6 chaves (só os nomes).
- **Rollback:** a migration tem
  `supabase/migrations/rollback/20261031100000_organization_connections.down.sql`
  (apaga conexões, credenciais e consumo; exportar as três tabelas antes).
  Secrets: `npx wrangler secret delete <NOME> [--env staging]`. A chave
  mestra só pode ser removida antes de existir segredo cifrado gravado, ou
  seja, antes do `--apply` do B7.

## B4. Staging — [auth]

- **Dono:** E.
- **Ação:**
  ```bash
  npm run cf:build && npx wrangler deploy --env staging
  ```
  Smoke em staging (`*.workers.dev` de staging, sem crons): login, dashboard,
  leads, kanban, inbox, Configurações, Integrações, prospecção Google e
  LinkedIn, upload de PDF (`pdf-parse` sob o runtime de Workers). Conferir os
  Workers Logs de staging sem erro.

  Agendador e fila, localmente:
  ```bash
  npx wrangler dev --test-scheduled
  curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
  ```
- **Verificação:** o smoke passa sem erro nos Workers Logs; o curl local
  resulta em despacho para a fila (log `Claimed`/`dispatched`).
- **Rollback:** `npx wrangler delete --env staging` (não afeta produção).

## B5. Gates

- **Dono:** E.
- **Ação:** rodar `intellix:test-e2e` (smoke dos fluxos do B4) e
  `devsecops:security-gate`.
- **Verificação:** **os dois precisam dar PASS.** Qualquer FAIL bloqueia o B6.
- **Rollback:** não se aplica (só leitura).

## B6. Virada — [auth]

- **Dono:** U + E. **Horário:** fora das 12:00 UTC em dia útil (cron
  `long-followup`, `0 12 * * 1-5`).
- **Ação, nesta ordem:**
  1. **U:** pausar o projeto `prospect-pulse-54` na Vercel (não deletar).
     Assim o merge na `main` não publica lá código sem as variáveis novas.
  2. **U:** conectar o Workers Builds ao repositório (build `npm run cf:build`,
     deploy `npx wrangler deploy`, branch `main`).
  3. **E:** mergear o PR #20 e depois o PR do Sprint 3 na `main`, e acompanhar
     o build até o deploy.
  4. **U:** desativar os 3 workflows "LeadFinder Pro" do n8n
     (`NE6oZxj0il18ZDUk`, `cTN9Q6FjuuguALdF`, `024Gues9qK94oCgI`), para não
     haver dois agendadores.
  5. **E:** confirmar nos Workers Logs que o `scheduled` do `* * * * *` roda
     sem erro por 2 minutos seguidos.
- **Verificação:** build verde no Workers Builds; passo 5 sem erro; fila
  `follow-up-sends` consumindo; `follow-up-sends-dlq` vazia.
- **Rollback:** despausar a Vercel, reativar os 3 workflows do n8n e reverter
  o merge na `main` (`git revert`). Desativar os crons do Worker se preciso
  (remover o bloco `triggers.crons` e redeploy) para não duplicar com o n8n.

## B7. Conectores — [auth]

- **Dono:** E/U. Incorpora os passos 4, 6 e 7 de `corte-conectores.md`.
- **Ação:**
  1. E: migração assistida, primeiro em simulação.
     ```bash
     NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
     CONNECTORS_MASTER_KEY_V1=... CONNECTORS_ACTIVE_KEY_VERSION=v1 \
     npx tsx scripts/migrate-connections.ts --dry-run
     ```
     Usar a **mesma** chave mestra do B3. Revisar a saída com o usuário:
     `[criar]` (conexões novas; `own` = chave própria cifrada, `platform` =
     credencial da plataforma), `[manual]` (campos faltando) e usuários sem
     organização (ignorados).
  2. E: backup de `organization_connections` em
     `scripts/legacy/backup-<data>-organization-connections-pre-apply.json`.
  3. E: `--apply` (mesmo comando trocando a flag) e novo `--dry-run`: tudo
     deve aparecer como `[existe]` (idempotente).
  4. U: na tela de admin (Integrações → Credenciais da plataforma), cadastrar
     **OpenAI** (`apiKey`), **Resend** (`apiKey`, `fromEmail`, `fromName`),
     **Google Places** (`apiKey`), **Apify** (`apiToken`) e **Firecrawl**
     (`apiKey`).
  5. U: para cada organização, **Testar** cada conexão e só então **Ativar**
     (`last_test_ok`); completar as marcadas como `[manual]`. Conexões
     `platform` (inclusive `prospecting/google_places`) só passam no teste
     com as credenciais do item 4. Domínio do Resend não verificado = teste
     reprovado.
  6. O WhatsApp fica "não configurado" até existir uma instância nova.
     Organização sem conexão `active` numa categoria responde "não
     configurado" (sem fallback).
- **Verificação:** segundo `--dry-run` só com `[existe]`; conexões `active` na
  tela de admin; `tests/db/organization-connections.sql` ok em produção;
  nenhum segredo legível por `authenticated`.
- **Rollback:** apagar as linhas criadas pelo script (as que não existiam no
  backup do item 2), por `id`, depois de exportá-las. Credenciais da
  plataforma: remover na tela de admin.

## B8. Smoke de produção

- **Dono:** E.
- **Ação:** repetir o smoke do B4 na URL `https://prospect-pulse-54.<subdomínio>.workers.dev`
  e conferir o cron protegido:
  ```bash
  curl -i https://prospect-pulse-54.<subdomínio>.workers.dev/api/cron/follow-up
  ```
- **Verificação:** smoke sem erro; `GET /api/cron/follow-up` **sem bearer
  responde 401**.
- **Rollback:** o do B6.

## B9. Observar 24 h

- **Dono:** E.
- **Ação:** acompanhar Workers Logs, a fila `follow-up-sends` e a DLQ
  `follow-up-sends-dlq`; checar `usage_events` por organização e o Inbox das
  organizações com tráfego real.
- **Verificação:** sem 5xx novos nos Workers Logs; `follow-up-sends-dlq`
  vazia; backlog da fila sem crescer. Sem `ConnectionNotConfiguredError`
  inesperado.
- **Rollback (válido em qualquer ponto até aqui):** despausar a Vercel,
  reativar os 3 workflows do n8n e reverter o merge na `main`.

---

## Parte C — Limpeza pós-corte

Só depois do B9 sem incidentes (DLQ vazia por 48 h): limpeza de colunas e
rotas legadas (passo 11 de `corte-conectores.md`), remoção de `vercel.json`,
`.vercelignore` e `DEPLOY_VERCEL.md` (substituído por `DEPLOY_CLOUDFLARE.md`),
zero referências a `.vercel.app`, e remoção das variáveis antigas do painel da
Vercel e do Worker (passo 12 de `corte-conectores.md`). Cada uma exige
autorização e backup, conforme o `CLAUDE.md`.
