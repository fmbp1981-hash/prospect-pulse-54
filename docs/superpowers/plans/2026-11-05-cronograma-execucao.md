# Cronograma de execução do plano pós-virada (2026-11-05)

Complementa `2026-11-04-pos-virada.md` (o QUÊ e a ordem). Aqui ficam o QUANDO, quem
executa e o que roda em paralelo. Acompanhamento ao vivo: painel "Plano Pós-Virada
LeadFinder" (https://claude.ai/artifact/1br53sdA4ctCFCRYpH2JhQ), atualizado a cada
entrega.

## Regras de execução (decididas em 2026-11-04)

1. **Uma rodada de revisão por task.** Revisores isolados leem só o diff. Achado Low
   vira backlog, salvo segurança ou LGPD. Critical, High e Medium voltam para correção.
2. **No máximo um script de banco por task** no SQL Editor (a confirmação do MCP do
   Supabase não funciona no Warp). Migration em produção só com autorização no momento,
   rollback no PR e backup prévio.
3. **O usuário entra em três pontos:** autorizar migration, autorizar push/PR e aprovar
   merge/deploy.
4. **Paralelo só com fileset disjunto:** cada task da onda roda em worktree próprio; os
   filesets de TASK-003, 004, 005, 006, 007 e 008 não se cruzam (conferido nos contratos).
5. Cronograma em dias úteis, uma sessão por dia.

## Ondas

| Onda | Datas | Modo | Itens | Executor | Revisores |
|---|---|---|---|---|---|
| 0 | 04–05/11 | sequencial | TASK-001 (PR #22) | database-engineer | database-architect |
| 1 | 05/11 | paralelo | TASK-002 serviço de oposição | backend-engineer | security, multi-tenant, privacy-lgpd |
| | | | 0.1 checagem de 24 h | platform-engineer | observability |
| | | | 0.5 backup · 0.4 GitGuardian · 0.2 clientes | usuário | — |
| 2 | 06–10/11 | paralelo (6 frentes) | TASK-003 follow-ups | backend-engineer | architect, privacy-lgpd |
| | | | TASK-004 envios manuais e em massa | backend-engineer | multi-tenant, security |
| | | | TASK-005 agente de IA e palavras de saída | integration-engineer | security, privacy-lgpd |
| | | | TASK-007 reentrada na prospecção | backend-engineer | multi-tenant |
| | | | TASK-008 rotas de API | backend-engineer | security, multi-tenant |
| | | | TASK-006 descadastro público (até 10/11) | backend + frontend-engineer | security, privacy-lgpd |
| 3 | 10/11 | paralelo | TASK-009 tela da oposição | frontend-engineer | accessibility, architect |
| | | | 0.3 observabilidade do cron | platform-engineer | observability |
| 4 | 11/11 | sequencial | TASK-010 release do opt-out | release-manager | os 5 revisores + security gate |
| 5 | 12–16/11 | paralelo | 1.2 cota · 1.3 supressão Google · 1.5 endurecimentos | backend/platform | security, multi-tenant, database-architect |
| 6 | 17/11 | sequencial | 1.4 teste de restore | usuário + platform | — |
| 7 | 18–23/11 | paralelo | A3 · F-02 · ARQ-06 · limpeza da Vercel; depois instância de WhatsApp | integration/platform | security, architect |
| 8 | 24–30/11 | paralelo | Next 15 · zod · troca do xlsx · npm audit | platform/backend | architect, security |
| 9 | 01–11/12 | sequencial | Staging com banco próprio | platform-engineer + usuário | database-architect, security |

## Marcos

| Data | Marco |
|---|---|
| 11/11 | Opt-out completo em produção (item 1.1) |
| 17/11 | Fase 1 concluída, dentro do prazo dos riscos aceitos |
| 23/11 | WhatsApp reativado |
| 30/11 | Dependências atualizadas |
| 11/12 | Staging separado da produção |

## Riscos de prazo

- TASK-006 abre rota pública sem login; é a mais provável de escorregar e empurra a
  release para 12/11.
- A onda 2 gera seis PRs revisados no mesmo período; o gargalo passa a ser a aprovação
  de merge.
- Next 15 (3.1) muda APIs assíncronas e o build do OpenNext; pode passar de 4 dias.
