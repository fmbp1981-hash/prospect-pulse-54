# Relatório de Testes E2E — LeadFinder Pro (B6, staging Cloudflare)

**Data:** 2026-11-03 (UTC 2026-11-04 ~01:05)
**Stack:** Next.js 14 (OpenNext) em Cloudflare Workers + Supabase
**URL testada:** `https://prospect-pulse-54-staging.fmbp1981.workers.dev` (atrás do Cloudflare Access)
**Sessão:** admin da organização IntelliX.AI
**Escopo:** B6 do `docs/runbooks/cutover-cloudflare.md` — smoke dos fluxos do B4 e B5,
somente leitura. O staging compartilha o banco de produção, por isso:

- sem stress/carga (bateria no banco de produção);
- negativos só com payloads rejeitados pela validação antes de qualquer chamada paga;
- smokes que gravam ou gastam crédito já rodaram no B5 item 8 (com autorização) e não foram repetidos.

Critério de aceite: as verificações do B4 e B5 no runbook. Gauntlet Loop não se aplica
(não há referência de produto a comparar).

## Resumo executivo

| Fase | Total | Pass | Fail | Observação |
|------|-------|------|------|------------|
| Smoke (páginas autenticadas) | 9 | 9 | 0 | 438–1947 ms |
| Funcionais (leituras de API dos fluxos B4/B5) | 13 | 13 | 0 | rotas admin de plataforma → 403 para admin de organização (esperado) |
| Negativos | 14 | 13 | 1 | ver Achado 1 |
| Segurança (headers, cron, isolamento) | 5 headers + 4 | 8 | 1 | ver Achado 2 |
| Unit/integração (Vitest local) | 682 | 682 | 0 | 64 arquivos |
| Lint | — | ok | — | 1 warning (`Database` não usado em `src/lib/userSettings.ts`) |
| Stress | N/A | — | — | não executado: banco de produção |
| UI/UX | N/A | — | — | coberto pelo smoke visual do B4 |

Workers Logs de staging na janela: 0 erros espontâneos. Os 4 eventos `error` são os
dois testes de JSON malformado do Achado 1 (2 linhas cada).

Smokes do B5 item 8 (rodados antes, com autorização): Google 200 (1 lead), LinkedIn 200
(1 contato), `pdf-parse` validado no workerd local. Dados de teste apagados com backup.

## Achados

Nenhum crítico. Nenhuma regressão da migração.

1. **Baixo — JSON malformado responde 500** em `POST /api/prospecting/linkedin/search`
   (`req.json()` lança `SyntaxError`, que não é `ZodError`). Mensagem genérica, sem
   vazamento. Já existe na `main` (Vercel) e o padrão se repete: 19 rotas fazem
   `await req.json()` sem tratar corpo inválido. Correção: devolver 400 quando o corpo
   não for JSON (helper compartilhado).
2. **Baixo — sem `Strict-Transport-Security`** nas respostas do Worker. Em
   `*.workers.dev` o efeito é nulo (o TLD `.dev` está na lista de HSTS preload dos
   navegadores). Passa a importar se a produção ganhar domínio próprio: adicionar o
   header em `next.config.js`.
3. **Médio (fora do smoke) — GET com efeito colateral:** `GET /api/admin/register-templates`
   cria templates na Meta e `GET /api/admin/rag-ingest` delega ao POST. Não foram
   chamadas. GET deve ser seguro e idempotente; mover para POST.
4. **Pré-existentes registrados no B5:** LinkedIn grava `contacts`/`companies`/
   `prospecting_jobs`/`linkedin_raw` com `organization_id` nulo (visível só ao dono);
   upload de PDF da base de conhecimento grava base64 sem extrair texto.

## Detalhe

Páginas 200: `/dashboard`, `/leads`, `/kanban`, `/inbox`, `/campanhas`, `/clientes`,
`/integrations`, `/settings`, `/tutorial`.

APIs 200: `connections/status`, `clientes`, `campaigns`, `inbox/conversations`,
`icp-settings`, `webhook-keys`, `agent/config`, `agent/rag`, `leads/import/history`,
`prospecting/linkedin/history`. 403: `admin/organizations`, `admin/platform-credentials`,
`admin/list-users`.

Negativos: `clientes/[uuid inexistente]` 404; `campaigns/[uuid inexistente]` 404;
`clientes/abc` 404; places `quantity: 0`, sem nicho, malformado, `quantity: 61` → 400;
LinkedIn `searchQuery` vazio e `maxItems: 0` → 400, malformado → **500**; crons
`follow-up`, `long-followup`, `rescue-human-mode` com bearer falso → 401;
`admin/organizations/[uuid de outra org]/connections` → 403.

Headers em `/dashboard`: `X-Content-Type-Options`, `X-Frame-Options`,
`Content-Security-Policy`, `Referrer-Policy` presentes; `Strict-Transport-Security` ausente.
Acesso externo sem Access: 302 para o login do Cloudflare Access.
