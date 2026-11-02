# ADR 0001 — Agendamento com Cron Triggers + Queues

- **Status:** aceito
- **Data:** 2026-11-01
- **Contexto de origem:** Sprint 3, migração Vercel → Cloudflare (`docs/superpowers/plans/2026-10-30-ajuste-sistema-e-migracao-cloudflare.md`)

## Contexto

Os jobs periódicos do sistema (follow-up, rescue-human-mode, long-followup) rodavam por Vercel Cron e por 3 workflows do n8n. Na Vercel, `waitUntil` e o laço com `setTimeout` entre envios seguravam a função aberta até o fim do lote. Ao migrar para Cloudflare Workers, o agendador precisa ser nativo do host, ter retry e dead-letter para envios que falham, e controlar a vazão sem depender de tempo de CPU do minuto. A diretriz do produto também descarta o n8n para este sistema.

## Decisão

- **Cron Triggers** como agendador único: `* * * * *` follow-up, `0 * * * *` rescue-human-mode, `0 12 * * 1-5` long-followup. O handler `scheduled()` de `custom-worker.ts` mapeia cada expressão para a sua rota.
- **Cloudflare Queue `follow-up-sends`** (binding `FOLLOW_UP_QUEUE`): o cron vira só *dispatcher*. Ele reserva os follow-ups vencidos no Postgres (`claimDueFollowUps`) e faz `sendBatch`. O *consumer* (`queue()` em `custom-worker.ts`) chama `POST /api/internal/follow-up/process` (Bearer `INTERNAL_QUEUE_SECRET`, segredo dedicado, e host `internal`, que não existe fora do Worker) e envia pela conexão de WhatsApp da organização.
- **Modo explícito** `FOLLOW_UP_MODE` (var do `wrangler.jsonc`, lida em `src/lib/runtime/bindings.ts`): `queue` em produção; `disabled` em staging; fora do Cloudflare (Vercel, testes) o modo é `direct` (job completo no request). Em `queue` sem o binding da fila o cron responde `503 QUEUE_NOT_CONFIGURED` e não envia nada: a falta da fila nunca vira envio direto silencioso.
- Contrato único entre cron, fila, consumer e rota em `src/lib/jobs/follow-up.contract.ts` (tipos e schemas zod, sem dependência de servidor).
- Consumer: `max_batch_size` 10, `max_concurrency` 2, `max_retries` 3 e dead-letter queue `follow-up-sends-dlq`. O atraso de retry de 30 s fica no código (`RETRY_DELAY_SECONDS` em `src/worker/follow-up-consumer.ts`).
- O keepalive foi removido: o follow-up consulta o banco a cada minuto, o que já mantém o projeto Supabase ativo.
- Staging (`env.staging`, Worker `prospect-pulse-54-staging`) fica **sem** crons, sem filas, com `FOLLOW_UP_MODE=disabled` e sem `CRON_SECRET`/`INTERNAL_QUEUE_SECRET`, para não haver dois agendadores contra o banco de produção.

## Entrega, falhas e vazão

A fila entrega *at-least-once*: a mesma mensagem pode chegar mais de uma vez, e uma entrega pode falhar depois de o WhatsApp ter saído. A regra é **nunca duplicar um WhatsApp; perder um follow-up é preferível a enviar dois** (risco de qualidade e bloqueio do número).

- **Revalidação e reserva.** O consumer relê o lead (só as colunas do job), confere `follow_up_count`, modo `bot`, status em conversa e a janela de inatividade, e **reserva** o envio no Postgres antes de enviar: `UPDATE` condicional que avança o contador só se o lead continua exatamente como foi lido (mesmo contador, `modo_atendimento = 'bot'`, `status_msg_wa` em conversa e a mesma `data_ultima_interacao`). Reserva negada = outra entrega já enviou ou o lead mudou → `skipped`.
- **Falha clara do provedor** (`success === false`): desfaz a reserva e devolve `retry` (atraso de 30 s).
- **Falha ambígua** (`sendText` lança: timeout, rede): a mensagem pode ter saído. **Mantém a reserva** e devolve `skipped`, com log `whatsapp_send_ambiguous` (só `leadId` e `organization_id`). Custo aceito: pode perder um follow-up por falha ambígua.
- **Última entrega** (`attempts > FOLLOW_UP_MAX_RETRIES`, ou seja, a 4ª com `max_retries` 3) que seria `retry`: libera o claim com backoff de 15 min e devolve `skipped`; o consumer dá *ack* e o cron reivindica o lead de novo depois. A DLQ só recebe falhas de transporte (rota interna fora do ar ou resposta inválida).
- **Vazão.** Dentro de uma chamada da rota interna, os envios são sequenciais com **1000 ms** entre eles (só depois de uma tentativa real de envio), o mesmo intervalo do job antigo (`FOLLOW_UP_SEND_DELAY_MS`). Entre chamadas, a vazão é limitada por `max_batch_size` 10 e `max_concurrency` 2.
- **Logs** só com `leadId`, `organization_id` e o nome/código do erro; nunca a mensagem do provedor ou do banco (pode conter telefone ou payload).

## DLQ

- Inspecionar só pelos ids (`leadId`, `organization_id`) e pelo código de erro dos Workers Logs, sem abrir o lead nem a conversa.
- Registrar a causa (no PR/issue do incidente ou no ledger do sprint).
- Purgar (`wrangler queues`) com **[auth]** do usuário em até **7 dias** após a inspeção; mensagem da DLQ não é reprocessada à mão: o lead volta pelo cron quando o claim expira.
- **Confirmar na documentação atual do Cloudflare Queues** o período de retenção de mensagens (e se é configurável no plano Paid) antes do corte: a DLQ não deve guardar ids de leads além do necessário.

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
- Operação: a DLQ precisa ser monitorada (esperada vazia nas primeiras 48 h), assim como o backlog da fila. Entrega é *at-least-once*: ver "Entrega, falhas e vazão" (reserva antes do envio, falha ambígua sem reenvio).
- Reversão: o Supabase `pg_cron` + `pg_net` é o plano B. Cadências com espera e cancelamento por resposta do lead devem migrar para Cloudflare Workflows no plano de features.
