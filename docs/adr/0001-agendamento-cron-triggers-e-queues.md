# ADR 0001 — Agendamento com Cron Triggers + Queues

- **Status:** aceito
- **Data:** 2026-11-01
- **Contexto de origem:** Sprint 3, migração Vercel → Cloudflare (`docs/superpowers/plans/2026-10-30-ajuste-sistema-e-migracao-cloudflare.md`)

## Contexto

Os jobs periódicos do sistema (follow-up, rescue-human-mode, long-followup) rodavam por Vercel Cron e por 3 workflows do n8n. Na Vercel, `waitUntil` e o laço com `setTimeout` entre envios seguravam a função aberta até o fim do lote. Ao migrar para Cloudflare Workers, o agendador precisa ser nativo do host, ter retry e dead-letter para envios que falham, e controlar a vazão sem depender de tempo de CPU do minuto. A diretriz do produto também descarta o n8n para este sistema.

## Decisão

- **Cron Triggers** como agendador único: `* * * * *` follow-up, `0 * * * *` rescue-human-mode, `0 12 * * 1-5` long-followup. O handler `scheduled()` de `custom-worker.ts` mapeia cada expressão para a sua rota.
- **Cloudflare Queue `follow-up-sends`** (binding `FOLLOW_UP_QUEUE`): o cron vira só *dispatcher*. Ele reserva os follow-ups vencidos no Postgres (`claimDueFollowUps`) e faz `sendBatch`. O *consumer* (`queue()` em `custom-worker.ts`) chama `POST /api/internal/follow-up/process` (Bearer `CRON_SECRET`) e envia pela conexão de WhatsApp da organização.
- Consumer: `max_batch_size` 10, `max_concurrency` 2, `max_retries` 3, atraso de retry de 30 s e dead-letter queue `follow-up-sends-dlq`.
- O keepalive foi removido: o follow-up consulta o banco a cada minuto, o que já mantém o projeto Supabase ativo.
- Staging (`env.staging`, Worker `prospect-pulse-54-staging`) fica **sem** crons e sem filas, para não haver dois agendadores contra o banco de produção.

## Alternativas consideradas

| Opção | Veredito |
|---|---|
| Cron Triggers + Queues (escolhida) | Nativo do host, sem serviço extra, retries + DLQ + controle de vazão, trava no Postgres evita duplicidade. |
| Só Cron Triggers (laço no handler) | Funciona em volume baixo, mas sem retry/DLQ e um lote grande compete com o limite de CPU do minuto. |
| Supabase `pg_cron` + `pg_net` chamando o app | Viável e grátis, mas põe segredo do cron no banco e acopla agendamento ao plano Free do Supabase (pausa por inatividade, sem backup). Fica como plano B. |
| Cloudflare Workflows (`step.sleep` por lead) | Melhor modelo para **cadências da jornada do lead** (enviar → esperar → checar resposta → próximo passo, cancelável quando o lead responde). Reservado para o plano de features; agora seria reescrever regra que já funciona. |
| Manter n8n | Descartado pela diretriz do produto. |

## Consequências

- Positivas: retry e DLQ sem código próprio; vazão controlada por `max_concurrency`; um só agendador, dentro do Worker; sem serviço externo para operar.
- Custo: depende do plano Workers Paid para Queues em produção e de duas filas criadas fora do deploy (`follow-up-sends` e `follow-up-sends-dlq`, ver `docs/runbooks/cutover-cloudflare.md`, passo B2).
- Operação: a DLQ precisa ser monitorada (esperada vazia nas primeiras 48 h), assim como o backlog da fila. Entrega é *at-least-once*, então o envio reserva o follow-up no Postgres antes de enviar e o consumer revalida o lead.
- Reversão: o Supabase `pg_cron` + `pg_net` é o plano B. Cadências com espera e cancelamento por resposta do lead devem migrar para Cloudflare Workflows no plano de features.
