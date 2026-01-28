# Guia de Configuração: Workflow n8n para Leads Orgânicos

## Visão Geral

Este guia explica como configurar o workflow n8n para:
1. Receber mensagens de leads via Evolution API (webhook)
2. Identificar se é um lead existente ou orgânico (novo)
3. Criar leads orgânicos automaticamente no banco
4. Processar com o Agente IA
5. Responder via Evolution API

---

## Arquitetura do Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WORKFLOW n8n                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ Webhook  │───►│ Extrair  │───►│ Buscar   │───►│ Switch   │              │
│  │ Evolution│    │ Dados    │    │ Lead     │    │ Existe?  │              │
│  └──────────┘    └──────────┘    └──────────┘    └────┬─────┘              │
│                                                        │                    │
│                                    ┌──────────────────┬┴──────────────────┐ │
│                                    │ SIM              │ NÃO               │ │
│                                    ▼                  ▼                   │ │
│                              ┌──────────┐      ┌──────────┐               │ │
│                              │ Carregar │      │ Criar    │               │ │
│                              │ Contexto │      │ Lead     │               │ │
│                              │ do Lead  │      │ Orgânico │               │ │
│                              └────┬─────┘      └────┬─────┘               │ │
│                                   │                 │                     │ │
│                                   └────────┬────────┘                     │ │
│                                            ▼                              │ │
│                                      ┌──────────┐                         │ │
│                                      │ Agente   │                         │ │
│                                      │ IA XPAG  │                         │ │
│                                      └────┬─────┘                         │ │
│                                           │                               │ │
│                                           ▼                               │ │
│                                      ┌──────────┐                         │ │
│                                      │ Enviar   │                         │ │
│                                      │ WhatsApp │                         │ │
│                                      └──────────┘                         │ │
│                                                                           │ │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Nodes do Workflow

### 1. Webhook - Receber Mensagens (Evolution API)

**Tipo:** Webhook
**Método:** POST
**Path:** `/webhook/evolution-messages`

**Configuração:**
```json
{
  "httpMethod": "POST",
  "path": "webhook/evolution-messages",
  "responseMode": "onReceived",
  "responseCode": 200
}
```

**Payload recebido (Evolution API):**
```json
{
  "event": "messages.upsert",
  "instance": "xpag-whatsapp",
  "data": {
    "key": {
      "remoteJid": "5581988514775@s.whatsapp.net",
      "fromMe": false,
      "id": "BAE5A2F3C4B2A1D0"
    },
    "message": {
      "conversation": "Olá, gostaria de saber mais sobre as soluções de vocês"
    },
    "messageTimestamp": 1706123456,
    "pushName": "João Silva"
  }
}
```

---

### 2. Code - Extrair e Formatar Dados

**Tipo:** Code (JavaScript)

```javascript
// Extrair dados da mensagem
const payload = $input.item.json;

// Verificar se é uma mensagem válida (não enviada por nós)
if (payload.data?.key?.fromMe === true) {
  return []; // Ignorar mensagens enviadas por nós
}

// Verificar se é evento de mensagem
if (payload.event !== 'messages.upsert') {
  return []; // Ignorar outros eventos
}

// Extrair número do WhatsApp
const remoteJid = payload.data?.key?.remoteJid || '';
const whatsappRaw = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');

// Formatar número com código do país
let whatsappFormatted = whatsappRaw;
if (!whatsappRaw.startsWith('+')) {
  whatsappFormatted = '+' + whatsappRaw;
}

// Extrair mensagem
const messageText = payload.data?.message?.conversation
  || payload.data?.message?.extendedTextMessage?.text
  || payload.data?.message?.buttonsResponseMessage?.selectedDisplayText
  || '';

// Extrair nome do contato
const contactName = payload.data?.pushName || 'Contato';

// Timestamp
const timestamp = payload.data?.messageTimestamp
  ? new Date(payload.data.messageTimestamp * 1000).toISOString()
  : new Date().toISOString();

return [{
  json: {
    whatsapp: whatsappFormatted,
    whatsapp_raw: whatsappRaw,
    remote_jid: remoteJid,
    message: messageText,
    contact_name: contactName,
    timestamp: timestamp,
    message_id: payload.data?.key?.id
  }
}];
```

---

### 3. Supabase - Buscar Lead por WhatsApp

**Tipo:** Supabase
**Operação:** Get Rows

**Configuração:**
```json
{
  "operation": "getRows",
  "tableId": "leads_prospeccao",
  "filters": {
    "whatsapp": {
      "condition": "eq",
      "value": "={{ $json.whatsapp }}"
    }
  },
  "returnAll": false,
  "limit": 1
}
```

**Alternativa com HTTP Request:**
```
GET {{SUPABASE_URL}}/rest/v1/leads_prospeccao?whatsapp=eq.{{ $json.whatsapp }}&limit=1

Headers:
- apikey: {{SUPABASE_ANON_KEY}}
- Authorization: Bearer {{SUPABASE_ANON_KEY}}
```

---

### 4. Switch - Lead Existe?

**Tipo:** Switch
**Modo:** Rules

**Regras:**
```
Regra 1: Lead Existe
  Condição: {{ $json.id }} is not empty
  Output: 0 (Lead Existente)

Regra 2: Lead Não Existe (Fallback)
  Output: 1 (Lead Orgânico)
```

---

### 5A. Code - Preparar Contexto (Lead Existente)

**Tipo:** Code (JavaScript)

```javascript
const lead = $('Supabase - Buscar Lead').item.json;
const mensagem = $('Code - Extrair Dados').item.json;

return [{
  json: {
    tipo_lead: 'PROSPECTADO',
    lead_id: lead.id,
    lead_numero: lead.lead,
    empresa: lead.empresa || '',
    categoria: lead.categoria || '',
    whatsapp: lead.whatsapp,
    status_atual: lead.status_msg_wa || 'not_sent',
    estagio_pipeline: lead.estagio_pipeline || 'Novo Lead',
    faturamento: lead.faturamento_declarado || null,
    historico: lead.resumo_analitico || '',
    mensagem_recebida: mensagem.message,
    contact_name: mensagem.contact_name,
    timestamp: mensagem.timestamp,
    remote_jid: mensagem.remote_jid
  }
}];
```

---

### 5B. Supabase - Criar Lead Orgânico

**Tipo:** Supabase
**Operação:** Insert Row

**Configuração:**
```javascript
// Primeiro, gerar os dados do novo lead
const mensagem = $('Code - Extrair Dados').item.json;
const now = new Date().toISOString();
const dataFormatada = new Date().toLocaleDateString('pt-BR');

const novoLead = {
  id: crypto.randomUUID(),
  lead: `Lead-ORG-${Date.now()}`,
  empresa: mensagem.contact_name || 'A definir',
  whatsapp: mensagem.whatsapp,
  telefone: mensagem.whatsapp,
  status: 'Novo Lead',
  estagio_pipeline: 'Novo Lead',
  status_msg_wa: 'not_sent',
  categoria: 'Lead Orgânico',
  data: dataFormatada,
  created_at: now,
  updated_at: now
};

return [{
  json: novoLead
}];
```

**Após inserção, preparar contexto:**
```javascript
const novoLead = $('Supabase - Criar Lead').item.json;
const mensagem = $('Code - Extrair Dados').item.json;

return [{
  json: {
    tipo_lead: 'ORGANICO',
    lead_id: novoLead.id,
    lead_numero: novoLead.lead,
    empresa: novoLead.empresa,
    categoria: 'Lead Orgânico',
    whatsapp: novoLead.whatsapp,
    status_atual: 'not_sent',
    estagio_pipeline: 'Novo Lead',
    faturamento: null,
    historico: '',
    mensagem_recebida: mensagem.message,
    contact_name: mensagem.contact_name,
    timestamp: mensagem.timestamp,
    remote_jid: mensagem.remote_jid,
    is_new_lead: true
  }
}];
```

---

### 6. Merge - Unificar Fluxos

**Tipo:** Merge
**Modo:** Combine
**Opção:** Merge by position

---

### 7. Agente IA XPAG

**Tipo:** AI Agent (ou HTTP Request para API de LLM)

**System Prompt:** Usar o conteúdo de `PROMPT_AGENTE_IA_XPAG_v2.md`

**Input:**
```
Tipo de Lead: {{ $json.tipo_lead }}
Lead ID: {{ $json.lead_id }}
Empresa: {{ $json.empresa }}
WhatsApp: {{ $json.whatsapp }}
Status Atual: {{ $json.status_atual }}
Estágio Pipeline: {{ $json.estagio_pipeline }}
Faturamento: {{ $json.faturamento || 'Não informado' }}

Mensagem Recebida:
{{ $json.mensagem_recebida }}

{{ $json.is_new_lead ? 'ATENÇÃO: Este é um LEAD ORGÂNICO (novo). Siga o fluxo de boas-vindas para leads orgânicos.' : '' }}
```

**Tools disponíveis para o Agente:**
1. `buscar_lead_por_whatsapp` - Supabase GET
2. `criar_lead_organico` - Supabase INSERT
3. `atualizar_lead` - Supabase UPDATE
4. `transferir_para_consultor` - Webhook ou Node específico

---

### 8. Supabase - Atualizar Lead (após resposta do agente)

**Tipo:** Supabase
**Operação:** Update Row

O agente deve retornar os campos a serem atualizados no formato:
```json
{
  "update_fields": {
    "status_msg_wa": "Em Conversa",
    "estagio_pipeline": "Contato Inicial",
    "data_ultima_interacao": "2026-01-28T15:30:00Z"
  },
  "response_message": "Mensagem de resposta para o lead"
}
```

**Configuração:**
```json
{
  "operation": "update",
  "tableId": "leads_prospeccao",
  "filters": {
    "id": {
      "condition": "eq",
      "value": "={{ $json.lead_id }}"
    }
  },
  "fieldsToSend": "={{ $json.update_fields }}"
}
```

---

### 9. HTTP Request - Enviar WhatsApp (Evolution API)

**Tipo:** HTTP Request
**Método:** POST

**URL:**
```
{{ $env.EVOLUTION_API_URL }}/message/sendText/{{ $env.EVOLUTION_INSTANCE }}
```

**Headers:**
```json
{
  "Content-Type": "application/json",
  "apikey": "{{ $env.EVOLUTION_API_KEY }}"
}
```

**Body:**
```json
{
  "number": "{{ $json.whatsapp_raw }}",
  "text": "{{ $json.response_message }}"
}
```

---

## Variáveis de Ambiente (n8n)

Configure as seguintes variáveis no n8n:

```
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-anon-key
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_INSTANCE=xpag-whatsapp
EVOLUTION_API_KEY=sua-api-key
```

---

## Tratamento de Erros

### Node de Error Handling

Adicione um node de Error Trigger conectado aos nodes críticos:

```javascript
// Se erro ao buscar/criar lead
const error = $input.item.json;

// Log do erro
console.error('Erro no workflow:', error);

// Notificar admin (opcional)
// Pode enviar para Slack, Email, etc.

return [{
  json: {
    error: true,
    message: error.message || 'Erro desconhecido',
    timestamp: new Date().toISOString()
  }
}];
```

---

## Filtros Importantes

### Ignorar Mensagens Inválidas

No node de extração de dados, filtre:

1. **Mensagens enviadas por nós:** `fromMe === true`
2. **Eventos que não são mensagens:** `event !== 'messages.upsert'`
3. **Mensagens de grupos:** `remoteJid.includes('@g.us')`
4. **Mensagens de status:** `remoteJid === 'status@broadcast'`
5. **Mensagens vazias:** `message === ''`

```javascript
// Filtros de segurança
const payload = $input.item.json;

// Lista de condições para IGNORAR
const shouldIgnore =
  payload.data?.key?.fromMe === true ||
  payload.event !== 'messages.upsert' ||
  payload.data?.key?.remoteJid?.includes('@g.us') ||
  payload.data?.key?.remoteJid === 'status@broadcast' ||
  !payload.data?.message;

if (shouldIgnore) {
  return []; // Não processar
}

// Continuar processamento...
```

---

## Teste do Workflow

### 1. Teste com Lead Existente

```bash
curl -X POST https://seu-n8n.com/webhook/evolution-messages \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "xpag-whatsapp",
    "data": {
      "key": {
        "remoteJid": "5581988514775@s.whatsapp.net",
        "fromMe": false,
        "id": "test123"
      },
      "message": {
        "conversation": "Sim, uso cartão e Pix"
      },
      "messageTimestamp": 1706123456,
      "pushName": "Lead Teste"
    }
  }'
```

### 2. Teste com Lead Orgânico (Novo)

Use um número que NÃO existe no banco:

```bash
curl -X POST https://seu-n8n.com/webhook/evolution-messages \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "xpag-whatsapp",
    "data": {
      "key": {
        "remoteJid": "5581999999999@s.whatsapp.net",
        "fromMe": false,
        "id": "test456"
      },
      "message": {
        "conversation": "Oi, vi vocês no Instagram e quero saber mais"
      },
      "messageTimestamp": 1706123456,
      "pushName": "Novo Lead Orgânico"
    }
  }'
```

---

## Checklist de Implementação

- [ ] Webhook configurado e ativo
- [ ] Variáveis de ambiente definidas
- [ ] Conexão Supabase testada
- [ ] Conexão Evolution API testada
- [ ] Filtros de mensagens implementados
- [ ] Fluxo de lead existente testado
- [ ] Fluxo de lead orgânico testado
- [ ] Error handling configurado
- [ ] Logs habilitados para debug
- [ ] Agente IA com prompt v2.0 configurado

---

## Versão
- **v1.0** - Janeiro/2026
- Compatível com Pipeline de 7 estágios
- Suporte a leads orgânicos via Evolution API
