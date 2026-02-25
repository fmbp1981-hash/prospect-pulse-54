# CHANGELOG — Migração n8n → Implementação Nativa

## [Unreleased] — feature/native-workflow-engine-xpag

**Data:** Fevereiro 2026
**Branch:** `feature/native-workflow-engine-xpag`
**Autor:** Claude Code (Arquiteto de Migração)

### Adicionado

#### Workflow Engine Nativo
- `src/lib/workflow-engine/workflow.orchestrator.ts` — Orquestrador com retry, timeout e logs
- `src/lib/workflow-engine/workflow.context.ts` — Contexto compartilhado entre steps
- `src/lib/workflow-engine/workflow.logger.ts` — Logs estruturados com correlation ID
- `src/lib/workflow-engine/interfaces/workflow-step.interface.ts` — Interfaces TypeScript

#### Fluxo 1 — Recepção e Normalização
- `app/api/webhooks/evolution/route.ts` — Webhook principal (equivale ao node Webhook n8n)
- `src/lib/services/message-normalizer.service.ts` — Normalização de payloads Evolution API
- `src/lib/guards/anti-loop.guard.ts` — Guard anti-loop (evita loop de mensagens do bot)

#### Fluxo 2 — Gestão de Leads
- `app/api/webhooks/bulk-message/route.ts` — Endpoint de disparo em massa
- `src/lib/services/tenant-resolver.service.ts` — Resolve tenant por instância Evolution
- `src/lib/services/lead.service.ts` — Lógica de busca e criação de leads
- `src/lib/repositories/lead.repository.ts` — Acesso ao Supabase (leads_prospeccao)
- `src/lib/repositories/conversation.repository.ts` — Acesso ao Supabase (whatsapp_conversations)
- `src/lib/services/history-formatter.service.ts` — Formata histórico para o agente

#### Fluxo 3 — Processamento de Mídia
- `src/lib/integrations/evolution/media.client.ts` — Download de mídias da Evolution API
- `src/lib/integrations/openai/whisper.service.ts` — Transcrição de áudio (OpenAI Whisper)
- `src/lib/integrations/openai/vision.service.ts` — Análise de imagens (GPT-4 Vision)
- `src/lib/services/pdf-analyzer.service.ts` — Extração e resumo de PDFs
- `src/lib/handlers/message-type.handler.ts` — Strategy pattern por tipo de mídia

#### Fluxo 3B — AI Agent
- `src/lib/ai/prompts/system-prompt.v3.4.ts` — System Prompt versionado (v3.4)
- `src/lib/ai/tools/tool.interface.ts` — Interface base para tools do agente
- `src/lib/ai/tools/update-lead.tool.ts` — Tool: atualizar_lead
- `src/lib/ai/tools/transfer-consultant.tool.ts` — Tool: transferir_para_consultor
- `src/lib/ai/ai-agent.service.ts` — Serviço principal GPT-4.1 com tool calling
- `src/lib/services/message-humanizer.service.ts` — Humanizador (GPT-4.1-mini, ≤240 chars)
- `src/lib/services/agent-context-builder.service.ts` — Builder de contexto para o agente
- `src/lib/integrations/evolution/messaging.client.ts` — Envio de mensagens via Evolution API
- `src/lib/workflows/xpag-lead-handler.workflow.ts` — **Orquestrador principal** (substitui o workflow n8n)

#### Fluxo 4 — Follow-up Automático
- `src/lib/jobs/follow-up.job.ts` — Job de follow-up (10min, 1h, 24h)
- `app/api/cron/follow-up/route.ts` — Endpoint cron (Vercel Cron, 1 min)

#### Fluxo 5 — Disparo em Massa
- `src/lib/jobs/bulk-sender.job.ts` — Worker com rate limiting (10s entre msgs)

#### Fluxo Auxiliar — Keep-Alive
- `src/lib/jobs/supabase-keepalive.job.ts` — Mantém Supabase ativo
- `app/api/cron/keepalive/route.ts` — Endpoint cron (a cada 5 dias)

#### Testes
- `tests/unit/message-normalizer.spec.ts` — 7 casos unitários
- `tests/unit/lead-service.spec.ts` — 3 casos unitários
- `tests/unit/humanizer.spec.ts` — 4 casos unitários
- `tests/unit/anti-loop.spec.ts` — 4 casos unitários
- `tests/parity/n8n-vs-native.spec.ts` — 10 casos de paridade
- `tests/load/concurrent-messages.spec.ts` — 3 casos de carga

#### Configuração
- `feature-flags.json` — Feature flags para rollout gradual
- `docs/migracao-n8n.md` — Mapeamento completo node → módulo

### Dependências do n8n eliminadas
- Todos os 5 fluxos do workflow `Xpag_Buscar_ou_Criar_Lead` (v3.4) foram portados
- 37+ nodes n8n substituídos por módulos TypeScript nativos
- Sem dependência de orquestração externa em produção
