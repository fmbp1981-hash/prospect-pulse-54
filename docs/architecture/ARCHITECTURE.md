# Arquitetura — LeadFinder Pro (versão mínima, 2026-11-04)

Documento mínimo criado na migração para o framework IntelliX 3.1. Detalhes
operacionais ficam no `CLAUDE.md`, nos ADRs (`docs/adr/`) e nos runbooks.

## Runtime
- **Next.js 14 (App Router)** empacotado pelo **OpenNext** e servido por um
  **Cloudflare Worker** (`prospect-pulse-54`, entrada `custom-worker.ts`), publicado
  pelo Workers Builds a cada merge na `main`. Staging: `prospect-pulse-54-staging`,
  atrás do Cloudflare Access, sem crons nem filas.
- **Cron Triggers** (`wrangler.jsonc`) chamam rotas internas `/api/cron/*` com
  `CRON_SECRET`. O follow-up de 1 minuto despacha para a **Queue**
  `follow-up-sends` (DLQ `follow-up-sends-dlq`), consumida pelo próprio Worker, que
  chama `/api/internal/follow-up/process` com `INTERNAL_QUEUE_SECRET`
  (ADR 0001).
- **Supabase** (Postgres 17, Auth, RLS) é o único banco, na região `sa-east-1`, no
  plano Free (sem backup gerenciado; ver Fase 0/1 do plano pós-virada).

## Camadas
`app/(protected)` e componentes → `app/api/*` (route handlers: autenticação,
autorização, Zod) → `src/lib/services` (regra de negócio) →
`src/lib/repositories` (acesso a dados) → Supabase. Código antigo ainda não segue
tudo; código novo segue. Respostas: `{ data, meta }` ou `{ error: { code, message } }`.

## Multi-tenant
`organizations` e `organization_members` (hoje `UNIQUE (user_id)`: um usuário, uma
organização). RLS por organização em todas as tabelas; rotas resolvem a organização
pela sessão, nunca pelo corpo. `service_role` só no servidor (jobs, webhooks,
repositories de conectores).

## Conectores
`organization_connections` (por organização e categoria) e
`platform_credentials` guardam credenciais cifradas (AES-256-GCM, chave mestra
versionada em secret do Worker). A conexão só fica `active` após teste aprovado.
Consumo registrado em `usage_events`. Provedores: Evolution/Meta (WhatsApp),
Resend (e-mail), OpenAI (LLM), Google Places, Apify, Firecrawl.

## Segurança e LGPD
Webhooks autenticados por chave/HMAC por conexão; segredos nunca em resposta ou
log; logs só com identificadores. Gate de segurança mais recente:
`docs/security/security-gate-2026-11-03-b6.md` (riscos aceitos e prazos).

## Decisões registradas
- ADR 0001 — agendamento por Cron Triggers e Queues.
- Migrations versionadas em `supabase/migrations/` (incompletas em relação à
  produção; inspecionar o schema vivo antes de criar migration) com rollback em
  `supabase/migrations/rollback/`.
