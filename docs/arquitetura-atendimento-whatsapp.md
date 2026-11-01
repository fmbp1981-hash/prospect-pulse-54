# Arquitetura do atendimento WhatsApp (fluxo nativo)

Mapa do fluxo que recebe uma mensagem de WhatsApp, identifica a organização e o lead, executa o agente de IA e responde. Todo o fluxo roda dentro da aplicação Next.js — sem orquestrador externo.

## Entrada: webhook

`POST /api/webhooks/evolution` — `app/api/webhooks/evolution/route.ts`

1. O provider WhatsApp (`src/lib/integrations/whatsapp/whatsapp.factory.ts`) normaliza o payload (Evolution API v2 ou Meta Cloud API).
2. Ignora eventos de status (ack/entrega), mensagens de grupo e tipos desconhecidos.
3. `fromMe = true`: trata como possível intervenção do consultor (salva no histórico se o lead estiver em modo humano) e não aciona o agente — `src/lib/guards/anti-loop.guard.ts`.
4. Responde `200` imediatamente e mantém a execução viva com `waitUntil` chamando `runLeadConversationWorkflow(normalized)`.

`GET /api/webhooks/evolution` atende a verificação de webhook da Meta Cloud API.

## Orquestrador: `runLeadConversationWorkflow`

`src/lib/workflows/lead-conversation.workflow.ts` — cada passo tem timeout próprio e falha de forma isolada (log com `correlationId`).

| Passo | O que faz | Módulo |
|-------|-----------|--------|
| 1 | Resolve a organização pela instância WhatsApp (`user_settings.evolution_instance_name`) | `src/lib/services/tenant-resolver.service.ts` |
| 1A | Interrompe se o agente estiver desativado para a organização | `tenant-resolver.service.ts` |
| 1B | Define a chave OpenAI da organização para o restante da execução | `src/lib/ai/openai-key-context.ts` |
| 2 | Comando de finalização do consultor devolve o lead ao bot | `isFinalizationCommand()` + `leadService.returnToBot()` |
| 3 | Busca ou cria o lead orgânico (WhatsApp normalizado `+55…`) | `src/lib/services/lead.service.ts` → `src/lib/repositories/lead.repository.ts` |
| 3B | Detecta resposta automática de outro bot | inline no workflow |
| 4 | Lead em modo humano: só registra a mensagem, sem resposta do agente | `src/lib/repositories/conversation.repository.ts` |
| 5 | Processa mídia: áudio → transcrição, imagem → descrição, PDF → texto | `src/lib/handlers/message-type.handler.ts`, `src/lib/integrations/openai/whisper.service.ts`, `src/lib/integrations/openai/vision.service.ts`, `src/lib/services/pdf-analyzer.service.ts` |
| 6 | Salva a mensagem do lead | `conversation.repository.ts` |
| 7 | Monta o contexto (dados do lead + histórico) e executa o agente | `src/lib/services/agent-context-builder.service.ts`, `src/lib/ai/ai-agent.service.ts` |
| 8 | Humaniza a resposta (divide em mensagens curtas, read receipt, digitando) | `src/lib/services/message-humanizer.service.ts` |
| 9 | Envia pelo provider WhatsApp | `src/lib/integrations/evolution/messaging.client.ts` |
| 10 | Persiste a resposta do agente | `conversation.repository.ts` |

## Agente de IA

- **Prompt:** configuração ativa da organização em `agent_configs` (editável em `/api/agent/config`). Sem configuração salva, usa `DEFAULT_SYSTEM_PROMPT` (`src/lib/ai/prompts/default-system-prompt.ts`), um SDR genérico. O placeholder `{{nome_empresa}}` é preenchido com `user_settings.company_name`.
- **Base de conhecimento:** trechos relevantes de `rag_documents` são anexados ao prompt (`src/lib/ai/rag/rag.service.ts`) — oferta, ICP, critérios de qualificação e políticas de cada organização vivem ali.
- **Ferramentas:**
  - `atualizar_lead` — `src/lib/ai/tools/update-lead.tool.ts` (status, estágio, dados de qualificação; recalcula o cenário de follow-up).
  - `transferir_para_consultor` — `src/lib/ai/tools/transfer-consultant.tool.ts`: coloca o lead em modo humano e notifica o consultor no número `user_settings.consultant_whatsapp`, pela instância `user_settings.evolution_instance_name`.

## Jobs agendados

| Rota | Função | Job |
|------|--------|-----|
| `/api/cron/follow-up` | Follow-up de curto prazo (sem resposta) | `src/lib/jobs/follow-up.job.ts` |
| `/api/cron/long-followup` | Régua de longo prazo por cenário | `src/lib/jobs/long-followup.job.ts` + `src/lib/services/long-followup-rules.service.ts` |
| `/api/cron/rescue-human-mode` | Devolve ao bot leads esquecidos em modo humano | `app/api/cron/rescue-human-mode/route.ts` |
| `/api/cron/keepalive` | Mantém o projeto Supabase ativo | `app/api/cron/keepalive/route.ts` |

Disparo em massa: `POST /api/webhooks/bulk-message` → `src/lib/jobs/bulk-sender.job.ts`.

## Configuração necessária por organização

- `user_settings.evolution_instance_name` — instância WhatsApp que identifica a organização.
- `user_settings.consultant_whatsapp` — número que recebe as transferências.
- `user_settings.company_name` — nome usado no prompt padrão.
- Chave OpenAI da organização (ou `OPENAI_API_KEY` global).
- Opcional: prompt próprio em `agent_configs` e documentos em `rag_documents`.
