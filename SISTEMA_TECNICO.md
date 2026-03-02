# SISTEMA_TECNICO.md — LeadFinder Pro / XPAG Brasil
> **Arquivo vivo.** Atualizar a cada mudança significativa de código, arquitetura ou infraestrutura.
> Última atualização: 2026-02-28

---

## ÍNDICE

0. [PRD — Documento de Requisitos do Produto](#0-prd--documento-de-requisitos-do-produto)
1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Estrutura de Diretórios](#3-estrutura-de-diretórios)
4. [Arquitetura Geral](#4-arquitetura-geral)
5. [Banco de Dados (Supabase)](#5-banco-de-dados-supabase)
6. [API Routes](#6-api-routes)
7. [Serviços e Componentes Core](#7-serviços-e-componentes-core)
8. [Fluxos de Dados](#8-fluxos-de-dados)
9. [Sistema de Roles e Permissões (RBAC)](#9-sistema-de-roles-e-permissões-rbac)
10. [Agente de IA — XPAG](#10-agente-de-ia--xpag)
11. [Integrações WhatsApp](#11-integrações-whatsapp)
12. [Variáveis de Ambiente](#12-variáveis-de-ambiente)
13. [Deploy e Infraestrutura](#13-deploy-e-infraestrutura)
14. [Histórico de Mudanças](#14-histórico-de-mudanças)

---

## 0. PRD — Documento de Requisitos do Produto

> **Versão:** 1.0 — 2026-02-25
> **Produto:** LeadFinder Pro / XPAG Brasil (nome interno: `prospect-pulse-54`)
> **Responsável:** Felipe Maranhão

---

### 0.1 Contexto e Problema

A **XPAG Brasil** é uma empresa de meios de pagamento e soluções financeiras B2B que precisava automatizar e escalar seu processo comercial. O problema central era triplo:

1. **Prospecção manual e ineficiente:** a equipe buscava potenciais clientes manualmente, sem padronização ou rastreabilidade.
2. **Atendimento via WhatsApp não escalável:** o time respondia leads individualmente, sem qualificação automática, o que gerava perda de oportunidades fora do horário comercial.
3. **Dependência frágil do n8n:** a automação existente era um workflow de 52 nós no n8n Cloud, difícil de manter, sem tipagem, sem resiliência a falhas e sujeito a downtime externo.

**O objetivo** era construir um sistema proprietário que resolvesse os três pontos: prospectar, atender e qualificar leads de forma autônoma, com visibilidade total sobre o pipeline.

---

### 0.2 Objetivos do Produto

| # | Objetivo | Critério de Sucesso |
|---|----------|---------------------|
| 1 | Prospectar empresas-alvo automaticamente | Busca por nicho + cidade via Google Places → leads salvos em < 30s |
| 2 | Atender leads 24/7 via WhatsApp com IA | Tempo médio de primeira resposta < 30s após recebimento do webhook |
| 3 | Qualificar leads por faturamento | Agente pergunta e classifica: Follow-up (< R$50k) ou Qualificado (≥ R$50k) |
| 4 | Transferir leads qualificados ao consultor | Notificação automática no WhatsApp do consultor com dados completos do lead |
| 5 | Gerenciar pipeline em Kanban visual | Kanban com drag-and-drop e atualização realtime |
| 6 | Disparar follow-ups automáticos | 3 estágios curto prazo + 5 cenários longo prazo sem intervenção humana |
| 7 | Ser multi-tenant | Cada empresa/usuário opera com seus próprios dados e configurações isolados |
| 8 | Eliminar dependência do n8n | Toda a lógica em TypeScript nativo, sem SaaS de automação externo |

---

### 0.3 Público-Alvo e Stakeholders

| Papel | Descrição | Acesso no Sistema |
|-------|-----------|-------------------|
| **Administrador** (Felipe Maranhão) | Dono do sistema. Acesso total. Configura integrações e roles. | `admin` |
| **Operador** | Colaborador da equipe comercial. Cria e edita leads, configura o agente. | `operador` |
| **Visualizador** | Acompanha métricas. Somente leitura e exportação. | `visualizador` |
| **Lead (externo)** | Empresa prospectada ou que entrou em contato via WhatsApp. | — (não acessa o sistema) |
| **Consultor** (Felipe) | Recebe notificações de leads qualificados via WhatsApp. | — (notificado pelo sistema) |

---

### 0.4 Funcionalidades do Produto

#### F1 — Prospecção Automática
- **Descrição:** O usuário informa um nicho (ex: "clínicas odontológicas"), uma cidade e a quantidade de leads desejados. O sistema busca empresas via Google Places API, enriquece os dados com OpenAI e salva os leads no banco.
- **Entradas:** nicho, localização (cidade/estado), quantidade (até 60)
- **Saídas:** Leads salvos em `leads_prospeccao` com nome, WhatsApp, website, Instagram, endereço e mensagem personalizada gerada por IA
- **Tela:** Página inicial `/` → componente `ProspectionForm`
- **Histórico:** Cada prospecção é salva em `search_history`

#### F2 — Gestão de Leads (Tabela)
- **Descrição:** Tabela completa de todos os leads com filtros, busca, ordenação e ações individuais.
- **Ações disponíveis:** Editar, Excluir, Enviar WhatsApp manual, Ver histórico de conversa
- **Permissões:** `canCreate`, `canUpdate`, `canDelete`, `canExport`, `canSendWhatsApp`
- **Export:** CSV (papaparse) e Excel (xlsx)
- **Atualização:** Supabase Realtime — a tabela atualiza automaticamente quando o agente IA modifica um lead
- **Tela:** `/leads`

#### F3 — Kanban Pipeline
- **Descrição:** Visualização do funil de vendas em colunas (Novo, Contato Inicial, Qualificação, Follow-up, Transferido para Consultor, Fechado Ganho, Fechado Perdido).
- **Interação:** Drag-and-drop com dnd-kit para mover leads entre estágios
- **Atualização:** Supabase Realtime — colunas atualizam quando o agente muda o `estagio_pipeline` de um lead
- **Tela:** `/kanban`

#### F4 — Agente de IA (WhatsApp)
- **Descrição:** Agente autônomo que responde mensagens WhatsApp de leads 24/7, seguindo um fluxo de qualificação de 5 etapas.
- **Trigger:** Webhook inbound de Evolution API ou Meta Cloud API
- **Fluxo do agente:**
  1. Saudação personalizada (hora do dia)
  2. Confirmação do nome e empresa do lead
  3. Pergunta sobre uso de meios de pagamento
  4. Qualificação por faturamento (acima/abaixo de R$50k/mês)
  5. Transferência ao consultor (se qualificado) ou follow-up (se abaixo do mínimo)
- **Mídia:** Processa áudios (Whisper), imagens (GPT-4 Vision) e documentos (PDF extractor) antes de chamar o agente
- **Tool calling:** `atualizar_lead` (atualiza campos no banco) e `transferir_para_consultor` (notifica consultor + muda modo para humano)
- **Modo humano:** Quando um lead é transferido, o bot para de responder. A conversa continua somente com o consultor humano.

#### F5 — Follow-up Automático (Curto Prazo)
- **Descrição:** Leads que não respondem recebem mensagens de follow-up automáticas em 3 estágios.
- **Estágios:**
  - Estágio 1: 10 minutos sem resposta → primeira mensagem de follow-up
  - Estágio 2: 1 hora sem resposta → segunda mensagem
  - Estágio 3: 24 horas sem resposta → terceira mensagem + marca como `Follow-up`
- **Execução:** Cron Vercel a cada minuto (`/api/cron/follow-up`)

#### F6 — Follow-up de Longo Prazo
- **Descrição:** Sequências personalizadas para leads em cenários específicos, executadas ao longo de dias/semanas/meses.
- **Cenários disponíveis:**
  - `low_revenue` — Faturamento abaixo do mínimo (re-engajar quando crescer)
  - `no_response_long` — Sem resposta há mais de 3 dias
  - `qualified_not_closed` — Qualificado mas não fechou
  - `transferred_no_contact` — Transferido mas consultor não contatou
  - `lost_reactivation` — Lead marcado como perdido (reativação)
- **Execução:** Cron Vercel diário às 9h BRT (`/api/cron/long-followup`)

#### F7 — Disparo em Massa (Bulk WhatsApp)
- **Descrição:** Envio em lote de mensagens WhatsApp para múltiplos leads com delay configurável entre envios.
- **Trigger:** `POST /api/webhooks/bulk-message`
- **Controle:** `delayMs` configurável, retorna `jobId` para rastreamento

#### F8 — Dashboard Analítico
- **Descrição:** Métricas de performance do pipeline com gráficos.
- **Métricas:** Total de leads, leads qualificados, taxa de conversão, distribuição por estágio, atividade recente
- **Tela:** `/dashboard`

#### F9 — Configuração do Agente (por Tenant)
- **Descrição:** Cada empresa pode personalizar o comportamento do agente de IA.
- **Configuráveis:**
  - System Prompt completo (editável via textarea)
  - Modelo OpenAI (gpt-4.1, gpt-4o-mini, etc.)
  - Temperatura (0 a 2)
  - Máximo de iterações (1 a 10)
  - Base de conhecimento RAG (upload de documentos)
  - WhatsApp do consultor (número para notificações)
  - Instância Evolution API do agente
- **Versionamento:** Múltiplos prompts salvos; apenas o `is_active=true` é usado
- **Tela:** `/settings` → card "Agente de Atendimento"

#### F10 — Gestão de Integrações e Audit Logs
- **Descrição:** Painel de status das integrações ativas e histórico de ações críticas.
- **Integrações exibidas:** WhatsApp (Evolution ou Meta), Supabase
- **Audit Logs:** Registra `EXPORT_LEADS`, `WHATSAPP_DISPATCH`, `START_PROSPECTION`, `BULK_DELETE_LEADS`
- **Acesso:** Somente admins
- **Tela:** `/integrations`

#### F11 — Multi-tenancy e RBAC
- **Descrição:** Cada usuário opera em namespace isolado. Roles controlam o que cada um pode fazer.
- **Isolamento:** RLS no PostgreSQL por `user_id`, configurações por `user_id` em `user_settings`
- **Roles:** `admin`, `operador`, `visualizador` — com matriz de permissões granular

---

### 0.5 Requisitos Não-Funcionais

| Requisito | Especificação |
|-----------|--------------|
| **Latência de resposta (webhook)** | HTTP 200 em < 100ms (fire-and-forget); processamento assíncrono |
| **Latência do agente IA** | Resposta ao lead em < 10s (inclui OpenAI + tool calling) |
| **Disponibilidade** | Vercel serverless (SLA implícito ~99.9%) |
| **Escalabilidade** | Stateless — cada invocação é independente. PostgreSQL escala via Supabase |
| **Segurança** | RLS em todas as tabelas, auth via Supabase (JWT), CRON_SECRET para cron jobs |
| **Resiliência** | Circuit breaker + retry (2 tentativas, backoff 1.5s) em chamadas OpenAI |
| **Multi-tenancy** | Isolamento completo por `user_id` — sem vazamento de dados entre tenants |
| **Observabilidade** | `WorkflowLogger` estruturado em todos os 10 passos do workflow; audit logs no banco |

---

### 0.6 Como o Sistema Foi Construído

#### Fase 1 — Protótipo com n8n (2024 – 2025-Q3)

O sistema nasceu como um workflow n8n com 52 nós conectados via interface visual. Funcionava, mas apresentava limitações críticas:

- **Sem tipagem:** erros só apareciam em runtime, muitas vezes silenciosamente
- **Sem controle de fluxo real:** o n8n não permite circuit breakers, timeouts por etapa ou retries configuráveis por lógica
- **Ponto único de falha:** se o n8n cloud ficasse fora, toda a operação parava
- **Multi-tenancy improvisado:** variáveis de ambiente fixas, sem suporte real a múltiplos tenants
- **Custo e dependência:** n8n Cloud tem custo crescente e limites de execução

#### Fase 2 — Frontend LeadFinder Pro (2025-Q2)

Paralelamente ao n8n, o frontend foi construído em Next.js 14 + shadcn/ui + Supabase como interface de CRM:
- Prospecção via Google Places
- Kanban e tabela de leads
- Dashboard analítico
- Configurações de integração WhatsApp
- Sistema de roles (RBAC)

O backend de atendimento ainda era o n8n. O frontend apenas lia/escrevia no Supabase.

#### Fase 3 — Migração n8n → Sistema Nativo (2025-Q4 / `v2.0.0`)

A decisão de migrar foi tomada após o n8n apresentar downtime e a lógica crescer além do que a interface visual permitia gerenciar com segurança.

**Estratégia de migração:**
1. **Manter o contrato de entrada:** o webhook `/api/webhooks/evolution` recebe o mesmo payload que o n8n recebia
2. **Recriar a lógica em TypeScript puro:** cada nó do n8n virou uma classe/serviço
3. **Adicionar o que o n8n não permitia:** circuit breakers, retries, timeouts por etapa, multi-tenancy real, tipagem end-to-end
4. **Zero downtime:** durante a migração, o n8n permaneceu ativo; a transição foi feita trocando a URL do webhook no painel do Evolution

**Componentes criados na migração:**
```
XpagLeadHandlerWorkflow   ← orquestrador dos 10 passos (substitui os 52 nós)
AIAgentService            ← loop de tool calling com OpenAI
WhatsAppProviderFactory   ← abstração Evolution API / Meta Cloud API
MessageTypeHandler        ← roteamento por tipo de mídia
MessageHumanizerService   ← split de respostas longas
TenantResolverService     ← multi-tenancy por instância
AntiLoopGuard             ← evita loop de mensagens fromMe
FollowUpJob               ← substituiu o cron do n8n (curto prazo)
LongFollowUpJob           ← substituiu regras avançadas do n8n (longo prazo)
LeadRepository            ← abstração de acesso ao banco
ConversationRepository    ← histórico persistido
AgentConfigService        ← versionamento de prompts por tenant
RAGService / Embeddings   ← base de conhecimento semântica
```

#### Fase 4 — Refinamentos (2026-02)

Com o sistema nativo em produção em `alpha.dualite.dev`, foram feitas melhorias incrementais:

- **System Prompt v3.5:** reescrito para o contexto nativo (removidas tools obsoletas do n8n, adicionada transferência imediata ao pedido do lead)
- **Consultor WhatsApp por tenant:** antes fixado em variável de ambiente; agora configurável por usuário em `user_settings`
- **Operador acessa configurações do agente:** antes restrito ao admin; agora `operador` também pode configurar prompt e RAG
- **Realtime sync:** Supabase Realtime nas páginas Kanban e Leads — UI atualiza automaticamente quando o agente muda um lead
- **Tabela `audit_logs` criada:** estava ausente, causando erro silencioso na página de Integrações

---

### 0.7 Decisões de Produto e Trade-offs

| Decisão | Alternativa Considerada | Motivo da Escolha |
|---------|------------------------|-------------------|
| Next.js App Router | Express / Fastify separado | Unifica frontend e backend em um único deploy. Serverless by default. |
| Supabase | PlanetScale, Neon, Firebase | RLS nativo, Auth embutido, Realtime, Storage. Ecossistema completo. |
| Evolution API | Twilio, Z-API, WPPConnect | Maior controle sobre instâncias. Self-hosted possível. Multi-instance nativo. |
| GPT-4.1 | Claude, Gemini | Melhor custo-benefício para tool calling em português. |
| TypeScript nativo em vez de n8n | Manter n8n | Tipagem, resiliência, multi-tenancy, sem custos de SaaS de automação. |
| `strict: false` no tsconfig | `strict: true` | Velocidade de desenvolvimento. O codebase já estava maduro quando `strict` foi avaliado. |
| Fire-and-forget no webhook | Resposta síncrona | Evolution API tem timeout curto. Retornar 200 imediatamente previne reenvios. |
| Prompt v3.5 embutido no código | Prompt sempre do banco | Novos tenants têm um padrão funcional imediatamente, sem precisar configurar. |

---

### 0.8 Fora do Escopo (Out of Scope)

- **CRM completo com negociações e propostas:** o sistema é focado em prospecção e qualificação inicial. Não inclui módulo de negociação, contratos ou assinaturas.
- **Agendamento de reuniões:** o consultor recebe o lead qualificado e agenda manualmente.
- **Analytics avançado / BI:** o dashboard atual é básico. Não há integração com ferramentas de BI.
- **App mobile:** somente web responsivo.
- **Suporte a múltiplos consultores por tenant:** a transferência sempre vai para um único consultor configurado por tenant.
- **Chatbot para outros canais (Instagram DM, e-mail, telefone):** somente WhatsApp.

---

### 0.9 Métricas de Sucesso

| Métrica | Meta |
|---------|------|
| Taxa de resposta automática (leads que recebem resposta do bot em < 1min) | > 95% |
| Taxa de qualificação (leads que completam o fluxo de 5 etapas) | > 40% dos leads abordados |
| Taxa de transferência (leads qualificados transferidos ao consultor) | > 70% dos qualificados |
| Uptime do sistema de atendimento | > 99% |
| Tempo de processamento de mensagem inbound (end-to-end) | < 10s (P95) |
| Zero erros silenciosos não rastreados | audit_logs captura todas ações críticas |

---

## 1. Visão Geral do Sistema

**LeadFinder Pro** (comercialmente: **XPAG Brasil**) é um CRM de prospecção e atendimento B2B com IA nativa.

### Função Principal
- Prospectar empresas via Google Places API
- Gerenciar leads em pipeline Kanban
- Atender leads via WhatsApp de forma automatizada com agente de IA
- Qualificar e transferir leads para consultores humanos
- Fazer follow-up automático em múltiplos estágios

### Origem do Projeto
O sistema foi **migrado de um workflow n8n** (52 nós) para uma arquitetura nativa em TypeScript/Next.js. A migração preserva toda a lógica de negócio mas elimina a dependência do n8n cloud, oferecendo:
- Maior controle sobre erros e resiliência
- Multi-tenancy nativo
- Tipagem forte end-to-end
- Custos menores de infraestrutura

---

## 2. Stack Tecnológico

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | Next.js (App Router) | ^14.2.21 |
| Runtime | Node.js | 18+ (Vercel) |
| Linguagem | TypeScript | ^5.8.3 |
| Banco de Dados | Supabase (PostgreSQL 17) | @supabase/supabase-js ^2.81.1 |
| Auth SSR | @supabase/ssr | ^0.5.2 |
| UI Components | shadcn/ui + Radix UI | — |
| Estilização | Tailwind CSS | ^3.4.17 |
| Animações | Framer Motion | ^12.23.24 |
| Drag & Drop | dnd-kit | ^6.3.1 |
| IA / LLM | OpenAI SDK | (via fetch nativo) |
| Modelos IA | gpt-4.1, gpt-4o-mini, whisper-1 | — |
| WhatsApp | Evolution API / Meta Cloud API | — |
| State global | TanStack Query | ^5.83.0 |
| Forms | React Hook Form + Zod | — |
| Toasts | Sonner + react-hot-toast | — |
| Gráficos | Recharts | ^2.15.4 |
| Export | xlsx, papaparse | — |
| Deploy | Vercel | — |

---

## 3. Estrutura de Diretórios

```
prospect-pulse-54/
│
├── app/                              # Next.js App Router
│   ├── (auth)/                       # Rotas públicas
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── forgot-password/page.tsx
│   │
│   ├── (protected)/                  # Rotas autenticadas
│   │   ├── layout.tsx                # Layout com sidebar
│   │   ├── page.tsx                  # Homepage / Prospecção
│   │   ├── dashboard/page.tsx        # Dashboard analítico
│   │   ├── leads/page.tsx            # Tabela de leads
│   │   ├── kanban/page.tsx           # Kanban board
│   │   ├── settings/page.tsx         # Configurações gerais
│   │   └── integrations/page.tsx     # Status integrações + audit logs
│   │
│   ├── api/                          # API Routes (serverless)
│   │   ├── agent/
│   │   │   ├── config/route.ts       # GET/POST/PUT - gestão de prompts
│   │   │   ├── config/[id]/activate/ # PUT - ativar versão específica
│   │   │   └── rag/route.ts          # GET/POST/DELETE - base RAG
│   │   ├── cron/
│   │   │   ├── follow-up/route.ts    # Follow-up curto prazo (por minuto)
│   │   │   ├── long-followup/route.ts # Follow-up longo prazo (diário)
│   │   │   └── keepalive/route.ts    # Keep-alive Supabase (a cada 5 dias)
│   │   ├── webhooks/
│   │   │   ├── evolution/route.ts    # Webhook principal WhatsApp
│   │   │   └── bulk-message/route.ts # Disparos em massa
│   │   └── whatsapp/
│   │       └── send/route.ts         # Envio manual de mensagens
│   │
│   ├── layout.tsx                    # Root layout (providers, fonts)
│   ├── providers.tsx                 # QueryClient, ThemeProvider, Auth
│   └── globals.css
│
├── src/
│   ├── components/                   # Componentes React reutilizáveis
│   │   ├── ui/                       # shadcn/ui primitivos
│   │   ├── AppSidebar.tsx            # Sidebar principal de navegação
│   │   ├── KanbanBoard.tsx           # Board Kanban drag-and-drop
│   │   ├── LeadEditModal.tsx         # Modal de edição de lead
│   │   ├── WhatsAppDispatchModal.tsx # Modal de disparo WhatsApp
│   │   ├── WhatsAppConversationDrawer.tsx # Histórico de conversa
│   │   ├── RoleGuard.tsx             # Guard de permissão UI
│   │   ├── RoleBadge.tsx             # Badge visual do role
│   │   ├── RoleManagement.tsx        # Gestão de usuários/roles
│   │   ├── TemplateManager.tsx       # Gestão de templates
│   │   ├── ProspectionForm.tsx       # Formulário de prospecção
│   │   ├── Layout.tsx                # Layout wrapper com sidebar
│   │   └── dashboard/                # Componentes do dashboard
│   │
│   ├── contexts/
│   │   └── AuthContext.tsx           # Contexto de autenticação global
│   │
│   ├── hooks/
│   │   ├── useUserRole.ts            # Hook RBAC (role + permissões)
│   │   └── useLeadDetails.ts         # Hook detalhes do lead
│   │
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts             # Browser client (singleton)
│   │       └── types.ts              # Tipos gerados do schema
│   │
│   ├── lib/
│   │   ├── ai/                       # Sistema de IA
│   │   │   ├── agent-config.service.ts    # Gestão de configs/prompts
│   │   │   ├── ai-agent.service.ts        # Execução OpenAI + tool calling
│   │   │   ├── prompts/
│   │   │   │   └── system-prompt.v3.4.ts  # System Prompt v3.5 atual
│   │   │   ├── rag/
│   │   │   │   ├── embeddings.service.ts  # Geração de embeddings
│   │   │   │   └── rag.service.ts         # Busca semântica RAG
│   │   │   └── tools/
│   │   │       ├── tool.interface.ts      # Interface AgentTool
│   │   │       ├── update-lead.tool.ts    # Tool: atualizar_lead
│   │   │       └── transfer-consultant.tool.ts # Tool: transferir_para_consultor
│   │   │
│   │   ├── guards/
│   │   │   └── anti-loop.guard.ts    # Previne loop fromMe=true
│   │   │
│   │   ├── handlers/
│   │   │   └── message-type.handler.ts # Roteamento por tipo de mídia
│   │   │
│   │   ├── integrations/
│   │   │   ├── evolution/
│   │   │   │   ├── messaging.client.ts  # sendWhatsAppText, sendSequence
│   │   │   │   └── media.client.ts      # Download de mídia
│   │   │   ├── openai/
│   │   │   │   ├── vision.service.ts    # Análise de imagens (GPT-4V)
│   │   │   │   └── whisper.service.ts   # Transcrição de áudio
│   │   │   └── whatsapp/
│   │   │       ├── providers/
│   │   │       │   ├── evolution.provider.ts   # Provider Evolution API
│   │   │       │   └── meta-cloud.provider.ts  # Provider Meta Cloud API
│   │   │       ├── whatsapp-provider.interface.ts
│   │   │       └── whatsapp.factory.ts   # Factory singleton do provider
│   │   │
│   │   ├── jobs/
│   │   │   ├── follow-up.job.ts      # Follow-up curto prazo
│   │   │   ├── long-followup.job.ts  # Follow-up longo prazo
│   │   │   ├── bulk-sender.job.ts    # Disparos em massa
│   │   │   └── supabase-keepalive.job.ts # Keep-alive
│   │   │
│   │   ├── repositories/
│   │   │   ├── lead.repository.ts         # CRUD de leads
│   │   │   └── conversation.repository.ts # Histórico de conversas
│   │   │
│   │   ├── services/
│   │   │   ├── agent-context-builder.service.ts # Monta contexto do agente
│   │   │   ├── history-formatter.service.ts      # Formata histórico de conversa
│   │   │   ├── lead.service.ts                   # Lógica de negócio de leads
│   │   │   ├── long-followup-rules.service.ts    # Cenários de follow-up
│   │   │   ├── message-humanizer.service.ts      # Split de respostas via GPT
│   │   │   ├── message-normalizer.service.ts     # Normaliza payloads webhook
│   │   │   ├── pdf-analyzer.service.ts           # Extração de texto de PDF
│   │   │   └── tenant-resolver.service.ts        # Resolve tenant por instância
│   │   │
│   │   ├── utils/
│   │   │   └── resilience/           # Circuit breaker, retry, timeout
│   │   │
│   │   ├── workflows/
│   │   │   └── xpag-lead-handler.workflow.ts # Orquestrador principal
│   │   │
│   │   ├── workflow-engine/
│   │   │   └── workflow.logger.ts    # Logger estruturado
│   │   │
│   │   ├── supabaseCRM.ts            # Operações CRM legadas
│   │   ├── userSettings.ts           # Serviço de configurações por tenant
│   │   ├── leadAutomation.ts         # Automação de follow-up (localStorage)
│   │   ├── audit.ts                  # Logs de auditoria
│   │   ├── history.ts                # Histórico de prospecções
│   │   └── export.ts / exportLeads.ts # Export CSV/Excel
│   │
│   └── types/
│       ├── prospection.ts            # Types de Lead, ProspectionSearch
│       └── roles.ts                  # UserRole, RolePermissions, RBAC constants
│
├── lib/
│   └── supabase/
│       └── middleware.ts             # Server-side Supabase para middleware
│
├── middleware.ts                     # Next.js middleware (auth guard)
├── next.config.js                    # Config Next.js
├── vercel.json                       # Config Vercel (framework, build, crons)
├── tailwind.config.ts
├── tsconfig.json                     # strict:false, noImplicitAny:false
└── package.json
```

---

## 4. Arquitetura Geral

### Diagrama de Camadas

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  Next.js App Router (app/(protected)/)                       │
│  React 18 + TanStack Query + shadcn/ui                       │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP + WebSocket (Realtime)
┌────────────────────────▼────────────────────────────────────┐
│                      API ROUTES                              │
│  /api/webhooks/evolution   → Webhook WhatsApp inbound        │
│  /api/whatsapp/send        → Envio manual                    │
│  /api/agent/config         → Gestão de prompts               │
│  /api/agent/rag            → Base de conhecimento            │
│  /api/cron/*               → Jobs agendados                  │
│  /api/webhooks/bulk-message → Disparos em massa              │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                     CORE SERVICES                            │
│  XpagLeadHandlerWorkflow  → Orquestrador principal           │
│  AIAgentService            → OpenAI + tool calling           │
│  MessageTypeHandler        → Roteamento de mídia             │
│  WhatsAppProviderFactory   → Evolution / Meta abstraction    │
│  MessageHumanizerService   → Split de respostas              │
│  TenantResolverService     → Multi-tenancy por instância     │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   EXTERNAL SERVICES                          │
│  Supabase (PostgreSQL + Auth + Realtime + Storage)           │
│  OpenAI (gpt-4.1, gpt-4o-mini, whisper-1)                   │
│  Evolution API (WhatsApp multi-instance)                     │
│  Meta Cloud API (WhatsApp Business Oficial)                  │
└─────────────────────────────────────────────────────────────┘
```

### Padrão de Multi-tenancy

Cada usuário/empresa tem:
- Seu próprio `user_id` (Supabase Auth)
- Configurações isoladas em `user_settings`
- Leads isolados por `user_id` (RLS no PostgreSQL)
- Prompt de agente isolado em `agent_configs`
- Base RAG isolada em `rag_documents`

O `TenantResolverService` identifica o tenant pela instância Evolution API que recebe o webhook.

---

## 5. Banco de Dados (Supabase)

### Projeto
- **ID:** `kzvnwqlcrtxwagxkghxq`
- **Nome:** Lead FinderPro
- **Região:** sa-east-1 (Brasil)
- **PostgreSQL:** 17.6
- **Status:** ACTIVE_HEALTHY

### Tabelas

#### `leads_prospeccao` — Central de Leads
```sql
id                    text PRIMARY KEY
lead                  text UNIQUE          -- Nome do contato/empresa
empresa               text                 -- Nome da empresa prospectada
whatsapp              text                 -- Número WhatsApp
telefone              text                 -- Telefone não-WhatsApp
email                 text
website               text
instagram             text
cidade                text
endereco              text
bairro / bairro_regiao text
link_gmn              text                 -- Link Google Maps
cnpj                  text
categoria             text                 -- Tipo: Lead Orgânico / Prospecção Ativa
origem                text DEFAULT 'google_places'  -- Canal de aquisição
status                text DEFAULT 'Novo'
estagio_pipeline      text DEFAULT 'Novo'  -- Kanban stage
status_msg_wa         text DEFAULT 'not_sent'  -- Status WhatsApp
modo_atendimento      text DEFAULT 'bot'   -- bot | humano
faturamento_declarado numeric              -- Faturamento declarado (R$)
follow_up_count       int DEFAULT 0        -- Contador follow-ups (0-3)
motivo_follow_up      text                 -- Motivo do follow-up
usa_meios_pagamento   text                 -- SIM | NAO
consultor_responsavel text                 -- Nome do consultor
data_transferencia    timestamptz          -- Quando foi transferido
data_ultima_interacao timestamptz DEFAULT now()
data_envio_wa         timestamptz
mensagem_whatsapp     text                 -- Última mensagem enviada
resumo_analitico      text                 -- Resumo gerado por IA
user_id               uuid REFERENCES auth.users
tenant_id             text                 -- Tenant da empresa (ex: 'xpag')
created_at / updated_at timestamptz
```

#### `whatsapp_conversations` — Histórico de Conversas
```sql
id                uuid PRIMARY KEY
lead_id           text                    -- ID do lead
message_lead      text                    -- Mensagem do lead
message_agent     text                    -- Resposta do agente
from_lead         bool DEFAULT false      -- true = lead enviou
ai_generated      bool DEFAULT false      -- true = gerado por IA
message_lead_id   text                    -- ID externo do WhatsApp
message_agent_id  text
sentiment         text
intent            text
status            text DEFAULT 'aguardando_resposta'
user_id           uuid
timestamp / created_at / updated_at timestamptz
```

#### `agent_configs` — Configurações do Agente de IA
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES auth.users
name            text DEFAULT 'Prompt personalizado'
system_prompt   text                    -- Prompt completo do sistema
prompt_version  text DEFAULT 'custom'  -- '3.5', 'custom', etc.
model           text DEFAULT 'gpt-4.1'
temperature     numeric DEFAULT 0.70   -- 0 a 2
max_iterations  int DEFAULT 5          -- 1 a 10
is_active       bool DEFAULT false
created_at / updated_at timestamptz
```

#### `user_settings` — Configurações por Tenant
```sql
id                         uuid PRIMARY KEY
user_id                    uuid UNIQUE REFERENCES auth.users
company_name               text
role                       user_role DEFAULT 'operador'  -- admin|operador|visualizador
provider                   varchar DEFAULT 'evolution'   -- evolution | meta
-- Evolution API
evolution_api_url          text
evolution_api_key          text
evolution_instance_name    text
-- Meta Cloud API
business_phone_number_id   text
business_access_token      text
meta_verify_token          text
-- Consultor
consultant_whatsapp        text  -- Número para notificações de transferência
-- Webhook legado
whatsapp_webhook_url       text
user_webhook_url           text
-- Status de setup
integration_configured     bool DEFAULT false
pending_setup              bool DEFAULT true
approved_by                uuid REFERENCES auth.users  -- admin que aprovou
created_at / updated_at timestamptz
```

#### `rag_documents` — Base de Conhecimento do Agente
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES auth.users
agent_config_id text
filename        text
content         text
mimetype        text DEFAULT 'text/plain'
status          text  -- processing | ready | error | deleted
chunk_count     int DEFAULT 0
created_at / updated_at timestamptz
```

#### `rag_document_chunks` — Chunks para Busca Semântica
```sql
id            uuid PRIMARY KEY
document_id   uuid REFERENCES rag_documents
user_id       uuid REFERENCES auth.users
content       text
chunk_index   int DEFAULT 0
embedding     vector  -- pgvector para busca semântica
created_at timestamptz
```

#### `followup_schedules` — Agendamentos de Follow-up Longo Prazo
```sql
id            uuid PRIMARY KEY
lead_id       text
user_id       uuid REFERENCES auth.users
scenario      text        -- low_revenue | no_response_long | qualified_not_closed | etc.
step_number   int DEFAULT 1
due_at        timestamptz -- Quando executar
status        text        -- pending | sent | skipped | failed
instance_name text DEFAULT ''
skip_reason   text
processed_at  timestamptz
created_at timestamptz
```

#### `audit_logs` — Logs de Auditoria
```sql
id          uuid PRIMARY KEY
user_id     uuid REFERENCES auth.users
action      text    -- EXPORT_LEADS | WHATSAPP_DISPATCH | START_PROSPECTION | BULK_DELETE_LEADS
entity_type text    -- lead | prospection
entity_id   text
details     jsonb
ip_address  text
user_agent  text
created_at  timestamptz DEFAULT now()
```
> ⚠️ Criada em 2026-02-25 — antes estava ausente causando 404 na aba Logs de Auditoria.

#### `search_history` — Histórico de Prospecções
```sql
id         uuid PRIMARY KEY
user_id    uuid REFERENCES auth.users
niche      text
location   jsonb
quantity   int
status     text DEFAULT 'completed'
saved_count int DEFAULT 0
created_at / updated_at timestamptz
```

#### `transfer_logs` — Log de Transferências (legado)
```sql
id                  serial PRIMARY KEY
lead_whatsapp       text
lead_nome           text
consultor           text
banco_atualizado    bool DEFAULT false
consultor_notificado bool DEFAULT false
metodo              text
timestamp timestamptz
```

#### Outras tabelas
- `atendimento_bot` — Controle de modo (bot/humano) por WhatsApp
- `message_templates` — Templates de mensagens
- `message_logs` — Log de envios
- `lead_notes` — Notas por lead

### RLS (Row Level Security)
Todas as tabelas têm RLS habilitado. Política padrão: usuário vê e modifica apenas seus próprios registros (`user_id = auth.uid()`).

---

## 6. API Routes

### `POST /api/webhooks/evolution`
Webhook principal para receber mensagens WhatsApp (Evolution API e Meta Cloud API).

**Fluxo:**
1. Detecta provider pelo header ou payload
2. Normaliza para `NormalizedMessage`
3. Checa anti-loop (ignora `fromMe=true`)
4. Executa `runXpagWorkflow()` de forma assíncrona (fire-and-forget)
5. Retorna HTTP 200 imediatamente

**GET** → Health check + verificação de webhook Meta (`hub.verify_token`)

---

### `POST /api/whatsapp/send`
Envio manual de mensagem WhatsApp pelo frontend.

**Body:** `{ whatsapp: string, message: string }`
**Auth:** Sessão Supabase obrigatória
**Provider:** Lido de `user_settings.provider`

---

### `GET|POST|PUT /api/agent/config`
Gestão de prompts e configurações do agente por tenant.

- **GET** → Lista configs. Se vazio, retorna config default (prompt v3.5)
- **POST** → Cria/atualiza config com novo prompt/modelo
- **PUT** → Reseta para prompt padrão do sistema (v3.5)

---

### `PUT /api/agent/config/[id]/activate`
Ativa uma versão específica de configuração do agente.

---

### `GET|POST|DELETE /api/agent/rag`
Gestão da base de conhecimento RAG.

- **GET** → Lista documentos do tenant
- **POST** → Upload (multipart/form-data) ou texto JSON
- **DELETE** → Remove documento por `?id=`

---

### `GET /api/cron/follow-up`
Follow-up de curto prazo. Executado a cada minuto (cron Vercel).

**Auth:** `Authorization: Bearer ${CRON_SECRET}`
**Job:** `runFollowUpJob()` — envia mensagens em 3 estágios (10min / 1h / 24h)

---

### `GET /api/cron/long-followup`
Follow-up de longo prazo. Executado diariamente às 9h BRT.

**Job:** `runLongFollowUpJob()` — 5 cenários com sequências de dias/semanas/meses

---

### `GET /api/cron/keepalive`
Previne o Supabase de entrar em modo de hibernação. Executado a cada 5 dias.

---

### `POST /api/webhooks/bulk-message`
Disparo em massa de mensagens WhatsApp.

**Body:** `{ messages: [{whatsapp, message}], instanceName, delayMs }`
**Retorna:** `{ queued: true, jobId, count }`

---

### `POST /api/admin/init-user-settings`
Inicializa `user_settings` para novo usuário no momento do cadastro.

**Auth:** Pública (usa service role internamente — sem risco de escalada)
**Body:** `{ userId: string }`
**Ação:** Upsert com `role='visualizador'`, `pending_setup=true`. Ignora se já existir.
**Uso:** Chamada pelo `AuthContext` logo após `supabase.auth.signUp()`

---

### `POST /api/admin/approve-user`
Aprova um usuário pendente e define seu role definitivo.

**Auth:** Somente admin (`email=fmbp1981@gmail.com` + `role='admin'` no banco)
**Body:** `{ userId: string, newRole: 'operador' | 'visualizador' | 'admin' }`
**Ação:**
1. Valida identidade do admin (dupla verificação: JWT + banco)
2. Atualiza `user_settings`: `role=newRole`, `pending_setup=false`, `approved_by=adminId`
3. Envia email de aprovação via Resend com branding IntelliX.AI

---

## 7. Serviços e Componentes Core

### `XpagLeadHandlerWorkflow` — Orquestrador Principal
**Arquivo:** `src/lib/workflows/xpag-lead-handler.workflow.ts`

10 etapas com timeouts individuais e fallbacks:

| Passo | Timeout | Ação | Fallback |
|-------|---------|------|---------|
| 1 | 5s | Resolver tenant por instância Evolution | Aborta |
| 1C | — | Definir chave OpenAI do tenant via `withOpenAIKey()` | Usa `OPENAI_API_KEY` global |
| 2 | — | Checar comando `#finalizado` | Volta modo bot |
| 3 | 8s | Buscar ou criar lead | Log, continua |
| 4 | — | Checar modo `humano` | Salva msg, não responde |
| 5 | 30s | Processar mídia (áudio/imagem/documento) | Usa texto bruto |
| 6 | — | Salvar mensagem no histórico | Warning |
| 7 | 60s | Construir contexto + executar agente IA | Log, aborta envio |
| 8 | 15s | Humanizar resposta (split ≤240 chars) | Envia sem split |
| 9 | 30s | Enviar via provider WhatsApp | Log erro |
| 10 | — | Persistir resposta + atualizar timestamp | Warning |

---

### `AIAgentService` — Execução do Agente
**Arquivo:** `src/lib/ai/ai-agent.service.ts`

Loop de tool calling com OpenAI:
1. Carrega config ativa do tenant (prompt + modelo + temperatura)
2. Injeta contexto RAG se disponível
3. Chama OpenAI com array de tools
4. Se houver tool calls → executa sequencialmente
5. Adiciona resultados como `role: tool`
6. Repete até `maxIterations` ou sem tool calls
7. Retorna texto final do assistente

**Resiliência:** Circuit breaker + retry (2 tentativas, backoff 1.5s)

---

### `AgentConfigService` — Gestão de Prompts
**Arquivo:** `src/lib/ai/agent-config.service.ts`

```typescript
interface AgentConfig {
  id: string
  userId: string
  name: string
  systemPrompt: string      // Prompt completo
  promptVersion: string     // '3.5' | 'custom'
  model: string             // 'gpt-4.1'
  temperature: number       // 0.0 – 2.0
  maxIterations: number     // 1 – 10
  isActive: boolean
}
```

Métodos: `getActive()`, `list()`, `upsert()`, `activate()`, `resetToDefault()`

---

### `WhatsAppProviderFactory` — Abstração de Provider
**Arquivo:** `src/lib/integrations/whatsapp/whatsapp.factory.ts`

Interface comum para Evolution API e Meta Cloud API:
```typescript
interface IWhatsAppProvider {
  sendText(instanceOrPhoneId, to, text): Promise<SendResult>
  sendMessageSequence(instanceOrPhoneId, to, messages, delayMs): Promise<void>
  downloadMedia(instanceOrPhoneId, mediaId): Promise<Buffer>
  normalizeWebhookPayload(payload): NormalizedMessage | null
}
```

Seleção do provider: `WHATSAPP_PROVIDER=evolution|meta` ou por `user_settings.provider`

---

### Tools do Agente de IA

#### `atualizar_lead`
**Arquivo:** `src/lib/ai/tools/update-lead.tool.ts`

Campos atualizáveis:
| Campo | Valores |
|-------|---------|
| `status_msg_wa` | `Em Conversa` \| `Qualificando` \| `Qualificado` \| `Follow-up` \| `Transferido` |
| `estagio_pipeline` | `Contato Inicial` \| `Qualificação` \| `Follow-up` \| `Transferido para Consultor` \| `Fechado Ganho` \| `Fechado Perdido` |
| `empresa` | Nome da empresa |
| `faturamento_declarado` | Faturamento mensal (R$) |
| `usa_meios_pagamento` | SIM \| NAO |
| `motivo_follow_up` | Motivo do follow-up |

Ao atualizar para `Qualificado` ou `Follow-up`, agenda automaticamente os follow-ups de longo prazo na tabela `followup_schedules`.

#### `transferir_para_consultor`
**Arquivo:** `src/lib/ai/tools/transfer-consultant.tool.ts`

Ao ser chamada:
1. Atualiza lead: `modo_atendimento='humano'`, `status_msg_wa='Transferido'`, `estagio_pipeline='Transferido para Consultor'`, `consultor_responsavel='Felipe'`
2. Lê `consultant_whatsapp` e `evolution_instance_name` de `user_settings` (fallback: variáveis de ambiente)
3. Envia notificação via WhatsApp ao consultor com nome, empresa, WhatsApp e motivo do lead
4. Bot para de responder (modo humano)

**Transferência também é acionada quando o lead pede explicitamente para falar com humano** (independente do estágio).

---

### `MessageHumanizerService` — Split de Respostas
**Arquivo:** `src/lib/services/message-humanizer.service.ts`

- Respostas ≤ 240 chars → enviadas diretamente
- Respostas longas → GPT-4-mini split em máx. 4 mensagens
- Fallback: split por parágrafo + frase

---

### `MessageTypeHandler` — Processamento de Mídia
**Arquivo:** `src/lib/handlers/message-type.handler.ts`

| Tipo | Processamento |
|------|--------------|
| `text` | Usa diretamente |
| `audio` | Download → Whisper (transcrição) |
| `image` | Download → GPT-4-vision (descrição) |
| `document/pdf` | Download → extração de texto |
| Outros | Retorna texto de erro amigável |

---

### `LeadRepository` — Acesso a Dados
**Arquivo:** `src/lib/repositories/lead.repository.ts`

```typescript
findByWhatsApp(whatsapp, userId?)
create(leadInsert)
update(id, fields)
findLeadsForFollowUp()    // Query com janelas de tempo
incrementFollowUpCount(id)
keepAlive()               // Dummy query anti-sleep
```

---

### `TenantResolverService` — Multi-tenancy
**Arquivo:** `src/lib/services/tenant-resolver.service.ts`

Identifica o tenant (usuário) a partir do nome da instância Evolution que recebeu a mensagem. Faz lookup em `user_settings.evolution_instance_name`.

---

### `AntiLoopGuard` — Prevenção de Loops
**Arquivo:** `src/lib/guards/anti-loop.guard.ts`

Ignora mensagens com `fromMe=true` (mensagens enviadas pelo próprio bot).

---

## 8. Fluxos de Dados

### Fluxo 1 — Mensagem Inbound WhatsApp
```
Lead envia mensagem WhatsApp
  → Evolution/Meta API dispara webhook
  → POST /api/webhooks/evolution
    → Identifica provider (Evolution ou Meta)
    → Normaliza payload para NormalizedMessage
    → Verifica anti-loop (fromMe=true → ignora)
    → Retorna HTTP 200 (fire-and-forget)
  → [async] runXpagWorkflow()
    → Step 1: TenantResolverService → identifica user_id pela instância
    → Step 2: Verifica "#finalizado" → modo bot
    → Step 3: LeadRepository.findByWhatsApp() → cria se não existir
    → Step 4: Verifica modo_atendimento='humano' → se sim, apenas salva e para
    → Step 5: MessageTypeHandler → processa áudio/imagem/doc
    → Step 6: ConversationRepository.save(leadMessage)
    → Step 7: AgentContextBuilder + AIAgentService
      → Carrega config ativa do tenant
      → Injeta histórico (últimas 20 msgs)
      → Injeta dados do lead
      → Loop OpenAI com tools:
        → atualizar_lead (opcional)
        → transferir_para_consultor (opcional)
      → Retorna resposta textual
    → Step 8: MessageHumanizerService → split em ≤4 msgs
    → Step 9: Provider.sendMessageSequence()
    → Step 10: ConversationRepository.save(agentResponse)
```

### Fluxo 2 — Follow-up Curto Prazo (Cron)
```
Vercel Cron [a cada minuto]
  → GET /api/cron/follow-up
  → runFollowUpJob()
    → Busca leads: follow_up_count=0 AND tempo inativo ≥ 10min
    → Busca leads: follow_up_count=1 AND tempo inativo ≥ 1h
    → Busca leads: follow_up_count=2 AND tempo inativo ≥ 24h
    → Para cada lead: envia mensagem do estágio correspondente
    → incrementFollowUpCount()
    → Se count=3: status_msg_wa='Follow-up'
```

### Fluxo 3 — Follow-up Longo Prazo (Cron Diário)
```
Vercel Cron [diariamente às 9h BRT]
  → GET /api/cron/long-followup
  → runLongFollowUpJob()
    → Query followup_schedules WHERE due_at <= now AND status='pending'
    → Para cada schedule:
      → Valida se cenário ainda se aplica (lead não mudou de status?)
      → Busca template de mensagem do cenário/step
      → MessageHumanizer → split
      → Provider.sendMessageSequence()
      → schedule.status = 'sent'
      → Se não é último step: insere próximo step com due_at calculado
```

### Fluxo 4 — Transferência para Consultor
```
Agente IA decide transferir (lead qualificado) OU
Lead solicita explicitamente falar com humano
  → AI chama tool transferir_para_consultor
  → tool.execute():
    → LeadRepository.update(leadId, {
        modo_atendimento: 'humano',
        status_msg_wa: 'Transferido',
        estagio_pipeline: 'Transferido para Consultor',
        data_transferencia: now(),
        consultor_responsavel: 'Felipe'
      })
    → getConsultantConfig(userId) → user_settings.consultant_whatsapp
    → sendWhatsAppText(consultantWhatsapp, mensagem_com_dados_do_lead)
  → Agente confirma ao lead: "Conectei você com o Felipe"
  → Bot NÃO responde mais (modo humano)
```

### Fluxo 5 — Prospecção (Frontend)
```
Usuário preenche ProspectionForm (nicho + localização + quantidade)
  → POST /api/prospection (Supabase Edge Function)
  → Google Places API → busca empresas
  → OpenAI → enriquece dados + gera mensagem personalizada
  → Salva em leads_prospeccao
  → Salva em search_history
  → Frontend exibe resultados + QuickStats
```

### Fluxo 6 — Realtime Sync (Frontend)
```
Agente IA atualiza lead no banco
  → Supabase postgres_changes emite evento
  → Kanban page (supabase.channel 'kanban-leads-realtime')
  → Leads page (supabase.channel 'leads-table-realtime')
  → loadLeads() é chamado automaticamente
  → UI atualiza sem refresh manual
```

---

## 9. Sistema de Roles e Permissões (RBAC)

### Ciclo de Vida de um Usuário

```
signUp()
  → POST /api/admin/init-user-settings
    → user_settings: role='visualizador', pending_setup=true
  → Middleware detecta pending_setup=true
    → Redireciona para /pending (página de aguardo)
  → Admin aprova em /settings aba "Pendentes"
    → POST /api/admin/approve-user { userId, newRole }
      → pending_setup=false, role=newRole, approved_by=adminId
      → Email de aprovação enviado via Resend
  → Usuário acessa normalmente com o role definido
```

### Roles Disponíveis

| Role | Descrição |
|------|-----------|
| `admin` | Acesso total. Só para email `fmbp1981@gmail.com` com `role='admin'` |
| `operador` | Cria, edita, deleta leads. Configura Agente de IA e RAG. Não pode ações em massa |
| `visualizador` | Somente leitura e exportação |
| *(pendente)* | `pending_setup=true` — bloqueado em `/pending` até aprovação do admin |

### Mapa de Permissões

| Permissão | Admin | Operador | Visualizador |
|-----------|-------|----------|--------------|
| `canCreate` | ✅ | ✅ | ❌ |
| `canUpdate` | ✅ | ✅ | ❌ |
| `canDelete` | ✅ | ✅ | ❌ |
| `canBulkDelete` | ✅ | ❌ | ❌ |
| `canExport` | ✅ | ✅ | ✅ |
| `canSendWhatsApp` | ✅ | ✅ | ❌ |
| `canManageAgent` | ✅ | ✅ | ❌ |
| `canManageRoles` | ✅ | ❌ | ❌ |
| `canViewAuditLogs` | ✅ | ❌ | ❌ |
| `canManageIntegrations` | ✅ | ❌ | ❌ |

### Uso no Código

**Hook:** `useUserRole()` em `src/hooks/useUserRole.ts`
```typescript
const { role, isAdmin, isOperador, hasPermission } = useUserRole()
if (hasPermission('canManageAgent')) { /* mostrar seção */ }
```

**Componente Guard:** `<RoleGuard requiredPermission="canManageAgent">` ou `<RoleGuard allowedRoles={['admin']}`

**RLS no Supabase:** Cada tabela só permite SELECT/INSERT/UPDATE/DELETE para o próprio `user_id`.

---

## 10. Agente de IA — XPAG

### System Prompt — Versão Atual: v3.5

**Arquivo:** `src/lib/ai/prompts/system-prompt.v3.4.ts`
> O arquivo mantém nome `.v3.4.ts` por compatibilidade, mas contém o prompt v3.5.

**Identidade:** Assistente XPAG — equipe de atendimento da XPAG Brasil

**Fluxo de Atendimento:**
1. **ETAPA 1** — Primeiro contato: saudação + apresentação + pergunta de abertura
2. **ETAPA 2** — Meios de pagamento: confirma empresa + atualiza lead
3. **ETAPA 3** — Faturamento: valida se acima de R$50k/mês
4. **ETAPA 4** — Decisão: Follow-up (< R$50k) ou Qualificado (≥ R$50k)
5. **ETAPA 5A** — Transferência (agente decide OU lead solicita humano)
5. **ETAPA 5B** — Lead já transferido: reenvio de notificação ao consultor

**Regras Absolutas:**
1. Nunca dizer que transferiu sem EFETIVAMENTE chamar a tool
2. Lead pede humano → transferir IMEDIATAMENTE, sem questionar
3. Usar sempre dados do contexto — não inventar
4. Nunca mentir sobre ações realizadas
5. Atualizar lead em cada avanço relevante
6. Não repetir apresentação para leads em conversa

**Contexto Injetado Automaticamente (antes do agente rodar):**
- Lead Encontrado no Banco: SIM/NÃO - LEAD NOVO
- Status WhatsApp atual
- Modo de Atendimento: bot | humano
- Estágio Pipeline atual
- Empresa informada
- Últimas 20 mensagens do histórico

**Processamento de Mídia (automático, antes do agente):**
- Áudio → Whisper → texto
- Imagem → GPT-4-vision → descrição
- Documento/PDF → extração de texto

### Versionamento de Prompts

Cada tenant pode ter múltiplos prompts salvos em `agent_configs`. Apenas `is_active=true` é usado.

Se não houver config salva, o sistema usa o prompt padrão v3.5 (retornado como config virtual pelo `GET /api/agent/config`).

---

## 11. Integrações WhatsApp

### Evolution API (provider padrão)

**Config necessária em `user_settings`:**
- `evolution_api_url` — URL da instância (ex: `https://evolution.dominio.com`)
- `evolution_api_key` — API Key
- `evolution_instance_name` — Nome da instância (ex: `WA-Producao`)

**Endpoint de envio:** `POST /api/whatsapp/send`
**Webhook de recebimento:** `POST /api/webhooks/evolution`

### Meta Cloud API (WhatsApp Business Oficial)

**Config necessária em `user_settings`:**
- `business_phone_number_id` — ID do número no painel Meta
- `business_access_token` — System User Token
- `meta_verify_token` — Token de verificação do webhook

**Verificação do webhook:** `GET /api/webhooks/evolution?hub.verify_token=...&hub.challenge=...`

### Consultor WhatsApp
Número configurado em `user_settings.consultant_whatsapp`.
Recebe notificação quando o agente executa `transferir_para_consultor`.
Formato: `5581999990000` (DDI + DDD + número, apenas dígitos).

---

## 12. Variáveis de Ambiente

```env
# ─── SUPABASE ──────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://kzvnwqlcrtxwagxkghxq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # NUNCA expor no client-side

# ─── APP ───────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://alpha.dualite.dev

# ─── WHATSAPP PROVIDER ─────────────────────────────────────
WHATSAPP_PROVIDER=evolution   # evolution | meta

# ─── EVOLUTION API ─────────────────────────────────────────
EVOLUTION_API_URL=https://evolution.dominio.com
EVOLUTION_API_KEY=sua-api-key
EVOLUTION_DEFAULT_INSTANCE=WA-Producao

# ─── META CLOUD API ────────────────────────────────────────
META_WA_TOKEN=EAAxxxxx
META_WA_PHONE_NUMBER_ID=123456789
META_WA_VERSION=v20.0
META_WA_VERIFY_TOKEN=seu-verify-token

# ─── OPENAI ────────────────────────────────────────────────
OPENAI_API_KEY=sk-...

# ─── FALLBACK CONSULTOR ────────────────────────────────────
# Usados se user_settings não tiver configurado
XPAG_CONSULTANT_WHATSAPP=5581999990000
XPAG_CONSULTANT_INSTANCE=WA-Producao

# ─── CRON JOBS ─────────────────────────────────────────────
CRON_SECRET=seu-segredo-aqui
```

> **Nota:** `NEXT_PUBLIC_*` são baked no build (não são runtime). Devem estar configurados em **Production E Preview** no Vercel.

---

## 13. Deploy e Infraestrutura

### Vercel
- **Produção:** `alpha.dualite.dev`
- **Branch:** `main` → deploy automático na produção
- **Preview:** branches feature → URL temporária (pode expirar)
- **Framework:** Next.js (detectado via `vercel.json`)
- **Build:** `npm run build`
- **Output:** `.next`

**vercel.json:**
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "outputDirectory": ".next"
}
```

### Cron Jobs (Vercel)
Configurados em `vercel.json` (ou Vercel Dashboard → Cron Jobs):
| Route | Schedule | Função |
|-------|----------|--------|
| `/api/cron/follow-up` | `* * * * *` | Follow-up curto prazo (a cada minuto) |
| `/api/cron/long-followup` | `0 12 * * *` | Follow-up longo prazo (diário 9h BRT) |
| `/api/cron/keepalive` | `0 0 */5 * *` | Keep-alive Supabase (a cada 5 dias) |

### Supabase
- **Projeto ID:** `kzvnwqlcrtxwagxkghxq`
- **Região:** sa-east-1
- **PostgreSQL:** 17.6
- **RLS:** Ativado em todas as tabelas
- **Realtime:** Ativo para `leads_prospeccao`

### TypeScript
- `strict: false` — permite código mais permissivo
- `noImplicitAny: false`
- `strictNullChecks: false`
- Path aliases: `@/*` → `./src/*` e `./*`

---

## 14. Histórico de Mudanças

### v2.0.0 — Migração n8n → Sistema Nativo (2025-10)

**Contexto:** O sistema original dependia de um workflow n8n com 52 nós para orquestrar toda a lógica de atendimento WhatsApp. O n8n era um ponto único de falha, difícil de versionar e sem tipagem.

**Mudanças:**
- Criação do `XpagLeadHandlerWorkflow` — orquestrador nativo em TypeScript
- Criação de `AIAgentService` com loop de tool calling OpenAI
- Criação de `WhatsAppProviderFactory` com suporte a Evolution API e Meta Cloud API
- Criação de `MessageTypeHandler` (áudio/Whisper, imagem/Vision, PDF)
- Criação de `MessageHumanizerService` (split de respostas)
- Criação de `TenantResolverService` (multi-tenancy por instância)
- Criação de `AntiLoopGuard` (previne loops `fromMe`)
- Criação dos jobs: `follow-up.job.ts`, `long-followup.job.ts`, `bulk-sender.job.ts`
- Criação dos repositórios: `lead.repository.ts`, `conversation.repository.ts`
- Criação do `agent-config.service.ts` (versionamento de prompts por tenant)
- Sistema RAG: `rag.service.ts`, `embeddings.service.ts`
- API Routes: `/api/webhooks/evolution`, `/api/cron/*`, `/api/agent/*`
- Supabase Realtime adicionado em Kanban e Leads pages

---

### feat: System Prompt v3.5 (2026-02-25)

**Arquivo:** `src/lib/ai/prompts/system-prompt.v3.4.ts`

**Contexto:** O prompt v3.4 foi escrito para o ambiente n8n e referenciava tools não implementadas (`buscar_lead_por_whatsapp`, `criar_lead_organico`). No sistema nativo, o contexto é injetado automaticamente e a mídia é processada antes do agente ser chamado.

**Mudanças:**
- Removida tool `buscar_lead_por_whatsapp` (contexto é injetado automaticamente)
- Removida tool `criar_lead_organico` (gerenciado pelo workflow)
- Adicionada seção explicando o sistema nativo e a injeção automática de contexto
- Adicionada seção de processamento de mídia pré-agente
- ETAPA 5A atualizada: transferência em 2 casos obrigatórios
  - CASO 1: agente decide transferir (lead qualificado + interesse)
  - CASO 2: lead solicita falar com humano → **transferência imediata**
- Adicionada Regra Absoluta #2: "Se lead pedir humano → transfira imediatamente"
- Removida instrução de chamar `atualizar_lead` após `transferir_para_consultor` (a tool já atualiza tudo)
- Versão: `3.5`

---

### feat: Prompt visível no Settings quando agent_configs está vazio (2026-02-25)

**Arquivo:** `app/api/agent/config/route.ts`

**Problema:** A tabela `agent_configs` estava vazia para novos tenants. O `GET /api/agent/config` retornava `[]`, a textarea do Settings ficava em branco.

**Solução:** Quando `configs.length === 0`, retornar config virtual com o prompt padrão v3.5 (id `'default'`). Isso não grava no banco — apenas exibe o padrão para o usuário.

---

### feat: Consultor WhatsApp configurável por tenant (2026-02-25)

**Arquivos modificados:**
- `src/lib/userSettings.ts` — adicionado campo `consultant_whatsapp` na interface e nas operações de save
- `src/lib/ai/tools/transfer-consultant.tool.ts` — refatorado de env vars fixas para leitura por `user_id` em `user_settings`
- `app/(protected)/settings/page.tsx` — adicionado card "Agente de Atendimento" com campos editáveis:
  - Instância de Atendimento do Agente (campo `evolution_instance_name`, agora editável)
  - WhatsApp do Consultor (campo `consultant_whatsapp`, novo)
- **Supabase Migration:** `ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS consultant_whatsapp text`

**Impacto:** Múltiplos tenants podem ter consultores diferentes. Env vars `XPAG_CONSULTANT_WHATSAPP` e `XPAG_CONSULTANT_INSTANCE` mantidas como fallback.

---

### feat: Operador acessa configurações do Agente de Atendimento (2026-02-25)

**Arquivo:** `app/(protected)/settings/page.tsx`

**Mudança:** Card "Agente de Atendimento" alterado de `allowedRoles={['admin']}` para `requiredPermission="canManageAgent"`.

**Impacto:** Usuários com role `operador` agora podem configurar:
- System Prompt do agente
- Base RAG
- Instância de atendimento
- WhatsApp do consultor

---

### fix: Importação de Button faltando em integrations/page.tsx (2026-02-25)

**Arquivo:** `app/(protected)/integrations/page.tsx`

**Problema:** Build falhava com `'Button' is not defined. react/jsx-no-undef` na linha 264.

**Solução:** Adicionado `import { Button } from "@/components/ui/button"`.

---

### feat: Realtime sync para Kanban e Leads (2026-02-25)

**Arquivos modificados:**
- `app/(protected)/kanban/page.tsx`
- `app/(protected)/leads/page.tsx`

**Mudança:** Adicionadas subscriptions Supabase Realtime:
```typescript
supabase.channel('kanban-leads-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'leads_prospeccao' },
    () => loadLeads())
  .subscribe()
```

**Impacto:** Quando o agente de IA atualiza um lead no banco (via tool `atualizar_lead`), o Kanban e a tabela de Leads do frontend atualizam automaticamente sem refresh manual.

---

### fix: Criação da tabela audit_logs (2026-02-25)

**Migration aplicada via Supabase MCP:**
```sql
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
-- RLS: users see own logs only
```

**Problema:** Tabela não existia → `GET /rest/v1/audit_logs` retornava 404 → aba "Logs de Auditoria" em `/integrations` exibia erro silencioso.

**Impacto:** Logs de `EXPORT_LEADS`, `WHATSAPP_DISPATCH`, `START_PROSPECTION`, `BULK_DELETE_LEADS` agora são persistidos e exibidos na página de Integrações.

---

### feat: Fluxo de aprovação de usuários (2026-02-27)

**Arquivos criados:**
- `app/(protected)/pending/page.tsx` — página de aguardo de aprovação
- `app/api/admin/init-user-settings/route.ts` — inicializa user_settings no signup
- `app/api/admin/approve-user/route.ts` — aprova usuário e envia email

**Arquivos modificados:**
- `lib/supabase/middleware.ts` — redireciona `pending_setup=true` para `/pending`
- `src/contexts/AuthContext.tsx` — chama `init-user-settings` após signUp
- `src/hooks/useUserRole.ts` — expõe `isPending` baseado em `pending_setup`
- `src/components/RoleManagement.tsx` — aba "Pendentes" com ação de aprovação + seletor de role
- `src/components/AppSidebar.tsx` — oculta itens de navegação para usuários pendentes
- `app/(protected)/settings/page.tsx` — aba "Pendentes" visível para admin
- `app/(protected)/page.tsx` e `leads/page.tsx` — guards de role atualizados
- `src/lib/userSettings.ts` — campo `approved_by` na interface e operações

**Supabase Migration:**
```sql
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);
```

**Fluxo:**
1. Novo cadastro → `role=visualizador`, `pending_setup=true`
2. Middleware redireciona para `/pending`
3. Admin aprova em `/settings` aba "Pendentes" → define role
4. Email de aprovação enviado via Resend (remetente: IntelliX.AI)
5. Usuário acessa normalmente

---

### feat: Chave OpenAI configurável por tenant (2026-02-28)

**Arquivo criado:**
- `src/lib/ai/openai-key-context.ts` — AsyncLocalStorage para propagar chave OpenAI do tenant

**Arquivos modificados:**
- `src/lib/services/tenant-resolver.service.ts` — `TenantContext` com campo `openaiApiKey?`
- `src/lib/workflows/xpag-lead-handler.workflow.ts` — Step 1C: encapsula pipeline em `withOpenAIKey(tenant.openaiApiKey)`
- `src/lib/ai/ai-agent.service.ts` — migrado para `getCurrentOpenAIKey()`
- `src/lib/ai/rag/embeddings.service.ts` — migrado para `getCurrentOpenAIKey()`
- `src/lib/integrations/openai/vision.service.ts` — migrado para `getCurrentOpenAIKey()`
- `src/lib/integrations/openai/whisper.service.ts` — migrado para `getCurrentOpenAIKey()`
- `src/lib/services/message-humanizer.service.ts` — migrado para `getCurrentOpenAIKey()`
- `src/lib/services/pdf-analyzer.service.ts` — migrado para `getCurrentOpenAIKey()`
- `src/lib/ai/tools/transfer-consultant.tool.ts` — fix: `leadPipelineStage` substituindo `leadStatus`
- `supabase/functions/prospection/index.ts` — cliente service role para bypass de RLS com `user_id` do JWT

**Como funciona:**
```typescript
// No workflow, ao resolver o tenant:
const openaiKey = tenant.openaiApiKey || process.env.OPENAI_API_KEY!;
return withOpenAIKey(openaiKey, () => runWorkflowSteps(...));

// Em qualquer serviço OpenAI:
Authorization: `Bearer ${getCurrentOpenAIKey()}`
// → retorna chave do tenant se disponível, senão OPENAI_API_KEY global
```

**Impacto:** Cada tenant pode ter sua própria chave OpenAI configurada em `user_settings`. Env var `OPENAI_API_KEY` mantida como fallback global.

---

### feat: Contexto enriquecido para lead retornando (2026-02-28)

**Arquivo:** `src/lib/ai/ai-agent.service.ts` — função `buildUserPrompt`

**Problema:** O agente recebia contexto mínimo do lead (6 campos) e sem instrução comportamental sobre como tratar leads retornantes vs. novos. Isso causava o agente se reapresentar, repetir perguntas já respondidas e ignorar o estágio atual da qualificação.

**Solução:** Três melhorias no `buildUserPrompt`:

**1. Instrução comportamental por tipo de contato:**
- `isNewLead=true` → "NOVO CONTATO — faça abordagem inicial"
- `isNewLead=false, sem histórico, com mensagem de prospecção` → "LEAD PROSPECTADO RETORNANDO — não se reapresente, você já enviou mensagem"
- `isNewLead=false, com histórico` → "LEAD RETORNANDO — NÃO se reapresente, NÃO repita perguntas já respondidas"
- `isNewLead=false, sem histórico` → "LEAD EXISTENTE — trate como retorno com naturalidade"

**2. Dados completos de qualificação:**
Campos adicionados ao contexto (só exibidos se preenchidos):
- `faturamento_declarado`, `usa_meios_pagamento`, `motivo_follow_up`
- `observacoes`, `consultor_responsavel`, `categoria`, `origem`, `data_ultima_interacao`

**3. `mensagem_personalizada` para leads prospectados:**
Quando `isNewLead=false`, histórico vazio e `mensagem_personalizada` existe, o agente recebe a mensagem original de prospecção como contexto do contato anterior — permitindo retomada natural sem perda de contexto.

---

### fix: processamento de mídia — áudio, imagem e documento (2026-02-28)

**Problema:** O agente não processava nenhum tipo de mídia — retornava sempre o fallback `[Mídia não processada]`.

**Causa raiz (2 bugs):**

**Bug 1 — `messageId` perdido:**
Webhook configurado com `webhookBase64: false` (base64 não vem no payload). O fallback era baixar via `getBase64FromMediaMessage` usando o `key.id`. Porém, `key.id` nunca era armazenado no `NormalizedMessage` nem passado para `processMessageByType()`.

**Bug 2 — PDF via `image_url`:**
`pdf-analyzer.service.ts` enviava o PDF como `image_url` para GPT-4o Vision — que não suporta PDF. Documentos sempre falhavam silenciosamente.

**Correções:**
- `message-normalizer.service.ts` — `messageId?: string` adicionado à interface; `data.key?.id` extraído e armazenado
- `xpag-lead-handler.workflow.ts` — `processMessageByType(normalized, instanceName, normalized.messageId)`
- `pdf-analyzer.service.ts` — reescrito: `pdf-parse` extrai texto real → GPT-4o-mini resume; fallback retorna texto bruto
- `package.json` — dependência `pdf-parse` adicionada

**Fluxo correto após fix:**
```
Áudio/Imagem/Doc chega no webhook
  → normalizer extrai key.id → messageId
  → processMessageByType(normalized, instance, messageId)
    → evolutionMediaClient.downloadMedia(instance, messageId) se base64 ausente
    → Áudio  → Whisper  → transcrição em texto
    → Imagem → GPT-4o Vision → descrição objetiva
    → Doc    → pdf-parse → texto bruto → GPT-4o-mini → resumo comercial
  → conteúdo processado injetado no contexto do agente como [ÁUDIO], [IMAGEM] ou [DOCUMENTO]
```

---

*Próxima atualização: registrar aqui ao fazer qualquer mudança significativa.*

---

### fix: security — cron auth guard, CORS, CSP, webhook token validation (2026-03-02)

**Contexto:** Bateria de testes E2E (Seção 15) identificou múltiplas vulnerabilidades de segurança.

**Arquivos modificados:**

**`lib/supabase/middleware.ts`**
- Adicionado `/api/admin/` em `publicApiPrefixes` (handlers admin fazem sua própria auth)
- Adicionado early return 401 JSON para rotas `/api/*` sem sessão válida (antes redirecionava para HTML de login, confundindo clientes REST)

**`app/api/cron/follow-up/route.ts`**
**`app/api/cron/long-followup/route.ts`**
**`app/api/cron/keepalive/route.ts`**
- Condição `if (CRON_SECRET && ...)` alterada para `if (!CRON_SECRET || ...)`
- Antes: se `CRON_SECRET` não estivesse definida, qualquer requisição passava sem autenticação
- Depois: se `CRON_SECRET` não estiver definida, retorna 401 (forçando configuração da variável)

**`app/api/webhooks/evolution/route.ts`**
- GET handler: ao receber `hub.mode=subscribe`, agora valida `hub.verify_token` antes de responder
- Token inválido ou ausente → 403 `{error: 'Invalid verify_token'}`
- Antes: retornava `{status:'ok'}` para qualquer token, inclusive inválido

**`next.config.js`**
- Adicionado header `Content-Security-Policy` com diretivas cobrindo `default-src`, `script-src`, `style-src`, `connect-src` (Supabase + OpenAI)
- Adicionado header `Permissions-Policy` (bloqueia câmera, microfone, geolocalização)
- Adicionado bloco de headers CORS para `/api/:path*` restrito ao domínio `NEXT_PUBLIC_APP_URL`
- Antes: `Access-Control-Allow-Origin: *` permitia requisições de qualquer origem

---

## 15. Testes E2E — Bateria Completa

> **Metodologia:** VibeCODE E2E Tester (skill `SKILL_TestE2E`)
> **Ambiente testado:** `https://prospect-pulse-54.vercel.app` (preview Vercel) — equivalente ao prod `alpha.dualite.dev`
> **Diretório de testes:** `C:\Projects\prospect-pulse-54\e2e_tests\`
> **Iniciado em:** 2026-02-28
> **Última execução:** 2026-03-02

---

### 15.1 Status Geral das Fases

| Fase | Status | Passed | Failed | Arquivo de resultado |
|------|--------|--------|--------|----------------------|
| **Fase 1** — Smoke Tests | ✅ Executada | 6 | 9 | `results_01.json` |
| **Fase 2** — Funcionais | ✅ Executada | 13 | 2 | `results_02.json` |
| **Fase 3** — Negativos | ✅ Executada | 13 | 0 | `results_35.json` (fase3) |
| **Fase 4** — Edge Cases | ✅ Executada | 11 | 0 | `results_47.json` (fase4) |
| **Fase 5** — Segurança | ✅ Executada | 18 | 2 | `results_35.json` (fase5) |
| **Fase 6** — UI/UX | ✅ Executada | 8 | 4 | `results_06.json` |
| **Fase 7** — Stress/Performance | ✅ Executada | 6 | 0 | `results_47.json` (fase7) |
| **TOTAL** | — | **75** | **17** | — |

---

### 15.2 Bugs Encontrados

#### 🔴 Críticos (bloquear acesso indevido)

| ID | Fase | Descrição | Status |
|----|------|-----------|--------|
| BUG-01 | Fase 1 | Middleware redirecionava `/api/agent/*` sem auth para HTML `/login` (deveria ser 401 JSON) | ✅ Corrigido — middleware retorna 401 JSON para `/api/*` não autenticados |
| BUG-02 | Fase 1 | Idem BUG-01 para `/api/agent/rag` | ✅ Corrigido — idem BUG-01 |
| BUG-03 | Fase 1 | Idem BUG-01 para `/api/admin/approve-user` (agora em publicApiPrefixes, handler faz auth) | ✅ Corrigido — `/api/admin/` adicionado a publicApiPrefixes |
| BUG-04 | Fase 1 | Crons (`/api/cron/*`) acessíveis sem `Authorization` quando `CRON_SECRET` não definida | ✅ Corrigido — condição `!CRON_SECRET \|\| ...` em 3 arquivos |
| BUG-05 | Fase 1 | Webhook GET retornava `{status:'ok'}` para qualquer token, inclusive inválido | ✅ Corrigido — retorna 403 quando token não bate |
| BUG-06 | Fase 5 | **CORS permite origens arbitrárias** (`Access-Control-Allow-Origin: *`) | ✅ Corrigido — CORS restrito a `NEXT_PUBLIC_APP_URL` no `next.config.js` |

#### 🟡 Médios (degradam experiência ou segurança)

| ID | Fase | Descrição | Status |
|----|------|-----------|--------|
| BUG-07 | Fase 5 | **CSP (Content-Security-Policy) ausente** — risco XSS aumentado | ✅ Corrigido — CSP adicionado ao `next.config.js` |
| BUG-08 | Fase 1 | `GET /rota-inexistente-xyz` retorna **200** em vez de **404** | ℹ️ Comportamento Next.js — SPA retorna 200 com app shell (esperado) |

#### 🔵 Menores / UX (melhorias)

| ID | Fase | Descrição | Status |
|----|------|-----------|--------|
| BUG-09 | Fase 6 | 1 botão em `/login` sem `aria-label` ou texto acessível | ⚠️ Aguardando fix |
| BUG-10 | Fase 6 | 2 botões em `/signup` sem `aria-label` ou texto acessível | ⚠️ Aguardando fix |
| BUG-11 | Fase 6 | Favicon ausente (`<link rel="icon">` não encontrado) em `/login` e `/signup` | ⚠️ Aguardando fix |

> **Atualização 2026-03-02:** Bugs críticos BUG-01 a BUG-07 corrigidos em commit `fix: security — cron auth guard, CORS, CSP, webhook token validation`

---

### 15.3 Fases Executadas — Detalhes

#### Fase 1 — Smoke Tests (28/02)
**Script:** `e2e_tests/test_01_smoke.py`
**Resultado:** 6 passed, 9 failed

**O que passou:**
- Rotas públicas (`/login`, `/signup`, `/forgot-password`) respondem 200
- Rotas protegidas respondem sem 500 (redirect correto para o browser)
- `POST /api/admin/init-user-settings` responde corretamente

**O que falhou:**
- APIs de agente (`/api/agent/config`, `/api/agent/rag`) sem auth retornam 200 — **BUG-01, BUG-02**
- `/api/admin/approve-user` sem auth retorna 200 — **BUG-03**
- Rotas cron retornam 200 sem proteção — **BUG-04**
- Webhook aceita `verify_token` inválido — **BUG-05**
- Rota inexistente retorna 200 em vez de 404 — **BUG-08**

---

#### Fase 3 — Testes Negativos (28/02)
**Script:** incluído em teste combinado
**Resultado:** 13 passed, 0 failed ✅

- Inputs maliciosos (XSS, SQLi, template injection, strings longas) não causam crash
- Payloads malformados tratados corretamente
- Nenhum servidor retornou 500 com payloads adversariais

---

#### Fase 4 — Edge Cases (28/02)
**Resultado:** 11 passed, 0 failed ✅

- Double submit não causa crash
- Concorrência (10 requisições simultâneas) sem erros 500
- Parâmetros de paginação inválidos (negativo, overflow, string) tratados sem 500

---

#### Fase 5 — Segurança (28/02)
**Resultado:** 18 passed, 2 failed

**Headers presentes:** `X-Content-Type-Options`, `X-Frame-Options`, `HSTS`, `X-XSS-Protection`, `Referrer-Policy`
**Headers ausentes:**
- `Content-Security-Policy` — **BUG-07**
- `Access-Control-Allow-Origin` permissivo (`*`) — **BUG-06**

---

#### Fase 6 — UI/UX (28/02)
**Script:** `e2e_tests/test_06_ui.py`
**Resultado:** 8 passed, 4 failed
**Screenshots gerados:** `screenshots/resp_login_*.png`, `screenshots/resp_signup_*.png`

**O que passou:**
- Atributo `lang` presente em `/login` e `/signup`
- Imagens têm `alt` text
- Inputs de email e senha têm placeholders
- Título da página presente e válido
- Feedback ao submeter formulário vazio presente

**O que falhou:**
- Botões sem `aria-label` (provavelmente ícones de visibilidade de senha) — **BUG-09, BUG-10**
- Favicon não configurado — **BUG-11**

---

#### Fase 7 — Stress/Performance (28/02)
**Resultado:** 6 passed, 0 failed ✅

- Rotas principais respondem em tempo aceitável sob carga
- Sistema aguenta concorrência progressiva sem 500

---

### 15.4 Fase 2 — Testes Funcionais (2026-03-02)

**Script:** `e2e_tests/test_02_functional.py`
**Resultado:** 13 passed, 2 failed

**O que passou:**
- Login com submit vazio → validação exibida corretamente
- Login com credenciais inválidas → permanece em `/login` com feedback
- Signup com email inválido → bloqueado com validação HTML5
- Signup com submit vazio → validação presente
- Todas as 5 rotas protegidas (`/dashboard`, `/leads`, `/kanban`, `/settings`, `/integrations`) redirecionam corretamente para `/login`
- `/forgot-password` tem input de email e valida formato
- Navegação entre login ↔ signup tem links corretos em ambas as páginas

**O que falhou:**
- `/api/agent/config` com Bearer token JWT inválido retorna **200** (confirma BUG-01)
- `/api/agent/rag` com Bearer token JWT inválido retorna **200** (confirma BUG-02)

> **Análise:** As rotas de agente não estão validando o token JWT enviado. Aceitam qualquer Bearer token — ou sequer verificam a assinatura. Isso significa que um atacante que conhece a URL pode fazer GET nas configurações do agente sem credenciais válidas.

---

### 15.5 Relatório Final Consolidado (2026-03-02)

**Total geral:** 75 passed / 17 failed — **Taxa de aprovação: 81.5%**

#### Bugs por prioridade

**🔴 Críticos — corrigir imediatamente:**

| ID | Descrição | Como reproduzir |
|----|-----------|-----------------|
| BUG-01 | `GET /api/agent/config` retorna 200 sem auth válida | `curl https://prospect-pulse-54.vercel.app/api/agent/config` |
| BUG-02 | `GET /api/agent/rag` retorna 200 sem auth válida | `curl https://prospect-pulse-54.vercel.app/api/agent/rag` |
| BUG-03 | `GET /api/admin/approve-user` retorna 200 sem auth | `curl https://prospect-pulse-54.vercel.app/api/admin/approve-user` |
| BUG-04 | Todos os `/api/cron/*` retornam 200 sem `CRON_SECRET` | `curl https://prospect-pulse-54.vercel.app/api/cron/follow-up` |
| BUG-06 | CORS `Access-Control-Allow-Origin: *` | Requisição com `Origin: https://evil.com` |

**🟡 Médios:**

| ID | Descrição | Impacto |
|----|-----------|---------|
| BUG-05 | Webhook Evolution aceita `hub.verify_token` inválido | Bot pode ser enganado por webhook falso |
| BUG-07 | Content-Security-Policy ausente | Sem proteção contra XSS de script injected |
| BUG-08 | Rota inexistente retorna 200 em vez de 404 | Dificulta debugging e SEO |

**🔵 Menores:**

| ID | Descrição |
|----|-----------|
| BUG-09 | 1 botão em `/login` sem `aria-label` (ícone de visibilidade de senha) |
| BUG-10 | 2 botões em `/signup` sem `aria-label` |
| BUG-11 | Favicon não configurado (`<link rel="icon">` ausente) |

---

### 15.6 Próximos Passos

1. ✅ ~~Criar seção de testes no SISTEMA_TECNICO.md~~
2. ✅ ~~Executar Fase 2 — Testes Funcionais~~
3. ✅ ~~Consolidar relatório final~~
4. ⬜ **Corrigir BUG-01 a BUG-04** — proteger rotas de API com `createClient()` e verificar sessão
5. ⬜ **Corrigir BUG-06** — restringir CORS para domínios permitidos (`alpha.dualite.dev`)
6. ⬜ **Corrigir BUG-05** — validar `hub.verify_token` no webhook Evolution
7. ⬜ Adicionar CSP básico no `next.config.js` (BUG-07)
8. ⬜ Adicionar favicon (BUG-11) e `aria-label` nos botões de ícone (BUG-09/10)
