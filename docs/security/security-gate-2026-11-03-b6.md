# Security Gate — B6 da virada Vercel → Cloudflare (2026-11-03)

Branch `claude/sprint3-cloudflare`, SHA revisado `ea21e61`. Diff real contra `main`:
180 arquivos. O PR #21 (Sprint 3, 41 arquivos, sem migration) já tinha passado pelo
fleet; desde então só mudou documentação. Este gate rodou o fleet completo sobre o
PR #20 (Sprint 2b, 145 arquivos, migration `20261031100000_organization_connections`).

## Revisores (somente leitura)

| Revisor | Veredito | Crit | High | Medium | Low/Info |
|---|---|---|---|---|---|
| security-reviewer | PASS com condições | 0 | 0 | 1 (F-01) | 3 |
| multi-tenant-reviewer | PASS com condições | 0 | 0 | 0 | 4 |
| database-architect | PASS com condições | 0 | 0 | 0 | 6 |
| privacy-lgpd-reviewer | PASS com condições | 0 | 0 | 2 (LGPD-01, 02) | 2 |
| architect-reviewer | PASS com condições | 0 | 0 | 1 (ARQ-01) | 5 |

Conferências feitas em produção (só leitura) sobre pontos "plausíveis":

- DB-02: produção tem a versão final da migration (constraint e índice de Evolution,
  coluna `last_test_ok`).
- DB-01: 0 conexões `active` sem `last_test_ok`; falta só o CHECK no banco.
- ARQ-01 / MT-2B-01 / MT-2B-02: `organization_members` tem `UNIQUE (user_id)`; cada
  usuário está em uma organização. Não exploráveis hoje; viram bloqueio se o UNIQUE cair.
- F-01: 10 das 13 conexões ativas usam credencial da plataforma (OpenAI das orgs
  clientes; Google Places, Apify e Firecrawl das três).

## Achados que pedem decisão

| Id | Sev. | Resumo | Regressão da virada? |
|---|---|---|---|
| F-01 | Medium | Prospecção Places sem rate limit nem cota; gasta chave da plataforma | Não: o código atual também usa chaves de env sem limite |
| LGPD-01 | Medium | Places não consulta lista de supressão (LinkedIn consulta) | Não (edge function antiga igual) |
| LGPD-02 | Medium | Campanha e e-mail em massa não filtram `opt_out` | Não (existe na `main`) |
| DEP-01 | High | `npm audit`: next 14.2.35 (DoS de RSC, SSRF em rewrites/WebSocket, cache poisoning), zod <4.6.6 (memória), xlsx (prototype pollution/ReDoS, sem correção) | Não: mesmas versões em produção hoje |
| ENV-01 | — | Staging compartilha o banco de produção | Desenho do runbook; mitigado por Access, sem crons/filas, `FOLLOW_UP_MODE=disabled` |
| ENV-02 | — | Restore de backup não verificado nesta janela | B7 não altera schema (migration aplicada no B3, com rollback) |

DEP-01 em detalhe: os 3 avisos `critical` do next não se aplicam. Dois são RCE no
otimizador de imagem (AVIF/SVG), e o Worker intercepta `/_next/image` antes do Next
(`.open-next/worker.js:37`) com handler próprio que bloqueia SVG e só repassa o arquivo
sem processar (testado no staging: PNG externo 200, SVG 403, metadata/localhost 400). O
terceiro exige servidor Windows. Server Actions: nenhuma no código (avisos de Server
Actions não se aplicam). Os `high` de DoS em Server Components se aplicam.

## Achados para o backlog (Low/Info)

F-02 Evolution segue redirect com `apikey` (corrigir antes de ativar WhatsApp, junto com
A3) · F-03 cofre sem AAD · F-04/MT-2B-03 grants de `authenticated` em
`organization_connections` (UPDATE de `status`/`secret`, SELECT de `config`) · DB-01 CHECK
`status <> 'active' or last_test_ok` · DB-03 índice em `usage_events.connection_id` · DB-04
`setStatus` sem filtro de org · DB-05 teste SQL `1..24` → `1..26` · MT-2B-04 PK global
`place_id` · ARQ-02..05 · ARQ-06 `waitUntil` de `@vercel/functions` no inbound (validar
antes de ativar WhatsApp) · LGPD-03 amostra de planilha sem máscara para a OpenAI · LGPD-04
retenção · E2E: JSON malformado → 500 (19 rotas), sem HSTS (sem efeito em `.dev`), GET com
efeito colateral em `admin/register-templates` e `admin/rag-ingest`.

## Registro

```text
CRITICAL_OPEN: 0
HIGH_OPEN: 1 (DEP-01, pré-existente)
MEDIUM_OPEN: 4 (F-01, LGPD-01, LGPD-02, ARQ-01 não explorável hoje)
RESTORE_VERIFIED: false
STAGING_VALIDATED: true (B4, B5, test-report-2026-11-03)
INDEPENDENT_REVIEW_COMPLETE: true
RUNTIME_TESTS_COMPLETE: true (sem stress: banco de produção)
ATTACK_VALIDATION_COMPLETE: parcial (negativos, cron, cross-org admin, proxy de imagem)
ATTACK_EVIDENCE_REVISION: ea21e61
ROLLBACK_READY: true (B7, Vercel pausada e não deletada)
EXPLICIT_AUTHORIZATION: pendente
SECURITY_GATE: FAIL até aceitação formal de DEP-01, ENV-01, ENV-02 (ou correção)
```
