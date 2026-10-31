# Conectores por organização (Sprint 2b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada organização usa as próprias conexões (WhatsApp, e-mail, LLM, prospecção), configuradas só pelo admin da plataforma, sem nenhum provedor/instância/credencial padrão vindo de ambiente.

**Architecture:** tabelas `organization_connections`, `platform_credentials` e `usage_events`; segredos cifrados com AES-256-GCM (Web Crypto) na aplicação; um resolvedor único `resolveConnection(orgId, category, provider?)` devolve config + segredo efetivo (próprio ou da plataforma) ou lança `ConnectionNotConfiguredError`. Adaptadores por provedor recebem credenciais no construtor (nunca `process.env`) e registram consumo. Chamadores passam a resolver a organização pelo registro (lead/campanha/conversa/conexão).

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS), Zod, Vitest, Web Crypto.

**Spec:** `docs/superpowers/specs/2026-10-31-conectores-por-organizacao-design.md` (aprovado em 2026-10-31). Plano-mãe: `docs/superpowers/plans/2026-10-30-ajuste-sistema-e-migracao-cloudflare.md`.

**Branch:** `claude/sprint2b-conectores`, criada a partir de `claude/sprint1-seguranca` (HEAD `4426804`).

## Global Constraints

- Organização nasce sem conexão; sem conexão `active` → `ConnectionNotConfiguredError`, **nunca** fallback para env, para outra conexão ou para outra organização.
- Nenhum provedor, instância, número ou domínio padrão em código, env ou banco. Código novo não lê `process.env` para credencial de provedor; únicas envs novas: `CONNECTORS_MASTER_KEY_V1` (32 bytes em base64) e `CONNECTORS_ACTIVE_KEY_VERSION` (`v1`).
- Escrita de conexões e credenciais da plataforma: só admin da plataforma (`isPlatformAdmin(userId)` de `src/lib/auth/platform-admin.ts` no servidor **e** `public.is_platform_admin()` na RLS). Cliente só lê status.
- Segredo nunca sai do servidor: nenhuma resposta, log ou coluna legível por `authenticated` contém segredo ou `webhook_key`; logs mascarados.
- `organization_id` (UUID) é a chave de tenant em tudo que é novo; `tenant_id` não é usado.
- Código novo sem `node:crypto`/`Buffer`, sem `any`; Zod em toda entrada; respostas `{ data, meta }` / `{ error: { code, message } }`; camadas route → service → repository.
- Migrations com rollback em `supabase/migrations/rollback/` e teste SQL em `tests/db/`; **aplicar em produção só com autorização explícita do usuário naquele momento + backup em `scripts/legacy/backup-<data>-<tema>.json`** (o executor PARA e pede).
- Registro de consumo nunca bloqueia a operação (falha → log e segue).
- Mensagens de commit semânticas terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Suíte: `npx vitest run tests/unit` (1 falha pré-existente em `normalizer.spec.ts` é aceita); `npx tsc --noEmit` sem erros novos; `npm run lint`.

## Review Focus

1. Organização sem conexão (ou com status `failing`/`disabled`/`pending_test`) dispara envio, follow-up, campanha ou agente → erro claro/skip registrado, nenhum envio por outra rota (Task 3, Task 5).
2. PUT de conexão sem o campo de segredo → mantém o segredo atual; segredo vazio → 400 (Task 10).
3. Webhook com `webhook_key` válido mas assinatura Meta inválida ou token Evolution errado → 401 e nada processado (Task 6).
4. Segredo cifrado com `v1` continua decifrável depois de `CONNECTORS_ACTIVE_KEY_VERSION=v2` (Task 1).
5. Conexão de e-mail com domínio não verificado no Resend → teste falha, status `failing`, envio bloqueado (Task 7, Task 10).

---

### Task 1: Cofre de segredos (AES-256-GCM)

**Files:**
- Create: `src/lib/connectors/crypto/secret-box.ts`
- Test: `tests/unit/connectors-secret-box.spec.ts`
- Modify: `.env.example` (adicionar `CONNECTORS_MASTER_KEY_V1=` e `CONNECTORS_ACTIVE_KEY_VERSION=v1` com comentário de como gerar: `openssl rand -base64 32`)
- Create: `scripts/rotate-connector-key.ts` (recifra `organization_connections.secret` e `platform_credentials.secret` para a versão ativa; `--dry-run` padrão)

**Interfaces:**
- Produces:
  - `interface EncryptedSecret { v: string; iv: string; ct: string }` (base64)
  - `encryptSecret(plaintext: string): Promise<EncryptedSecret>` — usa a versão ativa
  - `decryptSecret(enc: EncryptedSecret): Promise<string>` — usa `CONNECTORS_MASTER_KEY_<enc.v em maiúsculas>`
  - `class MasterKeyMissingError extends Error`
  - `encryptJson<T>(value: T)`, `decryptJson<T>(enc: EncryptedSecret): Promise<T>`

- [ ] **Step 1: Testes** — `roundtrip devolve o texto original`; `duas cifras do mesmo texto têm iv e ct diferentes`; `ct adulterado lança erro`; `sem CONNECTORS_MASTER_KEY_V1 lança MasterKeyMissingError`; `segredo v1 decifra com ativa=v2 desde que V1 exista` (Review Focus 4); `chave com tamanho != 32 bytes lança erro`.
- [ ] **Step 2:** `npx vitest run tests/unit/connectors-secret-box.spec.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar com `crypto.subtle` (AES-GCM, iv de 12 bytes de `crypto.getRandomValues`), base64 via `btoa`/`atob`, cache da `CryptoKey` por versão.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat: cofre de segredos AES-GCM para conectores`.

### Task 2: Schema (migration + tipos + teste SQL)

**Files:**
- Create: `supabase/migrations/20261031100000_organization_connections.sql`, `supabase/migrations/rollback/20261031100000_organization_connections.down.sql`, `tests/db/organization-connections.sql`
- Modify: `src/integrations/supabase/types.ts` (adicionar as 3 tabelas à mão, no mesmo formato das existentes)

**Interfaces:**
- Produces (tabelas):
  - `organization_connections`: `id uuid pk default gen_random_uuid()`, `organization_id uuid not null references organizations(id) on delete cascade`, `category text check in ('whatsapp','email','llm','prospecting')`, `provider text check in ('meta_cloud','evolution','resend','openai','google_places','apify','firecrawl')`, check de coerência categoria↔provedor (whatsapp: meta_cloud|evolution; email: resend; llm: openai; prospecting: google_places|apify|firecrawl), `credential_source text check in ('platform','own')`, check `category <> 'whatsapp' or credential_source = 'own'`, `config jsonb not null default '{}'`, `secret jsonb null`, `status text not null default 'pending_test' check in ('pending_test','active','failing','disabled')`, `last_tested_at timestamptz`, `last_test_result text`, `webhook_key text unique` (64 hex, gerado por default só para whatsapp via trigger), `configured_by uuid references auth.users`, `created_at`, `updated_at` (trigger `set_updated_at` existente).
  - unique `(organization_id, category, provider)`; unique parcial `(organization_id, category) where category in ('whatsapp','email','llm')`.
  - `platform_credentials`: `id`, `provider text unique` (mesma lista), `secret jsonb not null`, `config jsonb default '{}'`, `updated_by uuid`, timestamps.
  - `usage_events`: `id`, `organization_id uuid not null`, `category`, `provider`, `operation text not null`, `quantity numeric not null check (quantity >= 0)`, `unit text not null`, `connection_id uuid null`, `created_at`; índice `(organization_id, created_at)`.
- RLS/privilégios:
  - `organization_connections`: RLS on; SELECT para `is_org_member(organization_id) or is_platform_admin()`; INSERT/UPDATE/DELETE só `is_platform_admin()`; `revoke select (secret, webhook_key) on organization_connections from anon, authenticated` (grant de SELECT por coluna nas demais).
  - `platform_credentials`: RLS on, nenhuma policy para `anon`/`authenticated` (só service_role); revoke all de anon/authenticated.
  - `usage_events`: SELECT `is_org_member(organization_id) or is_platform_admin()`; sem INSERT/UPDATE/DELETE para authenticated.
  - Comentário SQL com a consulta documentada de consumo por organização/mês (spec 4.6).

- [ ] **Step 1:** Escrever `tests/db/organization-connections.sql` no formato dos arquivos vizinhos (`ok=true` por linha), cobrindo: membro lê a conexão da própria org e não a de outra; membro não lê `secret`/`webhook_key` (erro 42501); membro (inclusive admin de org) não insere/atualiza; admin da plataforma insere; segunda conexão whatsapp na mesma org viola unique; `whatsapp` com `credential_source='platform'` viola check; `platform_credentials` ilegível por authenticated; `usage_events` de outra org invisível.
- [ ] **Step 2:** Escrever migration (idempotente, padrão de `20261030160000_restrict_row_owner_writes.sql`) e rollback.
- [ ] **Step 3:** Atualizar `types.ts`; `npx tsc --noEmit` sem erros novos.
- [ ] **Step 4:** **PARAR**: aplicar em produção e rodar o teste SQL só depois de autorização explícita do usuário, com backup. Sem autorização, seguir para as próximas tasks (o código usa mocks nos testes) e listar a aplicação como pendente no ledger.
- [ ] **Step 5:** Commit `feat: tabelas de conexões por organização, credenciais da plataforma e consumo`.

### Task 3: Resolvedor de conexões + repositório + consumo

**Files:**
- Create: `src/lib/connectors/types.ts`, `src/lib/connectors/schemas.ts`, `src/lib/repositories/connections.repository.ts`, `src/lib/connectors/resolve-connection.ts`, `src/lib/connectors/org-context.ts`, `src/lib/connectors/usage.ts`
- Test: `tests/unit/connectors-resolve.spec.ts`, `tests/unit/connectors-usage.spec.ts` (usar `tests/unit/helpers/fake-supabase.ts`)

**Interfaces:**
- Consumes: Task 1 (`decryptJson`), Task 2 (tabelas).
- Produces:
  - `type ConnectorCategory = 'whatsapp' | 'email' | 'llm' | 'prospecting'`
  - `type ProviderId = 'meta_cloud' | 'evolution' | 'resend' | 'openai' | 'google_places' | 'apify' | 'firecrawl'`
  - `type ConnectionStatus = 'pending_test' | 'active' | 'failing' | 'disabled'`
  - Zod por provedor em `schemas.ts` — `providerConfigSchemas[provider]` e `providerSecretSchemas[provider]`:
    - `meta_cloud`: config `{ phoneNumberId: string; wabaId?: string; apiVersion: string (default 'v20.0') }`, secret `{ accessToken; appSecret; verifyToken }`
    - `evolution`: config `{ baseUrl: string (url, passa por assertSafeOutboundUrl); instanceName: string }`, secret `{ apiKey }`
    - `resend`: config `{ domain: string; fromEmail: string (email no domain); fromName: string }`, secret `{ apiKey }`
    - `openai`: config `{ model?: string }`, secret `{ apiKey }`
    - `google_places`, `firecrawl`: config `{}`, secret `{ apiKey }`; `apify`: config `{}`, secret `{ apiToken }`
  - `interface ResolvedConnection<P extends ProviderId = ProviderId> { id: string; organizationId: string; category: ConnectorCategory; provider: P; credentialSource: 'platform' | 'own'; config: ProviderConfig<P>; secret: ProviderSecret<P> }`
  - `class ConnectionNotConfiguredError extends Error { organizationId; category; provider? }`
  - `resolveConnection<P extends ProviderId>(organizationId: string, category: ConnectorCategory, provider?: P): Promise<ResolvedConnection<P>>` — só `status='active'`; `own` decifra `secret` da linha; `platform` decifra `platform_credentials.secret` do provedor (ausente → `ConnectionNotConfiguredError`); valida com Zod.
  - `resolveConnectionByWebhookKey(webhookKey: string): Promise<ResolvedConnection<'meta_cloud' | 'evolution'> | null>` (qualquer status exceto `disabled`, para permitir o teste inicial do webhook).
  - `resolveOrganizationIdForUser(userId: string): Promise<string | null>` (via `organization_members`).
  - `connectionsRepository`: `findActive(orgId, category, provider?)`, `findByWebhookKey(key)`, `listForOrganization(orgId)` (sem `secret`/`webhook_key`), `upsert(input)`, `setStatus(id, status, result)`, `getPlatformCredential(provider)`, `upsertPlatformCredential(provider, secret, config, userId)`.
  - `recordUsage(e: { organizationId: string; category: ConnectorCategory; provider: ProviderId; operation: string; quantity: number; unit: 'tokens' | 'requests' | 'messages' | 'emails' | 'pages'; connectionId?: string }): Promise<void>` — nunca lança.

- [ ] **Step 1: Testes** — `sem linha → ConnectionNotConfiguredError`; `status failing/disabled/pending_test → ConnectionNotConfiguredError` (Review Focus 1); `own decifra o segredo da conexão`; `platform usa platform_credentials do provedor`; `platform sem credencial da plataforma → erro`; `consulta sempre filtra organization_id` (fake registra o filtro); `config inválida para o provedor → erro de validação, não devolve conexão`; `recordUsage com insert falhando não lança e loga`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar (service client via o helper de service client já usado no repo; sem `any`).
- [ ] **Step 4:** Rodar → PASS; `tsc` limpo.
- [ ] **Step 5:** Commit `feat: resolvedor de conexões por organização e registro de consumo`.

### Task 4: Adaptadores de WhatsApp sem env + factory por organização

**Files:**
- Modify: `src/lib/integrations/whatsapp/providers/evolution.provider.ts`, `src/lib/integrations/whatsapp/providers/meta-cloud.provider.ts`, `src/lib/integrations/whatsapp/whatsapp-provider.interface.ts` (trocar `Buffer` em `MediaDownloadResult` por `Uint8Array`, ajustando quem consome)
- Replace: `src/lib/integrations/whatsapp/whatsapp.factory.ts` (remove `WHATSAPP_PROVIDER`, singleton e `setWhatsAppProvider` global)
- Delete: `src/lib/integrations/whatsapp/evolution-credentials.ts`, `tests/unit/whatsapp-factory.spec.ts` (substituído)
- Test: `tests/unit/whatsapp-org-factory.spec.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces:
  - `new EvolutionProvider({ baseUrl, apiKey })`, `new MetaCloudProvider({ accessToken, phoneNumberId, apiVersion, appSecret, verifyToken })`
  - `interface OrgWhatsApp { provider: IWhatsAppProvider; target: string; connectionId: string; organizationId: string }` — `target` = `instanceName` (Evolution) ou `phoneNumberId` (Meta)
  - `getWhatsAppForOrganization(organizationId: string): Promise<OrgWhatsApp>` (propaga `ConnectionNotConfiguredError`)
  - Os adaptadores chamam `recordUsage(... category 'whatsapp', operation 'send_text' | 'send_media', unit 'messages')` em envio bem-sucedido.
  - Para testes: `setWhatsAppProviderFactoryForTests(fn | null)`.

- [ ] **Step 1: Testes** — `org com meta ativa → MetaCloudProvider com target = phoneNumberId`; `org com evolution ativa → EvolutionProvider com target = instanceName`; `org sem conexão → ConnectionNotConfiguredError`; `nenhum provider lê process.env` (spy em `process.env` via getter que lança para `EVOLUTION_*`/`META_WA_*`); `envio bem-sucedido registra consumo`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS.
- [ ] **Step 5:** Commit `refactor: provedores de WhatsApp recebem credenciais da conexão da organização`.

### Task 5: Saída de WhatsApp pelas conexões (rotas, jobs, ferramentas, mídia)

**Files:**
- Modify: `app/api/inbox/send-message/route.ts`, `app/api/inbox/takeover/route.ts`, `app/api/whatsapp/send/route.ts`, `src/lib/jobs/follow-up.job.ts`, `src/lib/jobs/long-followup.job.ts`, `src/lib/ai/tools/transfer-consultant.tool.ts`, `src/lib/workflows/lead-conversation.workflow.ts` (só a parte de envio), `src/lib/handlers/message-type.handler.ts`
- Delete: `src/lib/integrations/evolution/messaging.client.ts`, `src/lib/integrations/evolution/media.client.ts` (substituídos pelo provider); `resolveInstanceForUser` em `src/lib/services/tenant-resolver.service.ts`
- Test: atualizar `tests/unit/follow-up-job.spec.ts`, `long-followup-job.spec.ts`, `inbox-instance.spec.ts`, `whatsapp-send-route.spec.ts`, `messaging-client-timeout.spec.ts` (mover o timeout para o provider)

**Interfaces:**
- Consumes: Task 4 `getWhatsAppForOrganization`, Task 3 `resolveOrganizationIdForUser`.
- Regra: a organização vem do registro (lead → `leads_prospeccao.organization_id`; conversa → lead da conversa; rota de usuário → `resolveOrganizationIdForUser(user.id)` e o lead tem de ser da mesma org).
- Jobs: lead cuja org não tem WhatsApp ativo → não envia, `releaseFollowUpClaim`, log `whatsapp_not_configured` com `organization_id` (sem telefone).
- Rotas: sem conexão → 409 `{ error: { code: 'WHATSAPP_NOT_CONFIGURED', message: 'WhatsApp não configurado para esta organização. Fale com a equipe IntelliX.' } }`.

- [ ] **Step 1: Testes** — por chamador: `envia pela conexão da organização do lead`; `lead de outra org → 404/skip`; `org sem conexão → 409 / skip + release` (Review Focus 1); timeout do provider preservado.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** `npx vitest run tests/unit` PASS (exceto falha pré-existente).
- [ ] **Step 5:** `git grep -nE "process\.env\.(EVOLUTION|META_WA|WHATSAPP_PROVIDER)" -- app src lib` → vazio (exceto o webhook antigo, tratado na Task 7). Commit `refactor: envio de WhatsApp sempre pela conexão da organização`.

### Task 6: Entrada de WhatsApp por conexão (Meta ponta a ponta + Evolution)

**Files:**
- Create: `app/api/webhooks/whatsapp/[key]/route.ts` (GET verificação Meta, POST eventos), `src/lib/webhooks/connection-inbound.handler.ts`, `src/lib/webhooks/normalizers/meta.normalizer.ts`, `src/lib/webhooks/normalizers/evolution.normalizer.ts`
- Modify: `src/lib/webhooks/whatsapp-inbound.handler.ts` (extrair o processamento comum para receber `{ organizationId, connectionId, event }`), `src/lib/workflows/lead-conversation.workflow.ts` (tenant vem do contexto, não de `resolveTenantByInstance`), `src/lib/services/tenant-resolver.service.ts` (remover `resolveTenantByInstance`)
- Keep (transição): `app/api/webhooks/evolution/[token]/route.ts` continua funcionando até o corte (Task 12 remove)
- Test: `tests/unit/connection-webhook.spec.ts`, `tests/unit/meta-normalizer.spec.ts`

**Interfaces:**
- Consumes: Task 3 `resolveConnectionByWebhookKey`, `verifyMetaSignature` de `src/lib/webhooks/webhook-token.ts` (reescrever com Web Crypto HMAC-SHA256 se ainda usar `node:crypto`).
- Produces: `interface InboundMessageEvent { organizationId: string; connectionId: string; provider: 'meta_cloud' | 'evolution'; from: string; messageId: string; timestamp: number; type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'unsupported'; text?: string; mediaId?: string; mimetype?: string; pushName?: string }`; `normalizeMetaPayload(body: unknown): InboundMessageEvent[]` (sem organizationId/connectionId, preenchidos pelo handler); `normalizeEvolutionPayload` equivalente.
- Regras: `key` malformado → 401 sem tocar no banco; GET Meta só responde `hub.challenge` se `hub.verify_token` = `secret.verifyToken`; POST Meta exige `X-Hub-Signature-256` válido com `secret.appSecret` sobre o corpo bruto; POST Evolution exige header `apikey` = `secret.apiKey` (comparação em tempo constante) e `instance` do payload = `config.instanceName`; limite de corpo como no handler atual; organização sempre a da conexão.

- [ ] **Step 1: Testes** — `GET verify com token certo devolve challenge, errado 403`; `POST Meta assinatura inválida → 401, handler não chamado` (Review Focus 3); `POST Evolution apikey errada → 401` (Review Focus 3); `POST Evolution de outra instância → 401`; `Meta texto/áudio/imagem viram InboundMessageEvent corretos` (fixtures de payload real da Graph API v20); `status updates da Meta (sem messages) → 200 sem processar`; `organização do evento = da conexão mesmo com payload dizendo outra coisa`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: webhook de WhatsApp por conexão com Meta Cloud API ponta a ponta`.

### Task 7: E-mail pela conexão (domínio do cliente)

**Files:**
- Create: `src/lib/connectors/email/resend.adapter.ts`, `src/lib/connectors/email/get-email-sender.ts`
- Modify: `app/api/email/send-bulk/route.ts`, `app/api/campaigns/[id]/send/route.ts`, `app/api/admin/test-email/route.ts`, `app/api/admin/approve-user/route.ts`, `src/lib/userSettings.ts` (remover leitura de `resend_api_key`/`from_email`)
- Test: `tests/unit/email-sender.spec.ts`; atualizar `campaign-send-route.spec.ts`, `test-email-route.spec.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces:
  - `interface EmailSender { from: string; sendBatch(messages: { to: string; subject: string; html: string; replyTo?: string }[]): Promise<{ sent: number; failed: number; ids: string[] }> }`
  - `getEmailSenderForOrganization(organizationId: string): Promise<EmailSender>` — `from = "${fromName} <${fromEmail}>"` da conexão; registra consumo `emails`.
  - `getPlatformEmailSender(): Promise<EmailSender>` — para e-mails de sistema da IntelliX aos usuários (aprovação, teste); usa `platform_credentials.resend` com `config.fromEmail`/`fromName` da própria credencial; sem credencial → erro claro.
  - `checkResendDomainVerified(apiKey: string, domain: string): Promise<boolean>` (`GET https://api.resend.com/domains`, procura `name === domain && status === 'verified'`).
- Rotas de envio sem conexão → 409 `EMAIL_NOT_CONFIGURED`.

- [ ] **Step 1: Testes** — `from usa domínio da organização`; `org sem conexão de e-mail → 409`; `campanha da org A nunca usa conexão da org B`; `checkResendDomainVerified false para status pending` (Review Focus 5); `e-mail de aprovação usa getPlatformEmailSender`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: e-mail pela conexão da organização com domínio próprio`.

### Task 8: LLM pela conexão

**Files:**
- Modify: `src/lib/ai/openai-key-context.ts`, `src/lib/workflows/lead-conversation.workflow.ts`, `app/api/admin/rag-ingest/route.ts`, `app/api/leads/import/map/route.ts`, `app/api/templates/personalize/route.ts`, `src/lib/ai/ai-agent.service.ts`, `src/lib/ai/rag/embeddings.service.ts`, `src/lib/services/message-humanizer.service.ts`, `src/lib/services/pdf-analyzer.service.ts`, `src/lib/integrations/openai/vision.service.ts`, `src/lib/integrations/openai/whisper.service.ts`, `src/lib/services/tenant-resolver.service.ts` (remover `openaiApiKey` de `user_settings`), e os desvios `tenant_id === 'intellix'` (`git grep -n "'intellix'" -- src app`)
- Test: `tests/unit/llm-context.spec.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces:
  - `interface LlmContext { organizationId: string; connectionId: string; apiKey: string; model?: string }`
  - `withLlmForOrganization<T>(organizationId: string, fn: () => Promise<T>): Promise<T>` (resolve a conexão `llm` e roda `fn` no AsyncLocalStorage — substitui `withOpenAIKey`)
  - `getCurrentLlm(): LlmContext` — sem contexto lança `ConnectionNotConfiguredError` (**sem** fallback `OPENAI_API_KEY`)
  - `recordLlmUsage(usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined, operation: string): Promise<void>` — chamado após cada resposta OpenAI (unit `tokens`).
- Nota: `AsyncLocalStorage` já é usado aqui; manter (Workers tem `nodejs_als`/`nodejs_compat`, verificado no Sprint 3).

- [ ] **Step 1: Testes** — `sem contexto → ConnectionNotConfiguredError`; `dentro de withLlmForOrganization usa a chave da conexão`; `org sem llm → erro antes de chamar a API`; `uso de tokens é registrado com a organização do contexto`; `nenhum caminho lê process.env.OPENAI_API_KEY` (grep no teste ou spy).
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS.
- [ ] **Step 5:** Commit `refactor: LLM sempre pela conexão da organização, com registro de tokens`.

### Task 9: Prospecção pelas conexões (aposenta a edge function e o gateway Lovable)

**Files:**
- Create: `app/api/prospecting/places/route.ts`, `src/lib/services/places-prospecting.service.ts`, `src/lib/connectors/prospecting/google-places.adapter.ts`
- Modify: `src/lib/services/contact-enrichment.service.ts`, `src/lib/services/linkedin-prospecting.service.ts`, `app/(protected)/page.tsx:196`, `src/components/ProspectionForm.tsx:244`
- Delete: `src/lib/services/api-keys.service.ts`, `supabase/functions/prospection/` (o código; apagar a função publicada no Supabase é ação do usuário, listar no relatório)
- Test: `tests/unit/places-prospecting.spec.ts`

**Interfaces:**
- Consumes: Task 3, Task 4 (checagem de número só se a org tiver Evolution ativa; com Meta ou sem WhatsApp, pular a checagem e marcar `whatsapp = telefone`, como o comportamento atual "assumir true"), Task 8 (mensagem de abordagem via `withLlmForOrganization`).
- Produces: `POST /api/prospecting/places` com body Zod igual a `ProspectionRequest` da edge function atual (`niche`, `location`, `quantity` ≤ 60, `businessName?`, `bairros?`, `searchMode?`) e resposta `{ data: { insertedCount, recurrentCount, total, processedTotal, failedProcessing, failedInsertion }, meta: {} }`. Comportamento funcional igual ao de `supabase/functions/prospection/index.ts` (Find Place para nome, Text Search para nicho, Details em paralelo, filtro de bairros, deduplicação por `id`, numeração `Lead-NNN`), com estas diferenças: organização e usuário vêm da sessão; sem `user_id` do body; erros internos não voltam ao cliente; mensagem gerada via LLM da org com o mesmo prompt neutro atual; consumo registrado (`requests` por chamada Google, `tokens`).
- Firecrawl/Apify: `resolveConnection(orgId, 'prospecting', 'firecrawl' | 'apify')`; sem conexão → erro claro `PROSPECTING_SOURCE_NOT_CONFIGURED`.

- [ ] **Step 1: Testes** — `busca por nicho insere leads com organização da sessão`; `lead já existente conta como recorrente`; `org sem google_places → 409`; `quantity > 60 → 400`; `falha da LLM usa o modelo de mensagem sem quebrar a prospecção`; `firecrawl usa conexão da org`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar e trocar as duas chamadas do frontend para `fetch('/api/prospecting/places')` → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: prospecção Google Places pelo app via conexões; aposenta edge function e gateway Lovable`.

### Task 10: API do admin da plataforma (conexões, credenciais, teste de conexão)

**Files:**
- Create: `app/api/admin/organizations/route.ts` (GET lista orgs), `app/api/admin/organizations/[orgId]/connections/route.ts` (GET, PUT), `app/api/admin/organizations/[orgId]/connections/[connectionId]/route.ts` (PATCH status `active|disabled`, DELETE), `app/api/admin/organizations/[orgId]/connections/[connectionId]/test/route.ts` (POST), `app/api/admin/platform-credentials/route.ts` (GET sem segredo, PUT), `src/lib/connectors/testers.ts`, `src/lib/services/connections-admin.service.ts`, `src/lib/validations/connections.ts`
- Create: `app/api/connections/status/route.ts` (GET, qualquer membro: status da própria org)
- Test: `tests/unit/connections-admin-routes.spec.ts`

**Interfaces:**
- Consumes: Task 1, Task 3, Task 7 (`checkResendDomainVerified`).
- Produces:
  - PUT body: `{ category, provider, credentialSource, config, secret?: Record<string,string> }` validado pelo Zod do provedor; `secret` ausente mantém o atual (Review Focus 2); `secret` presente com campo vazio → 400; `credentialSource='own'` em conexão nova sem `secret` → 400. Salvar sempre deixa `status='pending_test'`.
  - Resposta de conexão (nunca com segredo): `{ id, category, provider, credentialSource, config, status, lastTestedAt, lastTestResult, hasSecret: boolean, secretHint: string | null (4 últimos chars), webhookUrl: string | null (só admin; `${NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp/${webhook_key}`), configuredBy, updatedAt }`.
  - `testConnection(conn: ResolvedConnection-like incluindo não ativas): Promise<{ ok: boolean; message: string }>` por provedor: Meta `GET https://graph.facebook.com/{v}/{phoneNumberId}`; Evolution `GET {baseUrl}/instance/connectionState/{instanceName}` (state `open`); Resend `checkResendDomainVerified`; OpenAI `GET /v1/models`; Google Places Find Place mínima; Apify `GET https://api.apify.com/v2/users/me`; Firecrawl chamada de menor custo documentada (executor confirma via Context7). Resultado `ok` → `status='active'`, senão `failing`; grava `last_tested_at`/`last_test_result` (mensagem sem segredo).
  - Todas as rotas `/api/admin/*` acima: `isPlatformAdmin(user.id)` senão 403; Zod; `{ data, meta }`.
  - `GET /api/connections/status` → `{ data: { category, provider, status, lastTestedAt }[] }` só da org do usuário.

- [ ] **Step 1: Testes** — `não admin → 403 em todas`; `PUT sem secret mantém o segredo` e `PUT com secret vazio → 400` (Review Focus 2); `resposta nunca contém secret/apiKey/accessToken` (varrer JSON); `test ok → active, falha → failing com mensagem sem segredo`; `status/route devolve só a org do usuário`; `evolution baseUrl privado/localhost → 400` (assertSafeOutboundUrl).
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: API do admin da plataforma para conexões e credenciais`.

### Task 11: Telas (admin configura; cliente vê status; avisos de não configurado)

**Files:**
- Create: `src/components/admin/OrganizationConnections.tsx`, `src/components/admin/PlatformCredentials.tsx`, `src/components/connections/ConnectionStatusList.tsx`, `src/components/connections/NotConfiguredNotice.tsx`, `src/hooks/useConnectionStatus.ts`
- Modify: `app/(protected)/settings/page.tsx` (abas "Organizações → Integrações" e "Credenciais da plataforma", visíveis só para admin da plataforma; remover campos de chaves/instância/provedor de `user_settings`), `app/(protected)/integrations/page.tsx` (vira status somente leitura), telas de envio (inbox, campanhas, prospecção, envio de WhatsApp) exibem `NotConfiguredNotice` quando o status da categoria não é `active`
- Test: `tests/unit/connection-status-list.spec.tsx` (se o projeto tiver ambiente jsdom; senão testar o hook/formatador)

**Interfaces:**
- Consumes: Task 10 (rotas e formatos).
- UI: TanStack Query; shadcn/ui; mobile-first; campos de segredo `type="password"`, nunca pré-preenchidos, placeholder "configurado (…1234)"; botão "Testar conexão"; mostra `webhookUrl` com botão copiar (só admin) e, para e-mail, o domínio e o status de verificação; texto do aviso: "WhatsApp não configurado para esta organização. Fale com a equipe IntelliX." (equivalente para e-mail, IA, prospecção).

- [ ] **Step 1:** Teste do formatador/hook (`status active → "Conectado"`, `failing → "Com falha"`, `pending_test → "Aguardando teste"`, ausente → "Não configurado").
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS; `npm run build` sem erro.
- [ ] **Step 5:** Commit `feat: telas de integrações por organização (admin) e status (cliente)`.

### Task 12: Script de migração assistida + limpeza pós-corte

**Files:**
- Create: `scripts/migrate-connections.ts` (roda com `npx tsx`, `--dry-run` padrão, `--apply` explícito), `supabase/migrations/20261031110000_drop_plaintext_integration_columns.sql` + rollback, `docs/runbooks/corte-conectores.md`
- Delete (no commit de limpeza, só depois do corte): `app/api/webhooks/evolution/[token]/route.ts`, `app/api/webhooks/evolution/route.ts`, `resolveTenantByWebhookToken`, leituras restantes de colunas de segredo de `user_settings`; variáveis `WHATSAPP_PROVIDER`, `EVOLUTION_*`, `META_WA_*`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `FROM_EMAIL`, `FIRECRAWL_API_KEY`, `APIFY_API_KEY` de `.env.example`, `CLAUDE.md` e `CLOUDFLARE_MIGRATION_PLAN.md`
- Test: `tests/unit/migrate-connections.spec.ts`

**Interfaces:**
- Consumes: Task 1, Task 3.
- Script: para cada organização, pega `user_settings` do membro `admin` da org (usuários sem org: ignorados e listados); cria conexão `whatsapp` (provider `meta` → `meta_cloud` com `business_phone_number_id`, `business_access_token`, `meta_verify_token`; `evolution` → `evolution` com `evolution_api_url` normalizada para a base, `evolution_api_key`, `evolution_instance_name`); `openai_api_key`/`resend_api_key`/`apify_api_key`/`firecrawl_api_key` preenchidas → conexões `own`, vazias → `platform`; tudo com `status='pending_test'`; idempotente (não sobrescreve conexão existente); imprime resumo sem segredos.
- Migration de drop: remove de `user_settings` `evolution_api_url`, `evolution_api_key`, `evolution_instance_name`, `openai_api_key`, `resend_api_key`, `apify_api_key`, `firecrawl_api_key`, `business_access_token`, `business_phone_number_id`, `meta_verify_token`, `zapi_instance_id`, `zapi_token`, `zapi_url`, `provider`, `from_email`, `integration_configured`, `user_webhook_url`, `whatsapp_webhook_url`, `webhook_token` (e ajusta o guard `guard_user_settings_privileged_columns` e índices que citam essas colunas). Rollback recria as colunas (dados vêm do backup).
- Runbook (`docs/runbooks/corte-conectores.md`), ordem: (1) aplicar migration da Task 2 [autorização]; (2) cadastrar credenciais da plataforma; (3) deploy do código das Tasks 1–11 [autorização]; (4) `migrate-connections --dry-run`, revisar com o usuário, `--apply` [autorização]; (5) testar conexões na tela; (6) trocar a URL do webhook no provedor para a `webhookUrl`; (7) observar 24 h; (8) commit de limpeza + migration de drop [autorização + backup]; (9) usuário apaga a edge function `prospection` e as variáveis antigas na Vercel.

- [ ] **Step 1: Testes do script** (com fake) — `dry-run não escreve`; `meta mapeia campos e cifra segredo`; `evolution normaliza URL /chat/whatsappNumbers/... para a base`; `chave vazia vira platform`; `segunda execução não duplica`; `saída não contém segredo`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar script + runbook → **Step 4:** PASS. Commit `feat: script de migração assistida das conexões e runbook de corte`.
- [ ] **Step 5:** Escrever a limpeza e a migration de drop em commit separado `chore: remove credenciais em texto puro e webhook por token de usuário (pós-corte)`, **marcado no ledger como "não fazer merge antes do passo 7 do runbook"**. Critério: `git grep -nE "process\.env\.(EVOLUTION|META_WA|WHATSAPP_PROVIDER|OPENAI_API_KEY|RESEND_API_KEY|FROM_EMAIL|FIRECRAWL_API_KEY|APIFY_API_KEY)" -- app src lib` vazio (registrar a saída no ledger).

---

## Ao final

- Revisão de branch inteira (SDD) + fleet DevSecOps (security, multi-tenant, database-architect, privacy-lgpd, architect) sobre o diff.
- Critério de saída do spec (seção 7) verificado item a item; os itens que dependem de produção (duas orgs reais trocando mensagens, RLS em produção) ficam como checklist do runbook.
- Nada de push, merge, migration em produção ou deploy sem autorização explícita.
