# Migração n8n → Implementação Nativa

## Mapeamento Completo: Node n8n → Módulo Nativo

| Node n8n | Tipo | Módulo Nativo | Caminho |
|----------|------|---------------|---------|
| Webhook (POST /Xpag_agente_response) | webhook | API Route | `app/api/webhooks/evolution/route.ts` |
| NORMALIZAR DADOS | code (JS) | MessageNormalizer | `src/lib/services/message-normalizer.service.ts` |
| AntiLoop (fromMe) | if | AntiLoopGuard | `src/lib/guards/anti-loop.guard.ts` |
| HTTP Request (get_user_by_evolution_instance) | httpRequest | TenantResolver | `src/lib/services/tenant-resolver.service.ts` |
| Set User Context | set | TenantContext (inline) | `src/lib/workflows/xpag-lead-handler.workflow.ts` |
| If Finalizado? | if | isFinalizationCommand() | `src/lib/services/tenant-resolver.service.ts` |
| Update a row (modo=bot) | supabase | leadService.returnToBot() | `src/lib/services/lead.service.ts` |
| Encontrar_lead (GET) | supabase | leadRepository.findByWhatsApp() | `src/lib/repositories/lead.repository.ts` |
| Existe? | if | leadService.findOrCreate() | `src/lib/services/lead.service.ts` |
| Criar_lead (INSERT) | supabase | leadRepository.create() | `src/lib/repositories/lead.repository.ts` |
| Buscar Historico Conversa | supabase | conversationRepository.getHistory() | `src/lib/repositories/conversation.repository.ts` |
| Formatar Histórico_conversa | code (JS) | formatConversationHistory() | `src/lib/services/history-formatter.service.ts` |
| MessageType (Switch) | switch | processMessageByType() | `src/lib/handlers/message-type.handler.ts` |
| getAudio / getImage / getImage1 | httpRequest | evolutionMediaClient | `src/lib/integrations/evolution/media.client.ts` |
| Convert to File / Convert to File1 | convertToFile | Buffer.from(base64) | inline |
| Transcrever Áudio (Whisper) | openAi | transcribeAudio() | `src/lib/integrations/openai/whisper.service.ts` |
| Analise Imagem (GPT-4 Vision) | agent | analyzeImage() | `src/lib/integrations/openai/vision.service.ts` |
| Extract from File + Analise Doc | extractFromFile + agent | analyzePdf() | `src/lib/services/pdf-analyzer.service.ts` |
| Ajusta / [1]Ajusta | code | .replace(/[*#\`]/g, '').trim() | inline |
| [1] Merge (5 entradas) | merge | Lógica no message-type.handler | — |
| Edit Fields (Prepara Contexto) | set | buildAgentContext() | `src/lib/services/agent-context-builder.service.ts` |
| Salvar Conversa Lead | supabase | conversationRepository.saveLeadMessage() | `src/lib/repositories/conversation.repository.ts` |
| AI Agent (GPT-4.1 + Tools) | agent | executeAIAgent() | `src/lib/ai/ai-agent.service.ts` |
| DB-01 (Redis Memory) | memoryRedisChat | Sistema de histórico Supabase | `src/lib/repositories/conversation.repository.ts` |
| atualizar_lead (Tool) | tool | updateLeadTool | `src/lib/ai/tools/update-lead.tool.ts` |
| transferir_para_consultor (Tool) | tool | transferConsultantTool | `src/lib/ai/tools/transfer-consultant.tool.ts` |
| Humanizador (GPT-4.1-mini) | chainLlm | humanizeResponse() | `src/lib/services/message-humanizer.service.ts` |
| Split Out + Loop + Wait_Msg (3s) | splitOut + loop + wait | sendMessageSequence() | `src/lib/integrations/evolution/messaging.client.ts` |
| Enviar texto1 (Evolution API) | evolutionApi | sendWhatsAppText() | `src/lib/integrations/evolution/messaging.client.ts` |
| Atualizar Conversa Agente | supabase | conversationRepository.saveAgentResponse() | `src/lib/repositories/conversation.repository.ts` |
| Schedule Trigger (1 min) | schedule | Cron Route | `app/api/cron/follow-up/route.ts` |
| Buscar Leads Follow-up (JS) | code | leadRepository.findLeadsForFollowUp() | `src/lib/repositories/lead.repository.ts` |
| Tem WhatsApp? (If) | if | validação inline | `src/lib/jobs/follow-up.job.ts` |
| Enviar Follow-up | evolutionApi | sendWhatsAppText() | reutilizado |
| Atualizar Lead (follow_up_count) | supabase | leadRepository.incrementFollowUpCount() | `src/lib/repositories/lead.repository.ts` |
| Webhook2 (msg_evolution) | webhook | API Route | `app/api/webhooks/bulk-message/route.ts` |
| Loop Over Items + Wait (10s) | loop + wait | bulkSender.enqueue() | `src/lib/jobs/bulk-sender.job.ts` |
| 5 Dias (Schedule) | schedule | Cron Route | `app/api/cron/keepalive/route.ts` |
| Supabase Instancia Ativa | supabase | leadRepository.keepAlive() | `src/lib/repositories/lead.repository.ts` |

## Rollout em 4 Fases

```
Fase 1 — Shadow Mode (1 semana)
  feature-flags.json: ENABLE_SHADOW_MODE=true, ENABLE_NATIVE_WORKFLOW=false
  Rodar n8n e nativo em paralelo
  Critério: < 1% discrepância

Fase 2 — Canary (1 semana)
  NATIVE_WORKFLOW_TENANTS=["xpag-test"]
  10% do tráfego
  Critério: erro < 0.1%

Fase 3 — Rollout Gradual (2 semanas)
  25% → 50% → 75% → 100%

Fase 4 — Corte Definitivo
  Desligar workflow n8n
  Manter n8n em standby 30 dias
```

## Variáveis de Ambiente Necessárias

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Evolution API
EVOLUTION_API_URL=https://evolution.seudominio.com
EVOLUTION_API_KEY=sua-chave-api
EVOLUTION_DEFAULT_INSTANCE=Xpag Atendimento

# OpenAI
OPENAI_API_KEY=sk-...

# Configurações XPAG
XPAG_CONSULTANT_WHATSAPP=5581999990000
XPAG_CONSULTANT_INSTANCE=Xpag Atendimento

# Segurança Cron
CRON_SECRET=seu-segredo-cron
```
