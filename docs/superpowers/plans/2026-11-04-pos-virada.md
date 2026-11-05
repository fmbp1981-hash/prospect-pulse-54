# Plano pós-virada — LeadFinder Pro em Cloudflare (2026-11-04)

Estado de partida: produção no Worker `prospect-pulse-54` (versão `71acac83`) desde
2026-11-04 02:04 UTC; B7 e B8 concluídos; Vercel pausada; n8n desligado; WhatsApp sem
conexão. Riscos aceitos e prazos em `docs/security/security-gate-2026-11-03-b6.md`.
Mudanças em código vão em branch própria a partir da `main` (merge na `main` publica
em produção pelo Workers Builds).

Ordem decidida por: (1) o que pode quebrar a produção agora, (2) obrigação legal,
(3) custo, (4) prazos aceitos, (5) o que destrava o WhatsApp.

## Fase 0 — Estabilização (04 a 06/11)

| # | Item | Dono | Critério de pronto |
|---|---|---|---|
| 0.1 | B9: checagem de 24 h a partir de 05/11 02:05 UTC | E | sem 5xx novos; DLQ vazia; `usage_events` coerente com o uso; sem `ConnectionNotConfiguredError` inesperado |
| 0.2 | Comunicar URL nova e mudanças de comportamento (runbook, "Mudanças de comportamento") aos clientes | U | ldtfelipe e Silva Transportes avisados e logados |
| 0.3 | Observabilidade do cron: a consulta de Workers Logs não mostra eventos `scheduled` (só o `wrangler tail`). Investigar sampling/config e criar um sinal confiável (ex.: log estruturado no sucesso do cron + alerta de ausência) | E | execução do cron visível e alertável sem `tail` |
| 0.4 | GitGuardian: marcar a chave `anon` como falso positivo | U | check verde nos próximos PRs |
| 0.5 | Backup próprio imediato do banco (plano Free não tem backup gerenciado) — `pg_dump` de schema + dados para local seguro fora do repo | U+E | dump existe e abre (`pg_restore --list`) |

## Fase 1 — Sprint 4 "conformidade e custo" (até 17/11, riscos aceitos)

Fluxo IntelliX: `/spec` → `/break` → `/plan` → `/execute` por item; staging antes de
produção; migration em produção só com autorização no momento, rollback e backup.

| # | Item | Origem | Escopo mínimo |
|---|---|---|---|
| 1.1 | **Opt-out completo** (prioridade 1: obrigação legal e pré-requisito do WhatsApp) | LGPD-02 ampliado | migration `opt_out` (+ data e origem) com rollback; campo na ferramenta `update-lead` e prompt coerente; filtro em campanha, e-mail em massa, WhatsApp avulso e follow-up; ação manual na tela do lead; link de descadastro real no e-mail (hoje é `mailto`); testes |
| 1.2 | **Limite de uso e cota por organização** | F-01 | rate limit por org/usuário nas rotas de prospecção e LLM (binding de Rate Limiting do Cloudflare); cota mensal checada **antes** da chamada quando `credential_source = 'platform'`; erro claro na tela |
| 1.3 | **Supressão na prospecção Google** | LGPD-01 | lista por organização (place_id + telefone normalizado), consultada antes do insert, no molde da do LinkedIn; integrar com o opt-out do 1.1 |
| 1.4 | **Teste de restore** | ENV-02 | restaurar o dump do 0.5 num Postgres isolado (local ou projeto/branch descartável) e conferir contagens das tabelas principais; documentar o procedimento; decidir se vale o plano Pro (backups diários + PITR) |
| 1.5 | Endurecimentos rápidos (mesmo PR ou PR curto) | E2E, DB, F-04 | JSON malformado → 400 (helper nas 19 rotas); GET com efeito colateral → POST (`admin/register-templates`, `admin/rag-ingest`); CHECK `status <> 'active' or last_test_ok`; índice em `usage_events.connection_id`; `setStatus` com filtro de org; teste SQL `1..26`; revisar grants de `authenticated` em `organization_connections` |

## Fase 2 — Limpeza pós-corte (após 48 h de DLQ vazia, ~06/11)

Parte C do runbook: rotas e colunas legadas (passo 11 de `corte-conectores.md`),
`vercel.json`/`.vercelignore`/`DEPLOY_VERCEL.md`, referências a `.vercel.app`, modo
`direct` do follow-up, variáveis antigas na Vercel. Decidir com o usuário quando
**deletar** o projeto da Vercel (hoje pausado = caminho de rollback). Guardar fora do
repo os backups com segredo em `scripts/legacy/`.

## Fase 3 — Atualização de dependências (até 30/11)

| # | Item | Notas |
|---|---|---|
| 3.1 | Next 14.2.35 → 15.5.x (linha corrigida) | mudança de versão grande: APIs assíncronas (`cookies`, `headers`, `params`), cache, compatibilidade do OpenNext; ramo próprio, build do Cloudflare, E2E no staging |
| 3.2 | zod ≥ 4.6.6 | conferir APIs com Context7; muitos schemas |
| 3.3 | Trocar `xlsx` (sem correção) | candidatos: `exceljs` ou a build oficial da SheetJS; usado em importação/exportação de leads |
| 3.4 | Reavaliar `npm audit` | meta: zero high/critical aplicáveis |

## Fase 4 — Reativar WhatsApp (após 1.1)

Pré-requisitos, nesta ordem:

1. **A3**: providers classificam falha ambígua e não repetem envio em timeout/erro de
   rede (`withRetry` em `evolution.provider.ts` e `meta-cloud.provider.ts`); corrigir
   ADR e runbook.
2. **F-02**: `redirect: 'manual'` nas chamadas à Evolution.
3. **ARQ-06**: trocar `waitUntil` de `@vercel/functions` no inbound por `ctx.waitUntil`
   do OpenNext/`after()` e provar que o processamento termina no Workers.
4. `pdf-parse`: conferir a cada build que o `node-ensure` resolve para `index.js`.
5. Instância nova (Evolution recriada do zero ou Meta Cloud), webhook apontado para a
   `webhookUrl` da conexão, mensagem de teste de número externo.
6. Templates HSM por organização, para destravar as etapas de follow-up suspensas.

## Fase 5 — Staging separado (até 15/12)

ENV-01: staging com banco próprio (projeto Supabase separado ou branch), dados
sintéticos, secrets próprios. Com isso os smokes pagos e de escrita deixam de tocar
produção.

## Backlog sem prazo (Low/Info)

F-03 (AAD no cofre) · MT-2B-03/04 · ARQ-01/MT-2B-01/02 (viram bloqueio se o
`UNIQUE (user_id)` de `organization_members` cair) · ARQ-02..05 · LGPD-03 (máscara na
amostra de planilha) · LGPD-04 (retenção de lead frio) · LinkedIn com
`organization_id` nulo · upload de PDF da base de conhecimento sem extração de texto ·
HSTS se houver domínio próprio · `generate-template-ai` ainda com chave via env.

## Linha de base do B9 (2026-11-04 02:27 UTC)

`usage_events`: IntelliX.AI llm 1, prospecting 2 (testes do B5). Leads: 111, todos
`not_sent`. Fila `follow-up-sends`: produtor e consumidor = `prospect-pulse-54`.
