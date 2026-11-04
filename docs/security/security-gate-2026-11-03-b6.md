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

### LGPD-02 ampliado (verificado em 2026-11-03)

O opt-out não existe no sistema: `leads_prospeccao` não tem coluna `opt_out`, o
`long-followup.job.ts:125` lê um campo sempre vazio, a ferramenta `update-lead` não tem o
campo e o prompt `system-prompt.intellix.v1.ts:54` manda o agente "marcar opt-out" e
confirmar a remoção ao titular. Nenhum envio (campanha, e-mail em massa, WhatsApp,
follow-up) respeita oposição. Exposição atual: 1 campanha cadastrada, nunca enviada;
WhatsApp desligado (A3).

## Aceitação formal de risco (2026-11-03)

Responsável: o usuário dono do projeto (autorização dada no chat em 2026-11-03).

| Item | Justificativa | Condição / prazo |
|---|---|---|
| DEP-01 | Mesmas versões já em produção; críticos não se aplicam no OpenNext | Sprint de atualização do Next (e zod, troca do xlsx) até 2026-11-30 |
| ENV-01 | Desenho do runbook; Access, sem crons/filas, follow-up desligado | Rota `workers.dev` do staging desligada fora das janelas de teste; revisão até 2026-12-15 |
| ENV-02 | B7 não altera schema; rollback da migration do B3 existe | Teste de restore até 2026-11-17 |
| F-01 | Exposição igual à atual; só usuários das 3 orgs conhecidas | Rate limit e cota por org até 2026-11-17 |
| LGPD-01 | Comportamento igual ao da edge function antiga | Supressão na prospecção Google até 2026-11-17 |
| LGPD-02 (ampliado) | Pré-existente; nenhum envio em massa ocorrido; WhatsApp desligado | Opt-out completo **antes** de ligar WhatsApp ou enviar campanha/e-mail em massa; prazo 2026-11-17 |

## Registro

```text
CRITICAL_OPEN: 0
HIGH_OPEN: 1 (DEP-01, pré-existente, risco aceito até 2026-11-30)
MEDIUM_OPEN: 4 (F-01, LGPD-01, LGPD-02, ARQ-01 não explorável hoje)
RESTORE_VERIFIED: false (risco aceito, teste até 2026-11-17)
STAGING_VALIDATED: true (B4, B5, test-report-2026-11-03)
INDEPENDENT_REVIEW_COMPLETE: true
RUNTIME_TESTS_COMPLETE: true (sem stress: banco de produção)
ATTACK_VALIDATION_COMPLETE: parcial (negativos, cron, cross-org admin, proxy de imagem)
ATTACK_EVIDENCE_REVISION: ea21e61
ROLLBACK_READY: true (B7, Vercel pausada e não deletada)
RISK_ACCEPTANCE: registrada em 2026-11-03 (tabela acima)
EXPLICIT_AUTHORIZATION: pendente — o B7 pede [auth] no momento da virada
SECURITY_GATE: PASS com aceitação formal de risco
```
