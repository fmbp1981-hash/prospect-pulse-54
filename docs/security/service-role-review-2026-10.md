# Revisão de isolamento multi-tenant — usos de service_role (Task 7, Sprint 1)

Data: 2026-10-30 · Revisor: multi-tenant-reviewer (somente leitura) · Base: branch `claude/sprint1-seguranca` · Escopo: 50 arquivos que usam `SUPABASE_SERVICE_ROLE_KEY`.
Contagem: **Critical 2 · High 6 · Medium 7 · Low 5 · Info 3** — **Security Gate: FAIL**.

| ID | Sev. | Status | Resumo | Onde | Tratamento |
|---|---|---|---|---|---|
| F-01 | Critical | CONFIRMED (repo + produção, controller) | Usuário (até pendente) faz PATCH em `user_settings` e se dá `role='admin'`/`pending_setup=false` → rotas `/api/admin/*` (service_role) e `is_admin()` | `supabase/migrations/20250119_user_roles.sql:135-140`; `app/api/admin/*` | Task 6b |
| F-02 | Critical | CONFIRMED | `POST /api/webhooks/evolution` público, sem segredo; tenant vem do campo `instance` do payload → anônimo cria leads/conversas na Org B, gasta OpenAI e envia WhatsApp pelo número da Org B | `app/api/webhooks/evolution/route.ts:90-151`, `src/lib/services/tenant-resolver.service.ts:24-32`, `lib/supabase/middleware.ts` (prefixo público) | Task 8 |
| F-03 | High | CONFIRMED | `role='admin'` mistura admin de org e de plataforma → admin de empresa usa `/api/admin/*` contra todos os tenants | `app/api/admin/{list,approve,reject,delete}-user`, `RoleManagement.tsx`, middleware `/integrations` | Task 6b (banco) + Task 9 (rotas) |
| F-04 | High | CONFIRMED saída / PLAUSIBLE entrada | `evolution_instance_name` livre e sem unicidade → envia pela instância de outra org com a chave global; entrada pode cair no tenant errado | `settings/page.tsx:345`, `inbox/send-message`, `inbox/takeover`, `tenant-resolver` | Task 9 |
| F-05 | High | CONFIRMED | `deleteDocument` apaga `rag_document_chunks` só por `document_id` | `src/lib/ai/rag/rag.service.ts:218-232` | Task 9 |
| F-06 | High | CONFIRMED | PATCH de campaigns/clientes grava body cru com service_role → injeta `organization_id` de outra org (mass assignment) | `app/api/campaigns/[id]/route.ts:78-90`, `app/api/clientes/[id]/route.ts:67-82` | Task 9 |
| F-07 | High | PLAUSIBLE | `promoteToLead` lê lead por `converted_lead_id` sem tenant e devolve a linha inteira | `src/lib/services/contact-promotion.service.ts:54-61` | Task 9 |
| F-08 | High | PLAUSIBLE (se deployada) | Edge Function legada `whatsapp-webhook` sem tenant/segredo; busca lead por telefone em todos os tenants; filtro `.or()` interpolado | `supabase/functions/whatsapp-webhook/index.ts` | Task 9 (remover do repo) + usuário (`supabase functions delete whatsapp-webhook`) |
| F-09 | Medium | — | `fix-admin` com service_role sem checar papel | `app/api/admin/fix-admin` | **Já removida na Task 6 (b867ea3)** |
| F-10 | Medium | PLAUSIBLE | `rescue-human-mode` aceita `Bearer undefined` se `CRON_SECRET` faltar | `app/api/cron/rescue-human-mode/route.ts:28-32` | Task 9 (helper de cron para todos os `/api/cron/*`) |
| F-11 | Medium | PLAUSIBLE | long-followup usa `instance_name` gravado na linha do agendamento; bug `findByWhatsApp(lead_id)` | `src/lib/jobs/long-followup.job.ts:124,155` | Task 9 |
| F-12 | Medium | PLAUSIBLE | fallback para `EVOLUTION_INSTANCE_NAME` global no inbox | `inbox/send-message:63-65`, `inbox/takeover:83-85` | Task 9 |
| F-13 | Medium | CONFIRMED | rotas com service_role ignoram papel `visualizador` | campaigns, clientes, inbox, leads, email/send-bulk, webhook-keys | Task 10 (Sprint 1) |
| F-14 | Medium | CONFIRMED | `list-users` devolve `evolution_api_key` de terceiros | `app/api/admin/list-users/route.ts:47-49` | Task 9 |
| F-15 | Medium | — | reads/updates por id sem tenant explícito (defesa em profundidade) | `lead.repository.ts`, `conversation.repository.ts`, inbox | Sprint 4 |
| F-16 | Low/Med | PLAUSIBLE | RAG ingest aceita `agentConfigId` de outro tenant | `app/api/agent/rag/route.ts:96-110` | Task 9 |
| F-17 | Low | — | `init-user-settings` admin por e-mail | — | Resolvido na rodada final do Sprint 1: tratamento por e-mail removido; admin da plataforma só via `public.platform_admins` |
| F-18 | Low | — | CRON_SECRET em query string; comparação não constante | `rag-ingest`, `register-templates`, `test-email` | Task 9 (helper de cron) |
| F-19 | Low | — | `q` interpolado em `.or()` | `app/api/clientes/route.ts:39-41` | Sprint 4 |
| F-20 | Low | — | `generate-template-ai` só checa presença do header | `supabase/functions/generate-template-ai/index.ts` | Sprint 4 |

Detalhes completos (caminho de ataque, por que RLS não protege, correção mínima, teste de regressão) estão no ledger do SDD (`.superpowers/sdd/2026-10-30-ajuste-sistema-e-migracao-cloudflare/task-7-findings.md`).

Info: linhas inseridas com service_role ficam com `organization_id` NULL (trigger `set_organization_id_from_member` depende de `auth.uid()`) — quebra o compartilhamento por organização (problema funcional, Sprint 2b/4).
