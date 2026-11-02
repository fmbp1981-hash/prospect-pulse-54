# Runbook — cutover Vercel → Cloudflare (Sprint 3)

Passo a passo executável da virada de produção da Vercel para o Cloudflare
Workers. Siga os passos **na ordem** (B1 a B9): B1-B3 preparam conta, filas e
banco; B4-B5 sobem e configuram o **staging** (que usa o mesmo banco de
produção); B6 é o gate; B7 é a virada; B8-B9 verificam e observam. Complementa
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
- **Segredos só depois do primeiro deploy de cada Worker.** `wrangler secret put`
  num Worker que ainda não existe é interativo ou cria um stub. Por isso os
  secrets de staging vão no B4 (logo após o primeiro deploy de staging) e os de
  produção no B7 (logo após o primeiro deploy do Workers Builds).
- **Nunca dois agendadores ao mesmo tempo** (Cron Triggers, workflows do n8n,
  Vercel Cron).

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

- **Dono:** U (assinatura e login), E (`whoami` e conferência).
- **Ação:**
  1. U assina o plano **Workers Paid** (Queues em produção).
  2. U autentica o wrangler no terminal: `! npx wrangler login`.
  3. E confirma a conta e o subdomínio `*.workers.dev`:
     ```bash
     npx wrangler whoami
     ```
  4. As URLs já estão no `wrangler.jsonc` (`vars.NEXT_PUBLIC_APP_URL` e
     `env.staging.vars.NEXT_PUBLIC_APP_URL`). Conferir com o `whoami` e
     **ajustar se o subdomínio for outro**. É variável de build: o valor tem
     de estar no arquivo antes do `cf:build`.
- **Verificação:** `whoami` lista a conta correta e o plano Paid;
  `git diff wrangler.jsonc` vazio, ou só com as URLs corrigidas.
- **Rollback:** reverter o commit das URLs. Cancelar o plano Paid é decisão do
  usuário no painel.

## B2. Filas — [auth]

- **Dono:** E.
- **Ação:**
  ```bash
  npx wrangler queues create follow-up-sends
  npx wrangler queues create follow-up-sends-dlq
  ```
  Binding `FOLLOW_UP_QUEUE`; consumer com `max_batch_size` 10,
  `max_concurrency` 2, `max_retries` 3 e `dead_letter_queue`
  `follow-up-sends-dlq` (em `wrangler.jsonc`). O atraso de retry de 30 s fica
  no código (`RETRY_DELAY_SECONDS` em `src/worker/follow-up-consumer.ts`), não
  no `wrangler.jsonc`.
- **Verificação:** `npx wrangler queues list` mostra as duas filas.
- **Rollback:** `npx wrangler queues delete follow-up-sends` e
  `npx wrangler queues delete follow-up-sends-dlq` (só antes do B7; depois,
  esvaziar a fila antes de apagar).

## B3. Banco e chave mestra — [auth]

- **Dono:** E (banco), U (chave). Incorpora o passo 1 de `corte-conectores.md`
  e a geração da chave do passo 2. **Nenhum secret é enviado aqui**: nenhum
  Worker existe ainda.
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
- **Verificação:** os dois scripts SQL terminam sem `EXCEPTION`;
  `.env.local` tem as duas variáveis.
- **Rollback:** `supabase/migrations/rollback/20261031100000_organization_connections.down.sql`
  (apaga conexões, credenciais e consumo; exportar as três tabelas antes). A
  chave mestra só pode ser descartada antes de existir segredo cifrado
  gravado, ou seja, antes do `--apply` do B5.

## B4. Staging: deploy, secrets e smoke de leitura — [auth]

- **Dono:** E. Staging **compartilha o banco de produção** e não tem crons nem
  filas (`env.staging`), então não envia follow-up.
- **Ação:**
  1. Deploy (cria o Worker `prospect-pulse-54-staging`):
     ```bash
     npm run cf:build && npx wrangler deploy --env staging
     ```
  2. **Imediatamente depois**, os secrets de staging (simulação primeiro; a
     saída só traz nomes e presente/ausente, e termina com código 1 sem
     enviar nada se faltar variável):
     ```bash
     ./scripts/cloudflare-secrets-sync.sh --dry-run --env staging
     ./scripts/cloudflare-secrets-sync.sh --env staging
     ```
     Secrets: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
     `CONNECTORS_MASTER_KEY_V1`, `CONNECTORS_ACTIVE_KEY_VERSION`,
     `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Credenciais de
     provedor **não** entram: ficam em `platform_credentials` e
     `organization_connections` (B5).
  3. Smoke de **leitura** em staging: login, dashboard, leads, kanban, inbox,
     Configurações, Integrações. Conferir os Workers Logs de staging sem erro.
- **Não rodar** `wrangler dev --test-scheduled` com credenciais de produção:
  poderia reservar (claim) follow-ups reais. O despacho do agendador e da fila
  é verificado em produção, no B7, pelos Workers Logs.
- **Verificação:** `npx wrangler secret list --env staging` mostra as 6 chaves
  (só nomes); smoke sem erro nos Workers Logs.
- **Rollback:** `npx wrangler delete --env staging` (não afeta produção);
  secrets: `npx wrangler secret delete <NOME> --env staging`.

## B5. Conectores, pela tela de staging — [auth]

- **Dono:** E/U. Incorpora os passos 4, 6 e 7 de `corte-conectores.md`.
  Roda **antes** do gate e da virada, para que a janela do B7 já encontre as
  conexões ativas. É seguro agora: as tabelas novas não são lidas pelo código
  antigo da Vercel (`corte-conectores.md`, passo 4: "enquanto o código antigo
  está no ar, as conexões criadas não são lidas por ninguém").
- **Ação:**
  1. E: migração assistida, primeiro em simulação (sem segredo digitado no
     comando; carrega o `.env.local` no ambiente do processo):
     ```bash
     set -a; source .env.local; set +a
     npx tsx scripts/migrate-connections.ts --dry-run
     ```
     Usa a **mesma** chave mestra do B3. Revisar a saída com o usuário:
     `[criar]` (conexões novas; `own` = chave própria cifrada, `platform` =
     credencial da plataforma), `[manual]` (campos faltando) e usuários sem
     organização (ignorados).
  2. E: backup de `organization_connections` em
     `scripts/legacy/backup-<data>-organization-connections-pre-apply.json`.
  3. E: `--apply` (mesmo comando trocando a flag) e novo `--dry-run`: tudo
     deve aparecer como `[existe]` (idempotente).
  4. U: na tela de admin **de staging** (Integrações → Credenciais da
     plataforma), cadastrar **OpenAI** (`apiKey`), **Resend** (`apiKey`,
     `fromEmail`, `fromName`), **Google Places** (`apiKey`), **Apify**
     (`apiToken`) e **Firecrawl** (`apiKey`).
  5. U: para cada organização, **Testar** cada conexão e só então **Ativar**
     (`last_test_ok`); completar as marcadas como `[manual]`. Conexões
     `platform` (inclusive `prospecting/google_places`) só passam no teste
     com as credenciais do item 4.
  6. **Domínio do Resend por organização** (passo 9 de `corte-conectores.md`):
     o teste da conexão de e-mail confere se o domínio está verificado no
     Resend. Domínio não verificado = teste reprovado e conexão não ativável;
     o cliente conclui a verificação DNS no Resend e o teste é repetido.
  7. O WhatsApp fica "não configurado" até existir uma instância nova.
     Organização sem conexão `active` numa categoria responde "não
     configurado" (sem fallback).
  8. Smokes que **escrevem dados de produção ou gastam crédito pago**
     (**[auth]** a cada execução): prospecção Google, prospecção LinkedIn e
     upload de PDF (`pdf-parse` sob o runtime de Workers). Rodar sempre numa
     **organização de teste**, com **uma busca mínima** de cada tipo.
- **Verificação:** segundo `--dry-run` só com `[existe]`; conexões `active` na
  tela de admin; `tests/db/organization-connections.sql` ok em produção;
  nenhum segredo legível por `authenticated`; smokes do item 8 sem erro nos
  Workers Logs de staging.
- **Rollback:** apagar as linhas criadas pelo script (as que não existiam no
  backup do item 2), por `id`, depois de exportá-las. Credenciais da
  plataforma: remover na tela de admin. Dados de teste do item 8: apagar da
  organização de teste.

## B6. Gates

- **Dono:** E.
- **Ação:** rodar `intellix:test-e2e` (smoke dos fluxos do B4 e B5) e
  `devsecops:security-gate`.
- **Verificação:** **os dois precisam dar PASS.** Qualquer FAIL bloqueia o B7.
- **Rollback:** não se aplica (só leitura).

## B7. Virada — [auth]

- **Dono:** U + E. **Horário:** fora das 12:00 UTC em dia útil (cron
  `long-followup`, `0 12 * * 1-5`).
- **Aviso sobre a janela:** entre o deploy do código novo e a conclusão deste
  passo, o código novo está no ar e os crons disparam. Com as conexões já
  ativas desde o B5, a janela é curta. **Não são esperadas mensagens na DLQ**
  `follow-up-sends-dlq`. Até o item 4 os crons recebem 401 (o `CRON_SECRET` de
  produção ainda não existe): é no-op e é esperado. Se aparecerem mensagens
  na DLQ: **inspecionar primeiro** (Workers Logs, causa do erro, qual lead e
  organização) e só limpar a fila com `wrangler queues` (purge) com
  **[auth]** do usuário; nunca purgar sem entender a causa.
- **Ação, nesta ordem:**
  1. **U:** pausar o projeto `prospect-pulse-54` na Vercel (não deletar).
     Assim o merge na `main` não publica lá código sem as variáveis novas.
  2. **U:** conectar o Workers Builds ao repositório (build `npm run cf:build`,
     deploy `npx wrangler deploy`, branch `main`).
  3. **E:** levar o código à `main`. Duas opções:
     - **Recomendada:** mergear antes o PR do Sprint 3 na branch do #20 e
       depois mergear o #20 na `main`. A `main` recebe **um** merge e há
       **um** deploy.
     - Alternativa: mergear o #20 e depois o PR do Sprint 3. São **dois**
       deploys do Workers Builds; o intermediário (só o #20) é esperado,
       **aguardar o segundo terminar** antes de seguir.
     Acompanhar o build até o deploy.
  4. **E, imediatamente depois do primeiro deploy do Workers Builds
     terminar:** secrets de produção (simulação primeiro, **[auth]**):
     ```bash
     ./scripts/cloudflare-secrets-sync.sh --dry-run
     ./scripts/cloudflare-secrets-sync.sh
     ```
     A partir daqui os crons deixam de receber 401.
  5. **U:** desativar os 3 workflows "LeadFinder Pro" do n8n
     (`NE6oZxj0il18ZDUk`, `cTN9Q6FjuuguALdF`, `024Gues9qK94oCgI`), para não
     haver dois agendadores.
  6. **E:** verificar o despacho pelos Workers Logs de produção, por 2
     minutos seguidos: o `scheduled` do cron `* * * * *` roda sem erro, o log
     de despacho (`Claimed`/`dispatched`) aparece e o consumer da fila
     registra o processamento.
- **Verificação:** build verde; `npx wrangler secret list` mostra as 6
  chaves; item 6 sem erro; `follow-up-sends-dlq` vazia.
- **Rollback (ordenado e obrigatório; nunca dois agendadores ao mesmo
  tempo):**
  1. remover `triggers.crons` do `wrangler.jsonc` e redeployar o Worker (ou
     desabilitar os triggers pelo painel do Cloudflare);
  2. reativar os 3 workflows do n8n;
  3. despausar a Vercel e reverter o merge na `main` (`git revert`).

## B8. Smoke de produção e verificação dos conectores

- **Dono:** E.
- **Ação:** na URL `https://prospect-pulse-54.<subdomínio>.workers.dev`,
  repetir o smoke de **leitura** do B4 (login, dashboard, leads, kanban,
  inbox, Configurações, Integrações) e conferir o cron protegido:
  ```bash
  curl -i https://prospect-pulse-54.<subdomínio>.workers.dev/api/cron/follow-up
  ```
  Verificar que as conexões do B5 aparecem `active` na tela de Integrações de
  produção. Smokes que escrevem dados ou gastam crédito só com **[auth]**, em
  organização de teste, uma busca mínima (como no B5).
- **Verificação:** smoke sem erro; `GET /api/cron/follow-up` **sem bearer
  responde 401**; Integrações em produção mostra as conexões ativas.
- **Rollback:** o do B7.

## B9. Observar 24 h

- **Dono:** E.
- **Ação:** acompanhar Workers Logs, a fila `follow-up-sends` e a DLQ
  `follow-up-sends-dlq`; checar `usage_events` por organização e o Inbox das
  organizações com tráfego real.
- **Verificação:** sem 5xx novos nos Workers Logs; `follow-up-sends-dlq`
  vazia; backlog da fila sem crescer; sem `ConnectionNotConfiguredError`
  inesperado.
- **Rollback (válido em qualquer ponto até aqui):** o ordenado do B7
  (crons fora, n8n reativado, Vercel despausada, merge revertido).

### Mudanças de comportamento a comunicar aos clientes

(De `corte-conectores.md`, passo 10; avisar antes do B7.)

- Etapas de follow-up longo com `requiresTemplate` são **puladas**
  (`template_required`) até existir HSM por organização: `no_response_initial`
  e `lost_reactivation` não enviam nada.
- Agendamentos legados de cenários que não são mais detectados são pulados.
- A prospecção não verifica mais se o número tem WhatsApp.
- A numeração `Lead-NNN` continua global (não por organização).
- O WhatsApp fica "não configurado" até existir uma instância nova.

---

## Parte C — Limpeza pós-corte

Só depois do B9 sem incidentes (DLQ vazia por 48 h): limpeza de colunas e
rotas legadas (passo 11 de `corte-conectores.md`), remoção de `vercel.json`,
`.vercelignore` e `DEPLOY_VERCEL.md` (substituído por `DEPLOY_CLOUDFLARE.md`),
zero referências a `.vercel.app`, e remoção das variáveis antigas do painel da
Vercel e do Worker (passo 12 de `corte-conectores.md`). Cada uma exige
autorização e backup, conforme o `CLAUDE.md`.
