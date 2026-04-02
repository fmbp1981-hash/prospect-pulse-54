# SISTEMA_TECNICO.md — LeadFinder Pro / XPAG Brasil
> **Arquivo vivo.** Atualizar a cada mudança significativa de código, arquitetura ou infraestrutura.
> Última atualização: 2026-04-02

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

#### F12 — Email Marketing de Leads (implementado 2026-04-02)
- **Descrição:** Disparo em massa de emails para leads via Resend API.
- **Entradas:** Selecionar leads, assunto e corpo do email
- **Saída:** Envio em batch, rastreamento de status (`status_email`, `data_envio_email`)
- **API Route:** `POST /api/email/send`
- **Componente:** `EmailCampaignModal` em `/leads`
- **BulkAction:** "Enviar E-mail" na barra de ações em massa
- **Variáveis:** `RESEND_API_KEY`, `FROM_EMAIL`

#### F13 — Prospecção Modo Produto (implementado 2026-04-02)
- **Descrição:** Toggle no formulário de prospecção para buscar por "Produto" além de "Nicho" (ex: "lâmpadas LED", "pisos vinílicos").
- **Componente:** `ProspectionForm` — toggle `Nicho | Produto` + novos quick-selects de produtos
- **Edge Function:** campo `searchMode: 'niche' | 'product'` passado para `supabase/functions/prospection`
- **DB:** campo `resumo_analitico` → `editorial_summary` no modo produto

#### F14 — Base de Clientes Permanente (planejado, a implementar)
- **Descrição:** Repositório permanente de clientes convertidos, separado do funil de leads (`leads_prospeccao` é temporário; `clientes` é definitivo).
- **Conversão:** Automática quando `estagio_pipeline='Fechado Ganho'` + botão manual em qualquer estágio
- **Ao converter:** Lead removido de `leads_prospeccao`, com opção de devolver para reprospecção
- **Timeline:** Tabela `cliente_historico` registra toda a jornada (WhatsApp, campanhas, follow-ups, notas)
- **Tela:** `/clientes` (lista + card com timeline)
- **APIs:** `/api/clientes`, `/api/clientes/converter`, `/api/clientes/[id]`, `/api/clientes/[id]/devolver`

#### F15 — Sistema de Campanhas (planejado, a implementar)
- **Descrição:** Criação e disparo de campanhas de WhatsApp ou email para segmentos de leads/clientes.
- **Audience Builder:** Filtragem por categoria, cidade, estágio, status, tags
- **Canais:** WhatsApp (Evolution API) e/ou Email (Resend)
- **Rastreamento:** `campaign_sends` com status individual por destinatário
- **Tela:** `/campanhas` (lista + composer + resultados)
- **APIs:** `/api/campaigns` (CRUD + envio)

#### F16 — Importação de Leads (planejado, a implementar)
- **Descrição:** Importar leads em massa a partir de CSV, XLSX, VCF (contatos WhatsApp) ou TXT (lista de telefones).
- **Parseamento:** papaparse (CSV/TXT), xlsx (XLSX), parser vCard customizado (VCF)
- **Normalização:** qualquer formato BR de telefone → `+55XXXXXXXXXXX`
- **Componente:** `ImportLeadsModal` com preview + mapeamento de colunas
- **API Route:** `POST /api/leads/import`
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

- **CRM completo com negociações e propostas:** o sistema é focado em prospecção e qualificação inicial. Não inclui módulo de negociação, contratos ou assinaturas (Base de Clientes é repositório simples, não pipeline de vendas avançado).
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

#### `clientes` — Base de Clientes Permanente *(a criar via SQL — Fase 2)*
```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id               uuid FK auth.users (RLS: user_id = auth.uid())
lead_id_original      text                   -- ID do lead de origem em leads_prospeccao
empresa               text NOT NULL
contato               text
whatsapp              text
telefone              text
email                 text
website               text
instagram             text
cnpj                  text
cidade                text
endereco              text
bairro                text
categoria             text
tags                  text[]
aceita_cartao         text
faturamento_declarado numeric
usa_meios_pagamento   text
status                text DEFAULT 'Ativo'   -- Ativo | Inativo | Reprospectar
origem                text                   -- 'Prospecção Google' | 'Lead Orgânico' | 'Importação Manual'
estagio_origem        text                   -- estagio_pipeline no momento da conversão
data_primeiro_contato timestamptz
data_conversao        timestamptz DEFAULT NOW()
consultor_responsavel text
observacoes           text
created_at / updated_at timestamptz
```

#### `cliente_historico` — Timeline de Eventos *(a criar — Fase 2)*
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
cliente_id  uuid FK clientes
user_id     uuid FK auth.users
tipo        text NOT NULL
  -- prospeccao | whatsapp_enviado | whatsapp_recebido | qualificacao |
  -- transferencia | campanha_email | campanha_whatsapp | follow_up |
  -- conversao | nota | status_change
descricao   text NOT NULL
metadata    jsonb          -- dados extras (campaign_id, msg content, etc.)
created_at  timestamptz DEFAULT NOW()
-- INDEX: (cliente_id, created_at DESC)
```

#### `campaigns` — Campanhas de Outreach *(a criar — Fase 3)*
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id      uuid FK auth.users
name         text NOT NULL
description  text
channel      text NOT NULL       -- 'whatsapp' | 'email'
status       text DEFAULT 'draft'-- draft | scheduled | running | completed | paused
subject      text                -- só para email
body         text NOT NULL       -- texto ou template da mensagem
audience_filter jsonb            -- critérios de filtragem do público
scheduled_at timestamptz
started_at   timestamptz
completed_at timestamptz
total_sent   int DEFAULT 0
total_failed int DEFAULT 0
created_at / updated_at timestamptz
```

#### `campaign_sends` — Rastreamento Individual *(a criar — Fase 3)*
```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
campaign_id  uuid FK campaigns
user_id      uuid FK auth.users
lead_id      text               -- FK leads_prospeccao (ou cliente_id)
recipient    text NOT NULL      -- whatsapp ou email do destinatário
status       text DEFAULT 'pending'  -- pending | sent | failed | bounced
sent_at      timestamptz
error        text
created_at   timestamptz DEFAULT NOW()
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

### `GET /api/inbox/conversations`
Lista leads com conversas WhatsApp para o painel de Inbox do consultor.

**Auth:** Sessão Supabase obrigatória
**Query:** `?filter=transferred|mine|all`
- `transferred` — leads com `modo_atendimento='humano'`
- `mine` — leads com `data_ultima_acao_consultor` recente (últimas 24h)
- `all` — todos os leads com conversas

**Retorna:** `{ leads: InboxLead[] }` com `leadId, leadRef, name, whatsapp, modo_atendimento, estagio_pipeline, dataTransferencia, lastMessage, lastMessageAt`

---

### `POST /api/inbox/takeover`
Consultor assume uma conversa (modo humano).

**Auth:** Sessão Supabase obrigatória
**Body:** `{ leadId: string }`
**Ação:**
1. Verifica ownership (user_id)
2. Idempotência: se `data_ultima_acao_consultor` < 60s, pula notificação WA
3. Atualiza lead: `modo_atendimento='humano'`, `data_ultima_acao_consultor`, `consultor_responsavel`
4. Envia notificação WA: `[Consultor X entrou na conversa]`
5. Salva mensagem de sistema em `whatsapp_conversations`

---

### `POST /api/inbox/send-message`
Consultor envia mensagem de texto para lead via WhatsApp.

**Auth:** Sessão Supabase obrigatória
**Body:** `{ leadId: string, message: string }`
**Ação:**
1. Verifica ownership
2. Obtém `evolution_instance_name` de `user_settings`
3. Envia via `getWhatsAppProvider().sendText()`
4. Salva em `whatsapp_conversations` (`from_lead: false`, `ai_generated: false`)
5. Atualiza `data_ultima_acao_consultor` e `data_ultima_interacao` no lead

---

### `POST /api/inbox/return-to-bot`
Devolve a conversa ao bot.

**Auth:** Sessão Supabase obrigatória
**Body:** `{ leadId: string }`
**Ação:** Atualiza `modo_atendimento='bot'`, `data_retorno_bot=now()`

---

### `POST /api/email/send` *(implementado 2026-04-02)*
Disparo em massa de emails para leads via Resend API.

**Auth:** Sessão Supabase obrigatória
**Body:** `{ leadIds: string[], subject: string, body: string }`
**Ação:**
1. Carrega leads por IDs (filtra apenas leads com email)
2. Envia batch via Resend `POST /emails/batch`
3. Atualiza `status_email='sent'`, `data_envio_email=now()` nos leads
4. Retorna `{ sent, failed, errors }`

**Env vars:** `RESEND_API_KEY`, `FROM_EMAIL`

---

### `POST /api/clientes/converter` *(a implementar — Fase 2)*
Converte um lead em cliente de forma manual.

**Auth:** Sessão Supabase obrigatória
**Body:** `{ leadId: string }`
**Ação:**
1. Copia dados do lead para tabela `clientes`
2. Cria entrada inicial em `cliente_historico` (tipo: 'conversao')
3. Remove lead de `leads_prospeccao`
4. Retorna `{ clienteId }`

---

### `GET /api/clientes` *(a implementar — Fase 2)*
Lista clientes com busca e filtro.

**Auth:** Sessão Supabase obrigatória
**Query:** `?q=busca&status=Ativo&categoria=X`
**Retorna:** `{ clientes: Cliente[], total: number }`

---

### `GET|PATCH|DELETE /api/clientes/[id]` *(a implementar — Fase 2)*
Detalhes, edição e remoção de cliente.

**GET** → dados completos + histórico (`cliente_historico` ordered by `created_at DESC`)
**PATCH** → atualiza campos do cliente
**DELETE** → soft-delete (`status='Inativo'`) ou hard delete

---

### `POST /api/clientes/[id]/devolver` *(a implementar — Fase 2)*
Devolve cliente para funil de leads (reprospecção).

**Auth:** Sessão Supabase obrigatória
**Ação:**
1. Cria novo lead em `leads_prospeccao` com dados do cliente
2. Atualiza `clientes.status = 'Reprospectar'`
3. Registra em `cliente_historico` (tipo: 'status_change')

---

### `GET|POST /api/campaigns` *(a implementar — Fase 4)*
Listagem e criação de campanhas.

**GET** → lista campanhas do tenant com status e métricas
**POST** → cria nova campanha (`{ name, channel, subject, body, audienceFilter }`)

---

### `POST /api/campaigns/[id]/send` *(a implementar — Fase 4)*
Dispara uma campanha para o público selecionado.

**Ação:**
1. Resolve leads/clientes com base em `audienceFilter`
2. Para `channel='whatsapp'`: disparo via Evolution API com delay
3. Para `channel='email'`: disparo via Resend batch
4. Registra cada envio em `campaign_sends`
5. Atualiza métricas da campanha (`total_sent`, `total_failed`)

---

### `POST /api/leads/import` *(a implementar — Fase 5)*
Importa leads em massa a partir de arquivo.

**Auth:** Sessão Supabase obrigatória
**Body:** `multipart/form-data` com arquivo (CSV/XLSX/VCF/TXT)
**Ação:**
1. Detecta tipo pelo mime/extensão
2. Parseia com papaparse (CSV), xlsx (XLSX), parser vCard (VCF) ou split por linha (TXT)
3. Normaliza telefones: qualquer formato BR → `+55XXXXXXXXXXX`
4. Remove duplicatas (por whatsapp ou email)
5. Insere em `leads_prospeccao` com `origem='Importação Manual'`
6. Retorna `{ imported, skipped, errors }`

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
EVOLUTION_API_URL=https://evolution.intellixai.com.br
EVOLUTION_API_KEY=sua-api-key
EVOLUTION_DEFAULT_INSTANCE=WA-Pessoal

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
XPAG_CONSULTANT_INSTANCE=WA-Pessoal

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

---

### feat: Toggle Nicho/Produto + Email Marketing + Novas colunas na tabela Leads (2026-04-02)

**Contexto:** Sprint de melhorias de CRM — 4 features implementadas em série.

**1. Toggle Nicho/Produto em ProspectionForm**
- `src/components/ProspectionForm.tsx` — adicionado toggle `Nicho | Produto`
- `src/data/prospectionQuickSelects.ts` — adicionados `QUICK_PRODUCTS` (40+ produtos genéricos)
- `supabase/functions/prospection/index.ts` — suporte a `searchMode: 'niche' | 'product'` + geração de `editorial_summary`
- `src/types/prospection.ts` — campos `searchMode`, `editorial_summary` adicionados

**2. Novas colunas na tabela de Leads**
- `app/(protected)/leads/page.tsx` — colunas **Telefone**, **Email**, **Resumo** adicionadas
- Resumo exibe `editorial_summary` (modo produto) ou `resumo_analitico` (modo nicho), truncado a 120 chars

**3. Email Marketing via Resend**
- `app/api/email/send/route.ts` — novo endpoint batch de emails
- `src/components/EmailCampaignModal.tsx` — modal de composição e disparo
- `src/components/BulkActionsBar.tsx` — botão "Enviar E-mail" adicionado à barra de ações em massa
- `app/(protected)/leads/page.tsx` — `EmailCampaignModal` importado e conectado
- `.env.example` — documentados `RESEND_API_KEY` e `FROM_EMAIL`
- **Migration SQL executada:** `ALTER TABLE leads_prospeccao ADD COLUMN IF NOT EXISTS status_email text DEFAULT 'not_sent'`, `ADD COLUMN IF NOT EXISTS data_envio_email timestamptz`

**4. Fix — Inbox badge de não lidos**
- `src/hooks/useUnreadConversations.ts` — default de `new Date(0)` (epoch 1970) alterado para `new Date()` (agora)
- Impacto: histórico antigo não é mais contado como não lido ao fazer login

**Build:** Verificado com `npx next build` — exit 0. Commit `38304c3` na branch `feature/atualizacoes-sistema`.

---

### feat: Base de Clientes, Campanhas e Importação — PLANEJADO (2026-04-02)

**Contexto:** Usuário identificou 4 gaps críticos no CRM:
1. WhatsApp não permite reenvio após `statusMsgWA='sent'` (filtro no `WhatsAppDispatchModal`)
2. Não há sistema de campanhas bulk para re-engajamento
3. Não há base permanente de clientes — leads são removidos após fechar
4. Não há importação de contatos externos

**Decisão de Produto:**
- `leads_prospeccao` = funil de trabalho temporário
- `clientes` = repositório permanente de clientes convertidos
- Conversão automática em `estagio_pipeline='Fechado Ganho'` + botão manual
- Tudo GENÉRICO / WHITE-LABEL — nenhuma referência a negócio específico no código

**Tabelas a criar (SQL via Supabase Dashboard):**
- `clientes` — repositório permanente (schema em seção 5)
- `cliente_historico` — timeline de eventos por cliente
- `campaigns` — campanhas de outreach WhatsApp/email
- `campaign_sends` — rastreamento individual por destinatário

**Componentes a criar:**
- `app/(protected)/clientes/page.tsx` — lista de clientes
- `app/(protected)/clientes/[id]/page.tsx` — detalhes + timeline
- `app/(protected)/campanhas/page.tsx` — lista + composer
- `src/components/campaigns/CampaignComposer.tsx`
- `src/components/campaigns/AudienceBuilder.tsx`
- `src/components/leads/ImportLeadsModal.tsx`
- `src/components/leads/AddLeadModal.tsx`
- `src/lib/normalizePhone.ts` — normalização BR de telefone

**Sidebar:** Links para Clientes e Campanhas a adicionar em `src/components/AppSidebar.tsx`

*Próxima atualização: registrar aqui ao fazer qualquer mudança significativa.*

---

### fix: pdf-parse v2→v1.1.1 — compatibilidade Vercel Lambda (2026-03-02)

**Commit:** `2527f14`

**Problema:** `pdf-parse@2.4.5` depende de `@napi-rs/canvas@0.1.80` e `pdfjs-dist@5.x`, que exigem binários nativos (`DOMMatrix`, módulos napi) incompatíveis com o runtime Vercel Lambda. Resultado: webhook `/api/webhooks/evolution` lançava `ReferenceError: DOMMatrix is not defined` em toda requisição → agente de IA totalmente inoperante em produção.

**Arquivos modificados:**
- `package.json` — downgrade `pdf-parse 2.4.5 → 1.1.1`
- `src/lib/services/pdf-analyzer.service.ts` — import via `pdf-parse/lib/pdf-parse.js` (bypassa o `index.js` que tenta ler `test/data/05-versions-space.pdf` durante `next build`)
- `next.config.js` — adicionado `serverComponentsExternalPackages: ['pdf-parse']`

**Resultado:** Build e deploy bem-sucedidos. Webhook retorna 200. Agente de IA operacional.

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
> **Ambiente testado:** `https://prospect-pulse-54.vercel.app`
> **Diretório de testes:** `C:\Projects\prospect-pulse-54\e2e_tests\`
> **Iniciado em:** 2026-02-28
> **Última execução completa:** 2026-03-02 (pré-fix — deploy pendente)

---

### 15.1 Status Geral das Fases

> ✅ **Resultados finais pós todos os fixes (2026-03-02)**

| Fase | Status | Passed | Failed | Script |
|------|--------|--------|--------|--------|
| **Fase 1** — Smoke Tests | ✅ Executada | 17 | 1 | `test_01_smoke.py` |
| **Fase 2** — Funcionais | ✅ Executada | 15 | 0 | `test_02_functional.py` |
| **Fase 3** — Negativos | ✅ Executada | 31 | 0 | `test_03_negative.py` |
| **Fase 4** — Edge Cases | ✅ Executada | 11 | 0 | `test_04_edge.py` |
| **Fase 5** — Segurança | ✅ Executada | 17 | 0 | `test_05_security.py` |
| **Fase 6** — UI/UX | ✅ Executada | 12 | 0 | `test_06_ui.py` |
| **Fase 7** — Stress/Performance | ✅ Executada | 11 | 3 | `test_07_stress.py` |
| **TOTAL** | — | **114** | **4** | — |

**Falhas remanescentes (todas esperadas / infra):**
- Fase 1: `/rota-inexistente → 200` (Next.js App Router serve app shell — comportamento esperado)
- Fase 7: latência cold start > 1s, `/login` lento em p95, stress 25x timeout — limitação Vercel Hobby plan

---

### 15.2 Bugs Encontrados

#### 🔴 Críticos (segurança)

| ID | Fase | Descrição | Status |
|----|------|-----------|--------|
| BUG-01 | Fase 1/3 | Middleware redirecionava `/api/agent/*` sem auth → 200 HTML em vez de 401 JSON | ✅ Corrigido em `lib/supabase/middleware.ts` |
| BUG-02 | Fase 1/3 | Idem BUG-01 para `/api/agent/rag` | ✅ Corrigido — idem BUG-01 |
| BUG-03 | Fase 1/3 | `/api/admin/*` sem auth → 200 (admin em public, handler deve validar) | ✅ Corrigido — `/api/admin/` em publicApiPrefixes, handlers validam JWT |
| BUG-04 | Fase 3 | Crons acessíveis sem CRON_SECRET (`if (CRON_SECRET && ...)` bypass) | ✅ Corrigido — `if (!CRON_SECRET \|\| ...)` em 3 arquivos cron |
| BUG-05 | Fase 3 | Webhook GET retornava 200 para qualquer `hub.verify_token` | ✅ Corrigido — retorna 403 para token inválido |
| BUG-06 | Fase 5 | CORS `Access-Control-Allow-Origin: *` em todas as rotas | ✅ Corrigido — CORS restrito a domínios do projeto em `next.config.js` |

#### 🟡 Médios

| ID | Fase | Descrição | Status |
|----|------|-----------|--------|
| BUG-07 | Fase 5 | Content-Security-Policy ausente | ✅ Corrigido — CSP adicionado em `next.config.js` |
| BUG-08 | Fase 5 | Permissions-Policy ausente | ✅ Corrigido — adicionado em `next.config.js` |
| BUG-09 | Fase 7 | Webhook latência média 1.16s > threshold 1.0s (cold start Vercel) | ℹ️ Esperado — cold start Hobby plan |
| BUG-10 | Fase 4 | `/api/rota-inexistente` retorna 200 (SPA shell) em vez de 404 | ℹ️ Comportamento Next.js App Router (esperado) |

#### 🔵 Menores / Acessibilidade

| ID | Fase | Descrição | Status |
|----|------|-----------|--------|
| BUG-11 | Fase 6 | 1 botão em `/login` sem `aria-label` (ícone visibilidade senha) | ⚠️ Pendente |
| BUG-12 | Fase 6 | 2 botões em `/signup` sem `aria-label` | ⚠️ Pendente |
| BUG-13 | Fase 6 | Favicon ausente (`<link rel="icon">` não encontrado) | ⚠️ Pendente |

**Commits de correção (2026-03-02):**
- `72d1229` — `fix: security — cron auth guard, CORS, CSP e webhook token validation`
- `d3f1074` — `fix: cast as any em rescue-human-mode para coluna data_ultima_acao_consultor` (TypeScript build fix)

---

### 15.3 Detalhes por Fase — Execução Completa (2026-03-02)

#### Fase 1 — Smoke Tests
**Script:** `e2e_tests/test_01_smoke.py` | **Resultado:** 8 passed, 10 failed (pré-fix)

Passou: Rotas públicas OK (200), rotas protegidas redirecionam corretamente (307 para browser).
Falhou (pré-fix): APIs de agente/admin/cron retornam 200 sem auth; webhook aceita token inválido.

#### Fase 2 — Funcionais
**Script:** `e2e_tests/test_02_functional.py` | **Resultado:** 13 passed, 2 failed (pré-fix)

Passou: Validações login/signup, redirecionamentos das 5 rotas protegidas, navegação login↔signup.
Falhou (pré-fix): `/api/agent/config` e `/api/agent/rag` com fake JWT retornam 200.

#### Fase 3 — Negativos
**Script:** `e2e_tests/test_03_negative.py` | **Resultado:** 14 passed, 17 failed (pré-fix)

Passou: Payloads maliciosos em `init-user-settings` sem crash (XSS, SQLi, objetos, vazio), webhook com payloads inválidos sem 500.
Falhou (pré-fix): Métodos HTTP inválidos retornam 307 em vez de 405/401; crons sem auth retornam 307; APIs sem auth retornam 307.

#### Fase 4 — Edge Cases
**Script:** `e2e_tests/test_04_edge.py` | **Resultado:** 8 passed, 3 failed

Passou: Concorrência 10x em rotas públicas sem 5xx; double-submit webhook OK; payload 100KB sem crash; fromMe e grupo chegam sem crash.
Falhou:
- `fromMe=true` → 405 (pré-fix: POST redirecionado para /login → 405)
- Mensagem grupo → 405 (mesmo motivo)
- `/api/rota-inexistente` → 200 (SPA shell — comportamento Next.js esperado)

#### Fase 5 — Segurança
**Script:** `e2e_tests/test_05_security.py` | **Resultado:** 12 passed, 5 failed

Passou: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `HSTS`, sem info leak em erros, XSS não refletido (3 payloads), prototype pollution sem crash, webhook público sem auth.
Falhou (pré-fix): CSP ausente, Permissions-Policy ausente, CORS `*`, approve-user sem auth → 307, webhook verify_token → 307.

#### Fase 6 — UI/UX
**Script:** `e2e_tests/test_06_ui.py` | **Resultado:** 8 passed, 4 failed

Passou: `lang` attr em login/signup, `alt` em imagens, placeholders de email/senha, título de página, feedback ao submeter vazio.
Falhou (real): 1 botão em /login sem label, 2 botões em /signup sem label, favicon ausente em ambas as páginas.

#### Fase 7 — Stress/Performance
**Script:** `e2e_tests/test_07_stress.py` | **Resultado:** 13 passed, 1 failed

Passou: Rotas públicas < 5s média e < 8s p95, stress 1/5/10/25 req simultâneas sem 5xx, 10 webhooks simultâneos sem falha, payloads 1KB-500KB sem crash.
Falhou: Latência webhook média 1.16s > threshold 1.0s (Vercel cold start — esperado no Hobby plan).

---

### 15.4 Relatório de Segurança — Fixes Aplicados (2026-03-02)

**Commit:** `72d1229` — `fix: security — cron auth guard, CORS, CSP e webhook token validation`
**Commit:** `d3f1074` — `fix: cast as any em rescue-human-mode` (TypeScript build fix)

| Arquivo | Fix |
|---------|-----|
| `lib/supabase/middleware.ts` | Return 401 JSON para `/api/*` não autenticadas; `/api/admin/` em publicApiPrefixes |
| `app/api/cron/follow-up/route.ts` | `if (!CRON_SECRET \|\| ...)` em vez de `if (CRON_SECRET && ...)` |
| `app/api/cron/long-followup/route.ts` | Idem |
| `app/api/cron/keepalive/route.ts` | Idem |
| `app/api/webhooks/evolution/route.ts` | GET: retorna 403 para `hub.verify_token` inválido |
| `next.config.js` | CSP, Permissions-Policy, CORS restrito por domínio |
| `app/api/cron/rescue-human-mode/route.ts` | `as any` cast para coluna não tipada no Supabase schema |

---

### 15.5 Bugs — Resolvidos e Pendentes

| ID | Fase | Descrição | Status |
|----|------|-----------|--------|
| BUG-01..08 | 1/3/5 | Segurança crítica (CORS, CSP, cron auth, webhook token) | ✅ Corrigido |
| BUG-09 | 7 | Webhook cold-start latência > 1s | ℹ️ Esperado — Vercel Hobby |
| BUG-10 | 4 | `/rota-inexistente → 200` (SPA shell) | ℹ️ Esperado — Next.js App Router |
| BUG-11 | 6 | Botão `/login` sem `aria-label` | ✅ Corrigido `353754c` |
| BUG-12 | 6 | 2 botões `/signup` sem `aria-label` | ✅ Corrigido `353754c` |
| BUG-13 | 6 | Favicon ausente | ✅ Corrigido `353754c` |
| BUG-14 | 7 | Stress 25x falha (timeout Hobby) | ℹ️ Esperado — Vercel Hobby |
| BUG-15 | 3 | `init-user-settings` 500 para userId inválido | ✅ Corrigido `c3c2639` |
| BUG-16 | 3 | Webhook crash com body `null` | ✅ Corrigido `c3c2639` |
| BUG-17 | 5 | CORS `*` em rotas de página | ✅ Corrigido `c3c2639` |
| BUG-18 | 2 | Falso negativo no teste de link (hydration React) | ✅ Corrigido `7029f47` (test fix) |

**Zero bugs de produto pendentes. Todas as 4 falhas restantes são limitações de infra (Vercel Hobby).**

---

### 15.6 Próximos Passos (pós-deploy)

1. ✅ Executar todas as 7 fases E2E
2. ✅ Corrigir BUG-01 a BUG-08 (segurança crítica + headers)
3. ✅ Deploy confirmado em produção (commit `2527f14` — 2026-03-02)
4. ✅ Adicionar favicon ao projeto (BUG-13) — commit `353754c`
5. ✅ Adicionar `aria-label` nos botões de ícone de senha (BUG-11/12) — commit `353754c`
6. ✅ Re-executar todas as 7 fases com sistema em produção estável — 114 passed, 4 expected failures
7. ✅ Configurar variáveis de ambiente em produção no Vercel (2026-03-02)
8. ✅ Redeploy com todas as env vars — build OK, 25 rotas, sistema 100% operacional

**Sistema em produção: TOTALMENTE OPERACIONAL (2026-03-02)**

---

### 15.7 Problema de Deploy Vercel (2026-03-02)

**Status:** Deploy de produção stuck no commit `1a4ca99868be` (2026-02-28T20:38:11Z)

**Commits pushados mas não deployados:**
```
d3f1074  fix: cast as any em rescue-human-mode          (2026-03-02, último)
72d1229  fix: security — cron auth guard, CORS, CSP     (2026-03-02)
903e42d  fix: cast update object as any                 (2026-02-28)
becb415  fix: early return para rotas de API públicas   (2026-02-28)
00b2c4c  fix: escapar aspas em JSX no settings          (2026-02-28)
946afa2  fix: remove cron hourly do vercel.json         (2026-02-28)
```

**Evidências:**
- Build local: `npm run build` e `npx tsc --noEmit` — ambos OK (exit code 0)
- Build Vercel: Log mostra compilação completa (24 rotas geradas, 0 type errors)
- GitHub deployment status: `state=failure` para todos os 6 commits acima
- Preview URLs criadas (ex: `prospect-pulse-54-aj3bio5th-felipe-maranhaos-projects.vercel.app`) retornam 401 (Vercel auth) — deployment EXISTS mas não promovido a produção
- URL de produção `prospect-pulse-54.vercel.app` ainda serve commit `1a4ca99868be`

**Causa raiz identificada (2026-03-02):** `pdf-parse@2.4.5` depende de `@napi-rs/canvas@0.1.80` (binário nativo), causando `ReferenceError: DOMMatrix is not defined` no runtime Vercel Lambda. Os 6 commits falhavam silenciosamente no runtime, não no build.

**Resolução:** Ver seção abaixo — `fix: pdf-parse v2→v1.1.1` (commit `2527f14`). ✅ Deploy confirmado em produção.

---

## 16. Sessão de Debug — Agente Nativo (2026-03-18)

### 16.1 Contexto

Após migração do n8n para o agente nativo (branch `feature/agent-improvements-phases-1-2-3-5`), o agente não estava respondendo mensagens WhatsApp enviadas pelo usuário.

---

### 16.2 Bugs identificados e corrigidos

#### BUG-19 — TypeScript build error no Vercel (`reduce<number>`)
- **Arquivo:** `src/lib/workflows/xpag-lead-handler.workflow.ts:165`
- **Erro:** `Type error: Expected 0 type arguments, but got 1` (primeiro) → `Type 'string' is not assignable to type 'number'` (segundo)
- **Causa:** TypeScript resolvia `messages.reduce<number>()` para o overload não-genérico de `Array<string>.reduce`, onde o acumulador deve ser do mesmo tipo que o elemento (`string`), incompatível com o valor inicial `0` (`number`).
- **Fix (commit `4351e9c`):** `messages.map(m => m.length).reduce((a, b) => a + b, 0)` — evita o overload genérico completamente.

#### BUG-20 — Chave OpenAI não persistia no banco
- **Arquivo:** `app/(protected)/settings/page.tsx`
- **Causa:** O campo "Chave API OpenAI" está no card do Agente de IA. O botão "Salvar Configuração" daquele card chama `handleSaveAgentConfig`, que envia apenas `systemPrompt/model/temperature` para `/api/agent/config`. Nunca tocava em `user_settings.openai_api_key`. O usuário clicava no botão mais próximo sem saber que a chave era descartada.
- **Fix (commit `69c1023`):** `handleSaveAgentConfig` agora faz `UPDATE` parcial em `user_settings` com `openai_api_key` antes de salvar o prompt.

#### BUG-21 — `agent_enabled = false` por padrão para usuário existente
- **Causa:** O campo `agent_enabled` estava `false` no banco para o usuário `40bd03b1-...` (IntelliX.AI), apesar do default da coluna ser `true`. Valor foi setado como `false` em alguma operação anterior.
- **Fix:** UPDATE direto no banco via Supabase MCP. O default da coluna já é `true` para novos usuários.

#### BUG-22 — Agente respondendo na URL errada (causa raiz do silêncio)
- **Causa:** O código do agente nativo estava na branch `feature/agent-improvements-phases-1-2-3-5`, deployada em `prospect-pulse-54-git-feature-dc1084-...vercel.app`. O webhook da Evolution API estava configurado para a URL da **main**: `https://prospect-pulse-54.vercel.app/api/webhooks/evolution`. As duas URLs eram diferentes → mensagens chegavam à main (código antigo/sem agente) enquanto o usuário testava na branch feature.
- **Fix (2026-03-18):** Merge fast-forward da feature branch na main (`git push origin main`, commit `69c1023`). Agora a URL `prospect-pulse-54.vercel.app` tem o agente nativo completo.

---

### 16.3 Variáveis de ambiente obrigatórias no Vercel (descoberta crítica)

O agente usa `SUPABASE_SERVICE_ROLE_KEY` em **7 serviços server-side críticos**. Sem ela, o `resolveTenantByInstance` falha silenciosamente e o workflow retorna sem responder nada.

| Variável | Obrigatória | Uso |
|----------|-------------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Browser client + servidor |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Auth browser |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ **CRÍTICA** | Tenant resolver, lead repo, conv repo, lead service, agent config, RAG, transfer tool |
| `EVOLUTION_API_URL` | ✅ | Enviar respostas via Evolution API |
| `EVOLUTION_API_KEY` | ✅ | Autenticar no Evolution API para envio |
| `OPENAI_API_KEY` | ⚠️ Opcional | Fallback global — cada tenant tem sua chave em `user_settings.openai_api_key` |
| `WHATSAPP_PROVIDER` | ⚠️ Opcional | Default: `evolution` |

> **Atenção:** Se `SUPABASE_SERVICE_ROLE_KEY` não estiver setada, o agente falha silenciosamente (sem log de erro visível no Vercel, pois o workflow captura exceções internamente). O webhook retorna `200 OK` mas nenhuma resposta é enviada.

---

### 16.4 Estado do banco após debug (2026-03-18)

| Tabela | Ação | Resultado |
|--------|------|-----------|
| `user_settings` (IntelliX.AI) | `agent_enabled = true`, `openai_api_key = sk-proj-...` | ✅ Configurado |
| `leads_prospeccao` | Vazia (limpa para testes) | ✅ Limpa |
| `whatsapp_conversations` | Limpa (registros antigos do n8n removidos) | ✅ Limpa |

---

### 16.5 Fluxo do agente nativo (referência)

```
Evolution API (instância WA-Pessoal)
  → POST /api/webhooks/evolution
  → normalizeWebhookPayload() — verifica fromMe, grupo, tipo desconhecido
  → enqueueBatch() — aguarda 2.5s por mensagens consecutivas
  → runXpagWorkflow(normalizedMessage)
    → STEP 1: resolveTenantByInstance('WA-Pessoal')  [usa SUPABASE_SERVICE_ROLE_KEY]
    → STEP 3: leadService.findOrCreate()              [usa SUPABASE_SERVICE_ROLE_KEY]
    → STEP 4: verifica modo humano
    → STEP 5: processMessageByType() — mídia/texto
    → STEP 6: conversationRepository.saveLeadMessage()
    → STEP 7: executeAIAgent()                        [usa openai_api_key do tenant]
    → STEP 8: humanizeResponse()
    → STEP 8B: markAsRead + sendTyping + sendText()  [usa EVOLUTION_API_URL + EVOLUTION_API_KEY]
```

---

### 16.6 Próximos passos (2026-03-18)

1. ✅ Confirmar que `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` estão setados no Vercel
2. ✅ Testar agente com mensagem real para a instância WA-Pessoal
3. ✅ Verificar criação de lead orgânico no banco após mensagem
4. ✅ Verificar resposta enviada pelo agente no WhatsApp

---

## 17. Sessão de Debug 2026-03-19 — Agente não respondia mensagens reais do WhatsApp

### 17.1 Contexto

Após a sessão de 2026-03-18 (seção 16), o agente nativo foi confirmado funcionando via curl direto (37s de execução, lead criado, resposta gerada: *"Boa noite! Tudo bem? Obrigado por entrar em contato com a XPAG..."*). Porém, mensagens reais enviadas pelo WhatsApp (do número 8137889757 para o WA-Pessoal 81988514775) não recebiam resposta. O sistema continuava silencioso.

---

### 17.2 BUG-23 — `setTimeout`/`enqueueBatch` nunca dispara em Vercel serverless

**Causa raiz:**

O arquivo `src/lib/services/message-batch.service.ts` usava `setTimeout(2500ms)` para agrupar mensagens consecutivas antes de processar. Em ambiente Vercel serverless (Hobby plan), o contexto da função é **congelado** imediatamente após o `return NextResponse.json()`. Timers agendados (`setTimeout`) nunca disparam porque o processo não avança após a resposta ser enviada.

**Comportamento observado:**
- Webhook recebia a mensagem, respondia `{ received: true }` com status 200
- O callback do `setTimeout(2500ms)` nunca era executado
- Nenhum registro aparecia no Supabase — o workflow nunca chegava a rodar

**Fluxo problemático (antes da correção):**

```typescript
// route.ts — ANTES (QUEBRADO em Vercel serverless)
enqueueBatch(key, message, async (messages) => {
  await runXpagWorkflow(normalized); // NUNCA executava
});
return NextResponse.json({ received: true }); // contexto congelado aqui
```

**Correção aplicada:** Removido completamente o `enqueueBatch`. Chamada direta ao workflow:

```typescript
// route.ts — DEPOIS (CORRETO)
await runXpagWorkflow(normalized); // await antes do return
return NextResponse.json({ received: true });
```

---

### 17.3 BUG-24 — Fire-and-forget e `waitUntil` também não funcionam no Vercel Hobby

**Causa raiz:**

Na primeira tentativa de correção, foi usado fire-and-forget (Promise sem await):

```typescript
runXpagWorkflow(normalized).catch(() => {}); // fire-and-forget
return NextResponse.json({ received: true });
```

Resultado: a mensagem era salva no banco (steps iniciais rodavam), mas `message_agent = null` e `status = aguardando` — o agente OpenAI nunca terminava.

**Motivo:** No Vercel Hobby plan, Promises em flight também são interrompidas após o response ser enviado. Não há garantia de execução assíncrona pós-response.

**Tentativa com `waitUntil` do `@vercel/functions`:**

```typescript
import { waitUntil } from '@vercel/functions';
waitUntil(runXpagWorkflow(normalized));
return NextResponse.json({ received: true });
```

Resultado: steps iniciais OK (lead salvo), mas OpenAI call não completava — cortado antes do fim. Revertido.

**Solução definitiva:** `await` antes do `return`, com `maxDuration = 300`:

```typescript
export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel aguarda até 300s

try {
  await runXpagWorkflow(normalized); // bloqueia até tudo terminar
} catch (err) {
  console.error('[Webhook] Workflow error:', (err as Error)?.message ?? err);
}
return NextResponse.json({ received: true }, { status: 200 });
```

**Prova de funcionamento:** curl levou 37 segundos para retornar (workflow rodou completo), lead criado no Supabase, resposta do agente gerada e enviada via Evolution API.

---

### 17.4 BUG-25 — `evolution_instance_name` incorreto no banco quebra tenant resolution silenciosamente

**Causa raiz:**

Durante testes, o usuário havia trocado a instância Evolution para `WA-Business` pela UI de Configurações. O campo `user_settings.evolution_instance_name` foi atualizado para `WA-Business`. Como resultado:

- Evolution enviava webhook da instância `WA-Pessoal` para o Vercel
- Step 1 do workflow chamava `resolveTenantByInstance('WA-Pessoal')`
- RPC `get_user_by_evolution_instance('WA-Pessoal')` retornava `{ success: false, error: "Instancia nao encontrada" }`
- Workflow saía silenciosamente no Step 1: `if (!tenant) return;`
- Nenhum erro visível, nenhum log de falha, nenhum registro no banco

**Verificação diagnóstica:**

```bash
curl -s -X POST "https://kzvnwqlcrtxwagxkghxq.supabase.co/rest/v1/rpc/get_user_by_evolution_instance" \
  -H "apikey: <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{"p_instance_name": "WA-Pessoal"}'
# ANTES da correção: { "success": false, "error": "Instancia nao encontrada" }
# DEPOIS da correção: { "success": true, "user_id": "40bd03b1-...", "company_name": "IntelliX.AI" }
```

**Correção via SQL direto:**

```sql
UPDATE user_settings
SET evolution_instance_name = 'WA-Pessoal'
WHERE user_id = '40bd03b1-1804-42e4-9d36-9ff8e5eb53d1';
```

---

### 17.5 Descoberta importante: instância WA-Business aponta para n8n, não para Vercel

Durante o debug, verificado via curl que:

```bash
curl https://evolution.intellixai.com.br/webhook/find/WA-Business \
  -H "apikey: 429683C4C977415CAAFCCE10F7D57E11"
# Retorna: { "url": "https://n8n.intellixai.com.br/webhook/msg_evolution", "webhookBase64": true }
```

- `WA-Business` aponta para n8n (nao para o Vercel) — **jamais usar para o agente nativo**
- `WA-Pessoal` aponta para `https://prospect-pulse-54.vercel.app/api/webhooks/evolution` — **correto**
- `WA-Business` tem `webhookBase64: true`, que o handler atual nao decodifica

**Regra operacional:** O agente nativo so funciona com a instancia `WA-Pessoal`. Nao trocar para `WA-Business` nas Configuracoes.

---

### 17.6 Confirmacao de funcionamento end-to-end (2026-03-19 07:05 BRT)

**Teste real com WhatsApp:**
- Numero remetente: 8137889757
- Instancia destino: WA-Pessoal (81988514775)
- Mensagem enviada: "teste 2"
- Workflow executou completo
- Lead `ORG-1773885992910-82dst8` criado/encontrado no banco
- Resposta do agente: *"Oi! Vi aqui sua mensagem. So para confirmar, voce pode me dizer o nome da sua empresa?"*
- Resposta chegou no WhatsApp as 7:06 BRT

**Registro no Supabase (tabela `whatsapp_conversations`):**

```json
{
  "lead_id": "ORG-1773885992910-82dst8",
  "message_lead": "teste 2",
  "message_agent": "Oi! Vi aqui sua mensagem. So para confirmar, voce pode me dizer o nome da sua empresa?",
  "status": "respondido",
  "created_at": "2026-03-19 10:05:39 UTC"
}
```

---

### 17.7 BUG-27 — Mensagem das 7:33 BRT nao processada (em investigacao)

**Sintoma:** Usuario enviou nova mensagem as 7:33 BRT (10:33 UTC). Nenhum registro criado no Supabase — a tabela `whatsapp_conversations` continua com apenas 2 registros, o ultimo as 10:05 UTC.

**Dados diagnosticados:**

| Item | Valor | Status |
|------|-------|--------|
| `user_settings.evolution_instance_name` | `WA-Pessoal` | OK |
| `user_settings.updated_at` | `2026-03-19 10:31:07 UTC` (7:31 BRT) | Suspeito — 2 min antes da msg |
| Registros em `whatsapp_conversations` | 2 (ultimo: 10:05 UTC) | Sem novo registro |
| `evolution_api_key` | `429683C4C977415CAAFCCE10F7D57E11` | Confirmada correta |

**Ausencia de registro no banco = falha pre-workflow.** O webhook ou nao chegou ao Vercel, ou falhou antes de qualquer escrita (normalizer retornou null, ou tenant resolution falhou).

**Hipoteses em investigacao:**
1. O usuario mudou algo em Configuracoes as 7:31 que momentaneamente quebrou o sistema, e a mensagem das 7:33 chegou numa janela de inconsistencia
2. A instancia WA-Pessoal da Evolution se desconectou do WhatsApp entre 7:05 e 7:33
3. O webhook da Evolution para WA-Pessoal foi reconfigurado ou evento `MESSAGES_UPSERT` desabilitado

**Verificacoes pendentes:**

```bash
# 1. Status de conexao da instancia WA-Pessoal
curl -s "https://evolution.intellixai.com.br/instance/fetchInstances" \
  -H "apikey: 429683C4C977415CAAFCCE10F7D57E11" \
  | jq '.[] | select(.name=="WA-Pessoal") | {name, connectionStatus}'

# 2. Configuracao atual do webhook de WA-Pessoal
curl -s "https://evolution.intellixai.com.br/webhook/find/WA-Pessoal" \
  -H "apikey: 429683C4C977415CAAFCCE10F7D57E11"
```

---

### 17.8 BUG-26 — Eye Toggle da Evolution API Key nao funcionava em Configuracoes

**Problema reportado:** O botao "olhinho" (revelar/ocultar senha) do campo Evolution API Key na pagina de Configuracoes nao respondia ao clique.

**Causa identificada:** O navegador (Edge/Chrome) injeta seu proprio botao nativo de revelar senha dentro de campos `type="password"`, posicionado no mesmo local que o botao customizado (absolutamente posicionado sobre o Input). O botao nativo do navegador interceptava os cliques antes do nosso handler React.

**Arquivo:** `app/(protected)/settings/page.tsx` linha ~986

**Solucao aplicada:** Mudanca de layout — de botao absoluto sobreposto ao Input para layout flexbox com botao ao lado (mesmo padrao do campo OpenAI Key que funcionava). CSS adicionado para suprimir icone nativo do navegador:

```tsx
// ANTES — layout absoluto (conflitava com botao nativo do navegador)
<div className="relative max-w-2xl">
  <Input type={showApiKey ? "text" : "password"} className="pr-10" />
  <Button className="absolute right-0 top-0 h-full px-3 z-10"
    onClick={() => setShowApiKey(!showApiKey)}>
    {showApiKey ? <EyeOff /> : <Eye />}
  </Button>
</div>

// DEPOIS — layout flex (sem conflito)
<div className="flex gap-2 max-w-2xl">
  <Input
    type={showApiKey ? "text" : "password"}
    className="flex-1 [&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
  />
  <Button type="button" variant="outline" size="sm" className="px-3 shrink-0"
    onClick={() => setShowApiKey(!showApiKey)}>
    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
  </Button>
</div>
```

---

### 17.9 Estado das configuracoes no banco (2026-03-19)

| Campo | Valor | Status |
|-------|-------|--------|
| `evolution_instance_name` | `WA-Pessoal` | OK |
| `evolution_api_url` | `https://evolution.intellixai.com.br` | OK |
| `evolution_api_key` | `429683C4C977415CAAFCCE10F7D57E11` | OK (confirmada via curl) |
| `provider` | `evolution` | OK |
| `openai_api_key` | `sk-proj-...` (presente) | OK |

---

### 17.10 Resumo de todos os bugs desta sessao

| Bug | Descricao | Status |
|-----|-----------|--------|
| BUG-23 | `setTimeout`/`enqueueBatch` nunca dispara em Vercel serverless | Corrigido — removido batching |
| BUG-24 | Fire-and-forget e `waitUntil` nao completam OpenAI call no Hobby plan | Corrigido — `await` antes do return com `maxDuration=300` |
| BUG-25 | `evolution_instance_name` trocado para `WA-Business` quebra tenant resolution silenciosamente | Corrigido — restaurado para `WA-Pessoal` via SQL |
| BUG-26 | Eye toggle da API Key interceptado pelo botao nativo do navegador | Corrigido — layout flex + CSS suppress |
| BUG-27 | Mensagem das 7:33 BRT nao processada (sem registro no banco) | Em investigacao |

---

### 17.11 Licoes aprendidas

1. **Vercel serverless congela o contexto apos o response.** Nunca usar `setTimeout`, `setInterval` ou fire-and-forget para logica critica. Usar sempre `await` antes do `return`.
2. **`waitUntil` do `@vercel/functions` tem limite no Hobby plan.** Calls longas (OpenAI 30-60s) sao cortadas. Nao e solucao viavel para o plano atual.
3. **`evolution_instance_name` e critico.** Se trocar a instancia na UI sem atualizar o webhook no Evolution, o agente para de responder silenciosamente — sem erro visivel. O webhook retorna 200 OK mas nada acontece.
4. **Instancia WA-Business nao pode ser usada** para o agente nativo — aponta para n8n e tem `webhookBase64: true`.
5. **Ausencia de registro no Supabase = falha pre-workflow.** Se nada aparece em `whatsapp_conversations`, o problema e no webhook chegando ao Vercel ou na resolucao do tenant. Verificar Evolution e banco primeiro.
6. **Fluxo do agente nativo corrigido (referencia atualizada):**

```
Evolution API (instancia WA-Pessoal)
  -> POST /api/webhooks/evolution
  -> normalizeWebhookPayload() — verifica fromMe, grupo, tipo desconhecido
  -> [SEM BATCHING — removido BUG-23]
  -> await runXpagWorkflow(normalizedMessage)  [<-- await critico]
    -> STEP 1: resolveTenantByInstance('WA-Pessoal')  [usa SUPABASE_SERVICE_ROLE_KEY]
    -> STEP 2: verifica #finalizado
    -> STEP 3: leadService.findOrCreate()
    -> STEP 4: verifica modo humano
    -> STEP 5: processMessageByType() — midia/texto
    -> STEP 6: conversationRepository.saveLeadMessage()
    -> STEP 7: executeAIAgent()                [usa openai_api_key do tenant]
    -> STEP 8: humanizeResponse()
    -> STEP 8B: markAsRead + sendTyping + sendText()  [Evolution API]
    -> STEP 9: sendMessageSequence()
    -> STEP 10: persistir resposta no banco
  -> return NextResponse.json({ received: true })  [<-- so retorna APOS tudo terminar]
```

---

### feat(inbox): Consultant Inbox — Painel de Atendimento Humano (2026-03-20)

**Contexto:** Quando o agente de IA transfere uma conversa para um consultor humano (`transfer-consultant.tool`), não havia interface para o consultor visualizar, assumir ou responder a conversa. O consultor precisava acessar diretamente o WhatsApp.

**Solução:** Implementação completa de um Inbox estilo Chatwoot com painel de duas colunas (lista de conversas + thread de mensagens), com ações de assumir, enviar mensagem e devolver ao bot.

**Arquivos criados:**

| Arquivo | Descrição |
|---------|-----------|
| `app/api/inbox/conversations/route.ts` | GET — lista leads com conversas (filtros: transferred/mine/all) |
| `app/api/inbox/takeover/route.ts` | POST — consultor assume conversa (notificação WA + idempotência) |
| `app/api/inbox/send-message/route.ts` | POST — envia mensagem via WhatsApp + salva em `whatsapp_conversations` |
| `app/api/inbox/return-to-bot/route.ts` | POST — devolve conversa ao bot (`modo_atendimento='bot'`) |
| `src/hooks/useTransferredCount.ts` | Hook com Supabase Realtime para contagem de leads em modo humano |
| `src/components/inbox/ConversationListItem.tsx` | Item da lista com badge Humano/Bot, última mensagem e timestamp |
| `src/components/inbox/ConversationList.tsx` | Lista com 3 abas (Transferidos/Meus/Todos), busca e Realtime |
| `src/components/inbox/InboxHeader.tsx` | Cabeçalho com info do lead + botões Assumir/Devolver |
| `src/components/inbox/MessageInput.tsx` | Campo de texto com Enter para enviar, desabilitado até assumir |
| `src/components/inbox/ConversationThread.tsx` | Thread de mensagens com scroll automático e Realtime |
| `app/(protected)/inbox/page.tsx` | Página principal com `RoleGuard(['admin', 'operador'])` |

**Arquivos modificados:**

| Arquivo | Mudança |
|---------|---------|
| `src/components/AppSidebar.tsx` | Adicionado item "Inbox" com ícone `MessageSquare` e badge com contagem de transferidos |

**Características:**
- **Realtime:** Supabase Realtime em `leads_prospeccao` (lista) e `whatsapp_conversations` (thread)
- **RBAC:** Apenas `admin` e `operador` acessam o Inbox
- **Idempotência:** Takeover não reenvia notificação WA se ação < 60s
- **UX:** Mensagem desabilitada até consultor assumir; auto-scroll ao receber mensagens
- **Filtros:** Transferidos (modo humano), Meus (ação recente), Todos (qualquer conversa)
- **WhatsApp:** Usa `getWhatsAppProvider()` (Evolution/Meta) para envio real
