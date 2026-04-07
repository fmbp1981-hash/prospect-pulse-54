# LeadFinder Pro — Especificação Viva

> **Versão:** 2.0 — 2026-04-07
> **Status:** Produção ativa em `alpha.dualite.dev`
> **Produto:** Sistema de prospecção e qualificação de leads B2B com agente IA WhatsApp

---

## Overview
LeadFinder Pro é uma plataforma SaaS multi-tenant que automatiza a prospecção de leads (Google Places), o atendimento qualificado via WhatsApp com agente IA (OpenAI GPT-4.1) e a gestão do pipeline comercial em Kanban. Elimina dependência de n8n — toda a lógica roda em TypeScript nativo no Next.js.

---

## [/] — Prospecção

### Components
- **ProspectionForm**: Formulário com nicho/produto, localização e quantidade; dispara Edge Function
- **QuickSelectNiches**: Chips de seleção rápida de nicho
- **QuickSelectLocations**: Chips de seleção rápida de localização
- **SearchHistory**: Histórico de prospecções anteriores

### Behaviors
- **prospeccao-por-nicho**: Busca por Google Places + enriquecimento OpenAI → leads salvos
- **prospeccao-por-produto**: Toggle produto: busca com searchMode='product'

---

## [/leads] — Gestão de Leads

### Components
- **LeadTable**: Tabela com filtros, ordenação, busca
- **LeadDetailDrawer**: Drawer de detalhes + histórico de conversa
- **LeadEditModal**: Edição de campos do lead
- **BulkActionsBar**: Ações em massa selecionadas
- **WhatsAppDispatchModal**: Envio manual de WhatsApp
- **ExportModal**: Export CSV/Excel
- **EmailCampaignModal**: Disparo de email em massa via Resend
- **ImportLeadsModal**: Importação CSV/XLSX/VCF

### Behaviors
- **filtrar-leads**: Filtro por status, estágio, cidade, categoria
- **enviar-whatsapp-manual**: Disparo individual via Evolution API
- **bulk-delete**: Exclusão em massa (admin only)
- **exportar-leads**: CSV/Excel com auditoria
- **enviar-email-campanha**: Resend batch para leads selecionados
- **importar-leads**: Parse CSV/XLSX → normalização → upsert

---

## [/kanban] — Pipeline Visual

### Components
- **KanbanBoard**: Colunas drag-and-drop (dnd-kit)

### Behaviors
- **mover-lead-kanban**: Drag-and-drop → atualiza estagio_pipeline + Realtime sync

---

## [/dashboard] — Analytics

### Components
- **MetricsCards**: Total leads, qualificados, taxa de conversão
- **PipelineChart**: Distribuição por estágio

---

## [/inbox] — Atendimento Humano

### Components
- **ConversationList**: Leads transferidos para humano
- **WhatsAppConversationDrawer**: Histórico + envio de mensagens

### Behaviors
- **assumir-conversa**: Consultor entra na conversa (modo humano)
- **enviar-mensagem-consultor**: Envio de texto via Evolution API
- **devolver-ao-bot**: Retorna conversa ao agente IA

---

## [/clientes] — Base de Clientes (F14)

### Behaviors
- **converter-lead**: lead qualificado → cliente permanente
- **listar-clientes**: filtro por status/categoria
- **devolver-cliente**: cliente → reprospectar como lead

---

## [/campanhas] — Campanhas (F15)

### Behaviors
- **criar-campanha**: audience builder + canal (WA/email)
- **disparar-campanha**: envio em batch com tracking individual

---

## [/settings] — Configurações

### Behaviors
- **configurar-agente**: prompt, modelo, temperatura, RAG
- **aprovar-usuario**: admin aprova pendentes + define role
- **configurar-consultor**: whatsapp + instância Evolution do consultor

---

## Agente IA (Backend)

### Behaviors
- **processar-webhook-evolution**: recebe mensagem → dispara workflow
- **qualificar-lead**: fluxo 5 etapas → atualizar_lead ou transferir_para_consultor
- **follow-up-curto-prazo**: cron 1min → 3 estágios (10min / 1h / 24h)
- **follow-up-longo-prazo**: cron diário 9h → 5 cenários de reengajamento
