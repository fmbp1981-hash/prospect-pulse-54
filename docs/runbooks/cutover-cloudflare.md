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
  contêm segredo em texto puro: guarde fora do repositório depois do corte
  (destino final e prazo na Parte C).
- Workers: produção `prospect-pulse-54`; staging `prospect-pulse-54-staging`
  (sem crons, sem filas e `FOLLOW_UP_MODE=disabled`, para não haver dois
  agendadores contra o banco de produção).
- **Segredos só depois de o Worker existir.** `wrangler secret put` num Worker
  que ainda não existe é interativo ou cria um stub. O Worker de **staging**
  ainda não existe: os secrets dele vão no B4, logo após o primeiro deploy. O
  de **produção já existe** (ver "Estado encontrado em 2026-11-01"): os
  secrets dele vão no B7, **antes** do merge, porque o código antigo no ar não
  lê as chaves novas.
- **Build só de ambiente limpo.** As `NEXT_PUBLIC_*` são inlinadas no
  `next build` a partir do ambiente **do build**; as `vars` do
  `wrangler.jsonc` são só de runtime. Um `npm run cf:build` com `.env` ou
  `.env.local` presentes grava esses arquivos inteiros (inclusive segredos) em
  `.open-next/cloudflare/next-env.mjs`: **nunca fazer deploy de um build feito
  com `.env.local` presente.** Staging: procedimento do B4. Produção: Build
  variables do Workers Builds (B7).
- **Dados pessoais (LGPD).** O executor (E) só faz smoke logado na
  **organização de teste**. Telas com leads ou conversas reais (dashboard,
  leads, kanban, inbox de organizações de clientes) são conferidas só pelo
  usuário (U). Observação (B9) usa métricas agregadas. Mensagens da DLQ são
  inspecionadas só pelos ids (`leadId`, `organization_id`) dos logs, sem abrir
  o lead.
- **Nunca dois agendadores ao mesmo tempo** (Cron Triggers, workflows do n8n,
  Vercel Cron).

## Estado encontrado em 2026-11-01

- O Worker de produção `prospect-pulse-54` **já existe** (primeiro deploy em
  2026-09-19) e o **Workers Builds já está conectado** ao repositório: todo
  merge na `main` publica a `main` no Worker. Os merges do #18 e do #19
  publicaram às ~14:24 UTC.
- Esse Worker tinha os 4 crons do `wrangler.jsonc` da `main` e já tem
  `CRON_SECRET` e `SUPABASE_SERVICE_ROLE_KEY`, ou seja, agendava contra o banco
  de produção **junto com o n8n**. Nenhum lead estava elegível (sem envio,
  conferido no banco). Os crons foram **removidos pela API em 2026-11-01**,
  com autorização do usuário; backup em
  `scripts/legacy/backup-2026-11-01-worker-schedules.json`.
- Secrets já presentes no Worker de produção (só nomes): `APIFY_API_KEY`,
  `CRON_SECRET`, `EVOLUTION_API_KEY`, `EXT_PUBLIC_SUPABASE_ANON_KEY` (nome
  errado, sem uso), `FIRECRAWL_API_KEY`, `META_WA_TOKEN`,
  `META_WA_VERIFY_TOKEN`, `OPENAI_API_KEY`, `RESEND_API_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_TOKEN`,
  `UPSTASH_REDIS_REST_URL`. Os de provedor e o de nome errado são apagados no
  B7, item 8.
- Os logs (observability) estavam desligados. O `wrangler.jsonc` desta branch
  liga `observability.enabled`, valendo a partir do deploy da virada.
- **Regra até a virada: nenhum merge na `main`.** Cada merge redeploya a `main`
  com os crons do `wrangler.jsonc` dela, e o `CRON_SECRET` existente faz esses
  crons autenticarem, com o n8n ainda ativo. Se um merge for inevitável,
  remover os crons de novo logo após o deploy (**[auth]**):
  ```bash
  T=$(npx wrangler auth token | tail -1)
  curl -s -X PUT -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
    --data '[]' \
    "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/scripts/prospect-pulse-54/schedules"
  ```

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

- **Status:** concluído em 2026-11-01 (Workers Paid já assinado, wrangler
  logado, subdomínio `fmbp1981.workers.dev` confirmado: o Worker de produção
  responde nessa URL).
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
     **ajustar se o subdomínio for outro**. Atenção: essas `vars` valem só em
     **runtime**. No bundle, as `NEXT_PUBLIC_*` vêm do ambiente do build: no
     staging, do `export` do B4; em produção, das **Build variables** do
     Workers Builds (B7, item 2), que precisam da mesma URL de produção.
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
  6. U: gerar o segredo da rota interna da fila (consumidor →
     `POST /api/internal/follow-up/process`), guardar no cofre e gravar em
     `.env.local` como `INTERNAL_QUEUE_SECRET=<valor gerado>`. É diferente do
     `CRON_SECRET` e vai só para produção (nunca para staging).
     ```bash
     openssl rand -base64 32
     ```
- **Verificação:** os dois scripts SQL terminam sem `EXCEPTION`;
  `.env.local` tem as três variáveis (a conferência é pelo `--dry-run` do
  script de secrets, que só mostra presente/ausente).
- **Rollback:** `supabase/migrations/rollback/20261031100000_organization_connections.down.sql`
  (apaga conexões, credenciais e consumo; exportar as três tabelas antes). A
  chave mestra só pode ser descartada antes de existir segredo cifrado
  gravado, ou seja, antes do `--apply` do B5.

## B4. Staging: deploy limpo, secrets, proteção e smoke de leitura — [auth]

- **Dono:** E (build, deploy, secrets, smoke na organização de teste), U
  (Cloudflare Access e telas com dados reais). Staging **compartilha o banco de
  produção** e não tem crons nem filas (`env.staging`), e o cron de follow-up
  roda com `FOLLOW_UP_MODE=disabled`: não envia follow-up.
- **Ação:**
  1. Build de **ambiente limpo** e deploy (cria o Worker
     `prospect-pulse-54-staging`). Os arquivos `.env` e `.env.local` saem do
     repositório durante o build e voltam no fim; só as 3 variáveis públicas de
     **staging** entram no ambiente (lidas do próprio `wrangler.jsonc`, nada é
     digitado):
     ```bash
     mkdir -p ~/.env-aside && mv .env .env.local ~/.env-aside/
     eval "$(node -e '
       const t=require("fs").readFileSync("wrangler.jsonc","utf8")
         .replace(/^\s*\/\/.*$/gm,"").replace(/\s\/\/[^\n"]*$/gm,"");
       const v=JSON.parse(t).env.staging.vars;
       for (const k of ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","NEXT_PUBLIC_APP_URL"])
         console.log("export "+k+"="+JSON.stringify(v[k]));')"
     npm run cf:build
     # nenhum segredo no bundle: só nomes, cada ambiente [] ou só NEXT_PUBLIC_*
     node -e 'import("./.open-next/cloudflare/next-env.mjs").then(m=>{for(const k of Object.keys(m)) console.log(k, Object.keys(m[k]))})'
     # variáveis públicas certas no bundle
     grep -rl kzvnwqlcrtxwagxkghxq .open-next/assets/_next/static | wc -l        # > 0
     grep -rl placeholder.supabase.co .open-next/assets/_next/static | wc -l    # = 0
     grep -o 'Access-Control-Allow-Origin","value":"[^"]*"' \
       .open-next/server-functions/default/.next/routes-manifest.json | sort -u   # só a URL de staging
     npx wrangler deploy --env staging
     mv ~/.env-aside/.env ~/.env-aside/.env.local . && rmdir ~/.env-aside
     ```
     Se qualquer conferência falhar (segredo listado no `next-env.mjs`,
     `localhost` ou valor vazio no CORS, `placeholder.supabase.co` no bundle),
     **não fazer o deploy**: devolver os arquivos, corrigir e refazer o build.
     **Nunca** fazer deploy de um build feito com `.env.local` presente.
  2. **Imediatamente depois**, os secrets de staging (simulação primeiro; a
     saída só traz nomes e presente/ausente, e termina com código 1 sem
     enviar nada se faltar variável):
     ```bash
     ./scripts/cloudflare-secrets-sync.sh --dry-run --env staging
     ./scripts/cloudflare-secrets-sync.sh --env staging
     ```
     Secrets de staging: `SUPABASE_SERVICE_ROLE_KEY`,
     `CONNECTORS_MASTER_KEY_V1`, `CONNECTORS_ACTIVE_KEY_VERSION`,
     `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. O script **nunca**
     envia `CRON_SECRET` nem `INTERNAL_QUEUE_SECRET` para staging: as rotas de
     cron e a rota interna da fila respondem 401 lá. Credenciais de provedor
     **não** entram: ficam em `platform_credentials` e
     `organization_connections` (B5).
  3. **U: proteger o staging.** Ele expõe o banco de produção. Colocar o
     `prospect-pulse-54-staging.<subdomínio>.workers.dev` atrás do
     **Cloudflare Access** (painel: Zero Trust → Access → Applications, só os
     e-mails do time) **ou** desativar a rota `workers.dev` do Worker de staging
     (painel: Workers → `prospect-pulse-54-staging` → Settings → Domains &
     Routes) fora das janelas de teste.
  4. Smoke de **leitura** em staging:
     - **E**, logado num usuário da **organização de teste**: login, dashboard,
       leads, kanban, inbox, Configurações, Integrações.
     - **U**: as mesmas telas com organizações de clientes (dados reais), se
       quiser conferir.
     Conferir os Workers Logs de staging sem erro.
- **Não rodar** `wrangler dev --test-scheduled` com credenciais de produção:
  poderia reservar (claim) follow-ups reais. O despacho do agendador e da fila
  é verificado em produção, no B7, pelos Workers Logs.
- **Verificação:** `npx wrangler secret list --env staging` mostra as 5 chaves
  (só nomes; sem `CRON_SECRET` e sem `INTERNAL_QUEUE_SECRET`);
  `curl -i https://prospect-pulse-54-staging.<subdomínio>.workers.dev/api/cron/follow-up`
  com qualquer bearer responde 401 (ou é barrado pelo Access); smoke sem erro
  nos Workers Logs; staging protegido (item 3).
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
  4. U (feito em 2026-11-03): na tela de admin **de staging**
     (Configurações → Administração da plataforma → Credenciais da
     plataforma), cadastrar **OpenAI** (`apiKey`), **Resend** (`apiKey`,
     `fromEmail`, `fromName`), **Google Places** (`apiKey`), **Apify**
     (`apiToken`) e **Firecrawl** (`apiKey`).
  5. U: para cada organização, **Testar conexão** em cada conexão: o teste
     aprovado já ativa a conexão (`last_test_ok` → `active`; o botão Ativar só
     reativa uma conexão desativada). Completar as marcadas como `[manual]`.
     Feito em 2026-11-03: 13/13 conexões `active` nas 3 organizações. Conexões
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
     **Feito em 2026-11-03 (Google e LinkedIn)**, na IntelliX.AI, logado como
     o admin dela: Google `quantity: 1` → 200, 1 lead; LinkedIn `maxItems: 1`,
     `findEmail: false` → 200, 1 contato; Workers Logs sem erro. Linhas
     exportadas para `scripts/legacy/backup-2026-11-03-smoke-b5.json` e
     apagadas por `id`; os `usage_events` ficaram (consumo pago real).
     **PDF:** o upload da base de conhecimento
     (`app/api/agent/rag/route.ts`) não chama o `pdf-parse` (grava base64);
     ele só roda no PDF recebido pelo WhatsApp
     (`src/lib/handlers/message-type.handler.ts`), desligado até o A3. Por
     isso foi validado **localmente no workerd** (2026-11-03), sem banco nem
     chaves: Worker mínimo com o mesmo `compatibility_date` e flags, chamando
     `pdfParse(buffer)` como o `pdf-analyzer.service.ts` → texto extraído em
     56 ms; PDF truncado → `InvalidPDFException` (o serviço já trata). Atenção:
     o `pdf.js` 1.10 usa `node-ensure`; o bundle do OpenNext pega o
     `index.js` (`setImmediate`) e funciona, mas a variante `browser.js`
     entra em recursão infinita no workerd. Se um build futuro trocar a
     resolução, o PDF do WhatsApp quebra: conferir com
     `grep -o 'node_modules/node-ensure/[a-z.]*' .open-next/server-functions/default/handler.mjs`
     (esperado: `index.js`).
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
- **Feito em 2026-11-03:** E2E em `tests/reports/test-report-2026-11-03.md` (sem
  regressão; 1 negativo Low pré-existente); security gate em
  `docs/security/security-gate-2026-11-03-b6.md`: PASS com aceitação formal de risco
  (DEP-01, ENV-01, ENV-02, F-01, LGPD-01, LGPD-02) e prazos registrados. Condição que
  pesa no pós-virada: opt-out completo antes de ligar WhatsApp ou enviar campanha/e-mail
  em massa.
- **Rollback:** não se aplica (só leitura).

## B7. Virada — [auth]

- **Dono:** U + E. **Horário:** fora das 12:00 UTC em dia útil (cron
  `long-followup`, `0 12 * * 1-5`).
- **Aviso sobre a janela:** o Worker de produção já tem `CRON_SECRET`, então
  os crons autenticam assim que o deploy da virada os recria. Por isso o n8n
  sai **antes** do merge (item 2) e os secrets novos entram **antes** do merge
  (item 3): o deploy liga tudo de uma vez e o Worker já nasce como único
  agendador. Com as conexões já ativas desde o B5, **não são esperadas
  mensagens na DLQ** `follow-up-sends-dlq`. Se aparecerem mensagens
  na DLQ: **inspecionar primeiro**, só pelos ids (`leadId`,
  `organization_id`) e pelo código de erro dos Workers Logs, sem abrir o lead;
  registrar a causa e só então limpar a fila com `wrangler queues` (purge),
  com **[auth]** do usuário, em até 7 dias (ADR 0001, "DLQ"). Nunca purgar sem
  entender a causa.
- **Ação, nesta ordem:**
  1. **U:** pausar o projeto `prospect-pulse-54` na Vercel (não deletar).
     Assim o merge na `main` não publica lá código sem as variáveis novas.
  2. **U:** desativar os 3 workflows "LeadFinder Pro" do n8n
     (`NE6oZxj0il18ZDUk`, `cTN9Q6FjuuguALdF`, `024Gues9qK94oCgI`). Com os crons
     do Worker removidos (2026-11-01) e a Vercel pausada, a partir daqui há
     **zero agendadores ativos** até o deploy do item 5: é a lacuna segura,
     intencional.
  3. **E:** secrets de produção no Worker que já existe, **antes do merge**
     (simulação primeiro, **[auth]**). O código antigo no ar não lê as chaves
     novas, então isso não muda o comportamento atual:
     ```bash
     ./scripts/cloudflare-secrets-sync.sh --dry-run
     ./scripts/cloudflare-secrets-sync.sh
     ```
     São 7: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
     `INTERNAL_QUEUE_SECRET`, `CONNECTORS_MASTER_KEY_V1`,
     `CONNECTORS_ACTIVE_KEY_VERSION`, `UPSTASH_REDIS_REST_URL`,
     `UPSTASH_REDIS_REST_TOKEN` (os dois primeiros e os do Upstash são
     sobrescritos com os valores do `.env.local`).
  4. **U:** conferir o Workers Builds, que **já está conectado** (Settings →
     Build): build `npm run cf:build`, deploy `npx wrangler deploy`, branch
     `main`. Cadastrar ou conferir em **Build variables** (Settings → Build →
     Variables): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
     `NEXT_PUBLIC_APP_URL` = `https://prospect-pulse-54.<subdomínio>.workers.dev`
     (os mesmos valores de `vars` no `wrangler.jsonc`). O Workers Builds não
     tem `.env`: sem essas variáveis o bundle sai com Supabase de placeholder e
     CORS vazio. Nenhum segredo vai em Build variables.
  5. **E:** levar o código à `main`. Duas opções:
     - **Recomendada:** mergear antes o PR do Sprint 3 (#21) na branch do #20
       e depois mergear o #20 na `main`. A `main` recebe **um** merge e há
       **um** deploy.
     - Alternativa: mergear o #20 e depois o #21. São **dois** deploys do
       Workers Builds; o intermediário (só o #20) recria os crons com o
       código do #20 (sem fila): **aguardar o segundo (último) terminar**
       antes de seguir.
     O deploy recria os 3 crons do `wrangler.jsonc` e liga os logs; com os
     secrets do item 3 o Worker passa a ser o **único agendador**.
     Acompanhar o build até o deploy. **Conferência pós-build** (no último
     deploy), sem login:
     ```bash
     BASE=https://prospect-pulse-54.<subdomínio>.workers.dev
     curl -sI "$BASE/login" | grep -i '^access-control-allow-origin'   # = $BASE (nunca localhost nem vazio)
     curl -s "$BASE/login" | grep -o '/_next/static/chunks/[^"]*\.js' | sort -u \
       | while read -r c; do curl -s "$BASE$c"; done > /tmp/pp54-chunks.js
     grep -c kzvnwqlcrtxwagxkghxq /tmp/pp54-chunks.js       # > 0
     grep -c placeholder.supabase.co /tmp/pp54-chunks.js    # = 0
     rm /tmp/pp54-chunks.js
     ```
     Falhou: conferir as Build variables do item 4, rodar o build de novo e
     repetir a conferência antes do item 6.
  6. **E:** verificar pelos Workers Logs de produção: o `scheduled` do cron
     `* * * * *` roda **sem erro duas vezes seguidas**. Vale como evidência
     tanto um log de despacho (`Claimed`/`dispatched`) quanto a linha de
     debug/info de "nenhum lead elegível"; se houve despacho, o consumer da
     fila registra o processamento. A resposta do cron traz
     `data.mode = "queue"`; um `503 QUEUE_NOT_CONFIGURED` indica fila ou
     binding ausente (ver B2) e não envia nada. Um
     `follow-up/process falhou: 403` no log do consumer é **sinal de parada**:
     o host `internal` não chegou à rota; executar o rollback.
  7. **U/E:** comunicar a nova URL (o `*.workers.dev` do B1). Há
     **indisponibilidade** desde a pausa da Vercel (item 1) até o fim do
     deploy do item 5.
  8. **E:** apagar os secrets antigos de provedor e o de nome errado
     (**[auth]**), depois do item 6 ok:
     ```bash
     for s in APIFY_API_KEY EVOLUTION_API_KEY EXT_PUBLIC_SUPABASE_ANON_KEY \
              FIRECRAWL_API_KEY META_WA_TOKEN META_WA_VERIFY_TOKEN \
              OPENAI_API_KEY RESEND_API_KEY; do
       npx wrangler secret delete "$s" --name prospect-pulse-54
     done
     ```
     As credenciais de provedor vivem em `platform_credentials` e
     `organization_connections` desde o B5.
- **Verificação:** build verde; conferência pós-build do item 5 ok;
  `npx wrangler secret list` mostra só as 7 chaves (depois do item 8); itens 2
  a 6 concluídos sem erro; `follow-up-sends-dlq` vazia.
- **Rollback (ordenado e obrigatório; nunca dois agendadores ao mesmo
  tempo):**
  1. remover os crons do Worker pela API (comando em "Estado encontrado em
     2026-11-01"; efeito imediato) ou pelo painel do Cloudflare. **Confirmar**
     que a lista de schedules voltou vazia e que os Workers Logs não mostram
     novas execuções `scheduled` antes do passo 2;
  2. reativar os 3 workflows do n8n;
  3. despausar a Vercel e reverter o merge na `main` (`git revert`).

## B8. Smoke de produção e verificação dos conectores

- **Dono:** E.
- **Dono:** E (organização de teste), U (telas com dados reais).
- **Ação:** na URL `https://prospect-pulse-54.<subdomínio>.workers.dev`,
  repetir o smoke de **leitura** do B4 (E só na organização de teste; U nas
  organizações de clientes, se quiser) e conferir as rotas protegidas:
  ```bash
  curl -i https://prospect-pulse-54.<subdomínio>.workers.dev/api/cron/follow-up
  curl -i -X POST https://prospect-pulse-54.<subdomínio>.workers.dev/api/internal/follow-up/process
  ```
  Verificar (U, ou E na organização de teste) que as conexões do B5 aparecem
  `active` na tela de Integrações de produção. Smokes que escrevem dados ou
  gastam crédito só com **[auth]**, em organização de teste, uma busca mínima
  (como no B5).
- **Verificação:** smoke sem erro; `GET /api/cron/follow-up` **sem bearer
  responde 401**; `POST /api/internal/follow-up/process` de fora responde 401
  (sem o segredo) ou 403 (host externo); Integrações em produção mostra as
  conexões ativas.
- **Rollback:** o do B7.

## B9. Observar 24 h

- **Dono:** E.
- **Ação:** acompanhar só **métricas agregadas**: contagem de 5xx nos Workers
  Logs, profundidade da fila `follow-up-sends` e da DLQ
  `follow-up-sends-dlq`, contagem de `usage_events` por organização e por
  tipo, contagem de leads por `status_msg_wa`, e as contagens dos códigos
  `whatsapp_send_failed` e `whatsapp_send_ambiguous`. Sem abrir leads nem
  conversas; o Inbox de organizações reais é conferido só por U, se quiser.
  Mensagem na DLQ: inspecionar pelos ids dos logs (convenção LGPD) e seguir o
  ADR 0001, "DLQ".
- **Verificação:** sem 5xx novos nos Workers Logs; `follow-up-sends-dlq`
  vazia; backlog da fila sem crescer; sem `ConnectionNotConfiguredError`
  inesperado; `whatsapp_send_ambiguous` raro (cada ocorrência é um follow-up
  possivelmente perdido, nunca duplicado).
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
zero referências a `.vercel.app`, remoção do modo `direct` do follow-up
(`runFollowUpJob` e o ramo `direct` de `FOLLOW_UP_MODE`), e remoção das
variáveis antigas do painel da Vercel e do Worker (passo 12 de
`corte-conectores.md`). Cada uma exige autorização e backup, conforme o
`CLAUDE.md`.

Também na Parte C:

- **Apagar o staging** e os secrets dele (**[auth]**): ele expõe o banco de
  produção e não tem mais uso depois do corte.
  ```bash
  npx wrangler delete --env staging
  ```
  Remover também a aplicação do Cloudflare Access criada no B4, se houver.
- **Backups** (`scripts/legacy/backup-*.json`, alguns com segredo em texto
  puro): mover para o cofre de senhas ou cifrar (ex.: `age`/`gpg`) fora do
  repositório; **apagar as cópias locais** depois de 30 dias sem incidente.
