# LeadFinder Pro — Guia Completo do Sistema

> **Versão:** 1.0 — 2026-03-02
> **Produto:** LeadFinder Pro / XPAG Brasil
> **Responsável Técnico:** IntelliX.AI

---

## Índice

1. [O que é o LeadFinder Pro](#1-o-que-é-o-leadfinder-pro)
2. [Configuração Inicial](#2-configuração-inicial)
3. [Prospecção de Leads](#3-prospecção-de-leads)
4. [Gestão de Leads (Tabela)](#4-gestão-de-leads-tabela)
5. [Kanban Pipeline](#5-kanban-pipeline)
6. [Agente de IA (WhatsApp)](#6-agente-de-ia-whatsapp)
7. [Follow-ups Automáticos](#7-follow-ups-automáticos)
8. [Exportação de Dados](#8-exportação-de-dados)
9. [Integrações e APIs](#9-integrações-e-apis)
10. [Papéis e Permissões (RBAC)](#10-papéis-e-permissões-rbac)
11. [Variáveis de Ambiente](#11-variáveis-de-ambiente)

---

## 1. O que é o LeadFinder Pro

O LeadFinder Pro é um sistema B2B de **prospecção, qualificação e gestão de leads** com automação via WhatsApp e inteligência artificial. Foi construído para eliminar processos manuais, automatizar o atendimento inicial e escalar o funil de vendas.

### Capacidades principais

| Funcionalidade | Descrição |
|---|---|
| **Prospecção Automática** | Busca empresas por nicho e cidade via Google Places API. Até 60 leads por busca em ~30s. |
| **Agente de IA 24/7** | Bot WhatsApp que responde, qualifica e transfere leads automaticamente. |
| **Pipeline Kanban** | Funil visual com drag-and-drop e atualização em tempo real via Supabase Realtime. |
| **Follow-ups Automáticos** | 3 rodadas de follow-up para leads que não responderam. |
| **Dashboard Analítico** | Métricas de conversão, categorias, timeline e taxa de sucesso. |
| **Exportação** | CSV e Excel com seleção de colunas. |
| **Multi-tenant** | Dados de cada empresa completamente isolados (RLS no PostgreSQL). |

### Fluxo completo do sistema

```
Prospectar leads
  → Salvar no banco
    → Enviar WhatsApp inicial
      → Agente responde automaticamente
        → Lead qualificado?
          → SIM: Notifica consultor + move Kanban para "Transferido"
          → NÃO: Dispara follow-ups automáticos
```

---

## 2. Configuração Inicial

Siga os passos na ordem. O sistema só opera 100% após todas as integrações estarem configuradas.

### Passo 1 — Informações da Empresa

Acesse **Configurações → aba "Empresa"** e preencha:
- Nome da empresa
- Segmento de atuação
- Website

Essas informações são injetadas no contexto do agente de IA para personalizar as mensagens.

### Passo 2 — Chave OpenAI

Acesse **Configurações → aba "Agente de IA"** e cole sua chave:

```
sk-proj-...
```

- Obtenha em: https://platform.openai.com/api-keys
- Modelos usados: `gpt-4.1` (agente), `gpt-4o-mini` (enriquecimento), `whisper-1` (transcrição de áudio)

### Passo 3 — Evolution API (WhatsApp)

Acesse **Integrações** e configure:
- **URL da Evolution API**: `https://evolution.suaempresa.com`
- **API Key**: chave da instância
- **Nome da instância**: nome do número WhatsApp conectado

Após salvar, escaneie o QR Code que aparece para conectar o número.

### Passo 4 — Google Places API

Acesse **Configurações → API Keys** e cole sua chave do Google Places:

```
AIzaSy...
```

- Obtenha em: https://console.cloud.google.com → APIs → Places API
- Habilite: "Places API" e "Maps JavaScript API"

### Passo 5 — Prompt do Agente de IA

Acesse **Configurações → Agente de IA** e personalize o prompt com:
- Identidade do agente (nome, empresa que representa)
- Produto/serviço oferecido
- Tom de voz e abordagem
- Critério de qualificação de faturamento (ex: "acima de R$50.000/mês")

### Passo 6 — Webhook da Evolution API

Configure a URL de webhook no painel da Evolution API:

```
https://seu-dominio.vercel.app/api/webhooks/evolution
```

Eventos necessários: `MESSAGES_UPSERT`

---

## 3. Prospecção de Leads

### Como usar

1. Acesse a página inicial do sistema (ícone de busca no menu)
2. Preencha:
   - **Nicho**: ex. "clínicas odontológicas", "academias de ginástica"
   - **Cidade**: ex. "São Paulo", "Curitiba — PR"
   - **Quantidade**: 1 a 60 leads
3. Clique em **"Prospectar"**
4. Aguarde ~30 segundos — os leads aparecem na tabela

### O que é capturado automaticamente

- Nome da empresa e do contato
- Número de WhatsApp
- Website
- Endereço completo (rua, bairro, cidade)
- Link do Google Maps
- Categoria do negócio
- Mensagem personalizada gerada por IA (3 templates diferentes)

### Quick Selects

Use os botões de atalho abaixo dos campos para selecionar nichos e cidades populares com um clique. Agiliza muito o processo.

### Histórico de Buscas

Cada busca é salva localmente (localStorage). Clique em uma busca anterior para reutilizá-la sem precisar redigitar.

### Detecção de Leads Duplicados

O sistema identifica automaticamente leads que já existem na base (pelo número de WhatsApp) e evita duplicação.

---

## 4. Gestão de Leads (Tabela)

Acesse pelo menu: **Tabela de Leads**

### Recursos da tabela

| Recurso | Como usar |
|---|---|
| **Busca full-text** | Campo de busca no topo — pesquisa em todos os campos de texto |
| **Filtro por status** | Dropdown "Status" — filtra por etapa do pipeline |
| **Filtro por WhatsApp** | Toggle "Tem WhatsApp" — mostra apenas leads com número |
| **Ordenação** | Clique no cabeçalho de qualquer coluna |
| **Paginação** | 20 leads por página (configurável: 10, 20, 50, 100) |
| **Edição** | Clique no ícone de edição — abre modal completo de edição |
| **Exclusão** | Clique no ícone de lixeira — confirmação antes de excluir |
| **Detalhes** | Clique no nome da empresa — abre drawer lateral com histórico |

### Ações em Massa

1. Marque os leads com os checkboxes (ou marque todos com o checkbox do cabeçalho)
2. Aparece a barra de ações em massa com as opções:
   - **Exportar CSV** — gera arquivo CSV imediatamente
   - **Exportar Excel** — gera arquivo `.xlsx`
   - **Enviar WhatsApp** — abre modal de disparo em massa
   - **Excluir** — exclui todos selecionados (com confirmação)

### Status de WhatsApp

Cada lead tem um indicador visual:
- `not_sent` — mensagem nunca foi enviada
- `sent` — mensagem enviada com sucesso
- `failed` — falha no envio

### Atualização em Tempo Real

A tabela usa Supabase Realtime. Quando o agente de IA atualiza um lead (status, estágio, faturamento), a tabela atualiza automaticamente sem precisar recarregar a página.

---

## 5. Kanban Pipeline

Acesse pelo menu: **Kanban Board**

### Estágios do Pipeline

```
Novo → Contato Inicial → Qualificação → Follow-up
                                             ↓
                                    Transferido para Consultor
                                    Fechado Ganho
                                    Fechado Perdido
```

### Como usar

- **Mover leads**: arraste o card de uma coluna para outra (drag-and-drop com dnd-kit)
- **Ver detalhes**: clique no card do lead — abre drawer lateral
- **Atualização automática**: o agente de IA move leads entre estágios automaticamente

### Mapeamento automático

| Ação do Agente | Estágio no Kanban |
|---|---|
| Primeira mensagem enviada | Contato Inicial |
| Agente inicia qualificação | Qualificação |
| Lead não responde | Follow-up |
| Lead qualificado (≥ critério) | Transferido para Consultor |
| Lead descartado | Fechado Perdido |

---

## 6. Agente de IA (WhatsApp)

### Trigger

O agente é acionado quando a Evolution API recebe uma mensagem e envia o webhook para:

```
POST /api/webhooks/evolution
```

### Fluxo de Qualificação

```
1. Apresentação
   └─ Agente se apresenta e explica o motivo do contato

2. Verificação de Interesse
   └─ "Você teria interesse em conhecer nossa solução?"

3. Qualificação por Faturamento
   └─ "Para entender se podemos ajudar, qual é o faturamento mensal da empresa?"

4. Classificação
   ├─ ≥ critério → QUALIFICADO
   └─ < critério → FOLLOW-UP (bot agradece e encerra educadamente)

5. Transferência
   └─ Notifica o consultor via WhatsApp com dados completos do lead
```

### Mídias Suportadas

| Tipo | Processamento |
|---|---|
| Texto | Resposta gerada pelo GPT-4.1 |
| Áudio | Transcrição via Whisper-1, depois resposta via GPT |
| Imagem | Análise por visão (GPT-4o), depois resposta |
| Documento (PDF) | Extração de texto, depois resposta |

### Modo Humano vs. Modo Bot

- **Modo Bot** (padrão): agente responde automaticamente
- **Modo Humano**: agente para de responder aquele lead — consultor assume

Para trocar: edite o lead e mude o campo `modo_atendimento` de `bot` para `humano`.

### Contexto Enriquecido

Quando um lead retorna (número já cadastrado), o agente recebe automaticamente:
- Nome e empresa do lead
- Histórico de mensagens anteriores
- Status atual e estágio no pipeline
- Faturamento declarado (se já informado)
- Modo de atendimento atual

---

## 7. Follow-ups Automáticos

### Como funciona

Para leads com `status_msg_wa = 'sent'` e que não responderam, o cron job dispara follow-ups automáticos em 3 estágios:

| Estágio | Gatilho | Mensagem |
|---|---|---|
| Follow-up 1 | Após ~24h sem resposta | Primeira tentativa de re-engajamento |
| Follow-up 2 | Após ~48h sem resposta | Segunda abordagem com ângulo diferente |
| Follow-up 3 | Após ~72h sem resposta | Última tentativa, mensagem de encerramento |

Após o 3º follow-up sem resposta, o lead vai para **"Fechado Perdido"**.

### Configuração do Cron (Vercel)

O cron job roda diariamente. Está configurado em `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/follow-up",
      "schedule": "0 10 * * *"
    }
  ]
}
```

> **Atenção:** O plano Hobby do Vercel suporta apenas 1 cron job por projeto e frequência mínima de 1 vez por dia.

---

## 8. Exportação de Dados

### Formatos disponíveis

- **CSV** — compatível com Excel, Google Sheets, qualquer editor de texto
- **Excel (.xlsx)** — formatado diretamente para Microsoft Excel

### Como exportar

**Exportação em massa:**
1. Selecione os leads desejados com checkbox
2. Clique em "Exportar CSV" ou "Exportar Excel"
3. Arquivo é gerado e baixado automaticamente

**Nome do arquivo:** gerado automaticamente com timestamp, ex:
```
leads_2026-03-02_14-30-00.xlsx
```

### Auditoria de Exportações

Cada exportação é registrada automaticamente com:
- Data/hora da exportação
- Usuário que exportou
- Quantidade de leads exportados
- Formato do arquivo

---

## 9. Integrações e APIs

### APIs Necessárias

| API | Status | Onde configurar |
|---|---|---|
| **OpenAI** | Obrigatório | Configurações → Agente de IA |
| **Evolution API** | Obrigatório | Integrações |
| **Google Places** | Para prospecção | Configurações → API Keys |
| **Firecrawl** | Opcional (enriquecimento) | Configurações → API Keys |

### Supabase

O banco de dados usa Supabase com:
- **PostgreSQL 17.6** para dados
- **Auth** para autenticação de usuários
- **Realtime** para atualização ao vivo na tabela e Kanban
- **RLS (Row Level Security)** para isolamento multi-tenant

Projeto: `kzvnwqlcrtxwagxkghxq` (sa-east-1)

---

## 10. Papéis e Permissões (RBAC)

| Role | Permissões |
|---|---|
| **admin** | Acesso total. Gerencia usuários, aprova cadastros, configura tudo. |
| **operador** | Cria/edita/exclui leads, configura agente, realiza prospecções, envia WhatsApp. |
| **visualizador** | Somente leitura. Pode exportar dados. Não pode criar, editar ou excluir. |

### Fluxo de Aprovação de Novos Usuários

1. Novo usuário se cadastra → `role = visualizador`, `pending_setup = true`
2. Sistema redireciona para página `/pending`
3. Admin aprova em **Configurações → aba "Usuários Pendentes"**
4. Admin seleciona o role correto (operador ou visualizador) e clica "Aprovar"
5. Usuário recebe email de aprovação e ganha acesso completo

---

## 11. Variáveis de Ambiente

Configure no painel do Vercel (Settings → Environment Variables):

```bash
# Obrigatório
OPENAI_API_KEY=sk-proj-...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
NEXT_PUBLIC_SUPABASE_URL=https://kzvnwqlcrtxwagxkghxq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# WhatsApp
EVOLUTION_API_URL=https://evolution.suaempresa.com
EVOLUTION_API_KEY=...
EVOLUTION_DEFAULT_INSTANCE=nome-da-instancia
WHATSAPP_PROVIDER=evolution

# Notificações para o consultor
XPAG_CONSULTANT_WHATSAPP=5511999999999
XPAG_CONSULTANT_INSTANCE=nome-da-instancia

# Cron (proteção da rota)
CRON_SECRET=segredo-aleatorio

# Email (Resend) — opcional
RESEND_API_KEY=re_...
```

---

## Suporte

- **Dúvidas técnicas:** suporte@intellixai.com.br
- **Documentação técnica:** `SISTEMA_TECNICO.md`
- **Bugs e melhorias:** registre no `ROADMAP.md`

---

*Desenvolvido por IntelliX.AI — 2026*
