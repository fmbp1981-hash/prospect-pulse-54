# 📘 Guia de Integração n8n - LeadFinder Pro CRM

## 🎯 Visão Geral

Este guia detalha como configurar os **6 endpoints n8n** necessários para integração completa do LeadFinder Pro com Google Sheets (CRM).

---

## 📋 Estrutura do Google Sheets

Seu Google Sheets deve ter as seguintes colunas (na ordem):

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `ID` | Texto | Identificador único (gerado automaticamente) |
| `Lead` | Texto | Nome do lead |
| `Status` | Lista | Novo Lead, Contato Inicial, Qualificação, Proposta Enviada, Negociação, Fechado Ganho, Fechado Perdido, Em Follow-up |
| `Empresa` | Texto | Nome da empresa |
| `WhatsApp` | Texto | Número de telefone (+5581999999999) |
| `Contato Principal` | Texto | Nome do contato principal |
| `Segmento` | Texto | Segmento de mercado |
| `Região` | Texto | Localização geográfica |
| `Ticket Médio Estimado` | Número | Valor monetário estimado |
| `Origem` | Lista | Prospecção Ativa, Indicação, Site, Redes Sociais, Evento, Outro |
| `Data Contato` | Data | Data do primeiro contato |
| `Próximo Follow-up` | Data | Data do próximo acompanhamento |
| `Prioridade` | Lista | Alta, Média, Baixa |
| `Observações` | Texto Longo | Anotações sobre o lead |
| `Status Msg. WA` | Lista | not_sent, sent, failed |
| `Data Envio WA` | Data/Hora | Timestamp do envio WhatsApp |
| `Resultado` | Texto | Resultado final da negociação |

---

## 🔗 Endpoints a Implementar

### 1️⃣ **GET /sync-all-leads**
**Função:** Sincroniza todos os leads do Google Sheets para a plataforma

**Workflow n8n:**
```
Webhook (GET) → Google Sheets (Read Range) → Function (Transform) → Respond to Webhook
```

**Function Node - Código de Transformação:**
```javascript
const rows = $input.all();
const leads = rows.map(row => ({
  id: row.json['ID'],
  lead: row.json['Lead'],
  status: row.json['Status'],
  empresa: row.json['Empresa'],
  whatsapp: row.json['WhatsApp'],
  contatoPrincipal: row.json['Contato Principal'],
  segmento: row.json['Segmento'],
  regiao: row.json['Região'],
  ticketMedioEstimado: parseFloat(row.json['Ticket Médio Estimado']) || 0,
  origem: row.json['Origem'],
  dataContato: row.json['Data Contato'],
  proximoFollowUp: row.json['Próximo Follow-up'],
  prioridade: row.json['Prioridade'],
  observacoes: row.json['Observações'],
  statusMsgWA: row.json['Status Msg. WA'] || 'not_sent',
  dataEnvioWA: row.json['Data Envio WA'],
  resultado: row.json['Resultado']
}));

return { leads };
```

**Resposta Esperada:**
```json
{
  "leads": [
    {
      "id": "uuid-123",
      "lead": "João Silva",
      "status": "Novo Lead",
      "empresa": "Restaurante Silva",
      "whatsapp": "+5581999999999",
      "contatoPrincipal": "João Silva",
      "segmento": "Alimentação",
      "regiao": "Recife - Boa Viagem",
      "ticketMedioEstimado": 5000,
      "origem": "Prospecção Ativa",
      "dataContato": "2025-11-08",
      "proximoFollowUp": "2025-11-15",
      "prioridade": "Alta",
      "observacoes": "Interessado em sistema de gestão",
      "statusMsgWA": "not_sent",
      "dataEnvioWA": null,
      "resultado": null
    }
  ]
}
```

---

### 2️⃣ **PATCH /update-lead-status**
**Função:** Atualiza apenas o status de um lead específico

**Workflow n8n:**
```
Webhook (PATCH) → Google Sheets (Lookup) → Google Sheets (Update) → Respond to Webhook
```

**Body da Requisição:**
```json
{
  "leadId": "uuid-123",
  "status": "Proposta Enviada"
}
```

**Google Sheets - Lookup Config:**
- Buscar por coluna: `ID`
- Valor de busca: `{{ $json.leadId }}`

**Google Sheets - Update Config:**
- Coluna para atualizar: `Status`
- Novo valor: `{{ $json.status }}`

**Resposta:**
```json
{
  "success": true,
  "message": "Status atualizado com sucesso"
}
```

---

### 3️⃣ **PUT /update-lead/:leadId**
**Função:** Atualiza múltiplos campos de um lead

**Workflow n8n:**
```
Webhook (PUT) → Google Sheets (Lookup) → Google Sheets (Update) → Respond to Webhook
```

**Body da Requisição (exemplo):**
```json
{
  "observacoes": "Cliente solicitou proposta revisada",
  "prioridade": "Alta",
  "proximoFollowUp": "2025-11-20"
}
```

**Google Sheets - Update Config:**
```javascript
// No Function node antes do Update
const updates = $json.body;
const updateFields = {};

if (updates.lead) updateFields['Lead'] = updates.lead;
if (updates.status) updateFields['Status'] = updates.status;
if (updates.empresa) updateFields['Empresa'] = updates.empresa;
if (updates.whatsapp) updateFields['WhatsApp'] = updates.whatsapp;
if (updates.observacoes) updateFields['Observações'] = updates.observacoes;
if (updates.prioridade) updateFields['Prioridade'] = updates.prioridade;
if (updates.proximoFollowUp) updateFields['Próximo Follow-up'] = updates.proximoFollowUp;
// ... adicionar outros campos conforme necessário

return { updateFields };
```

---

### 4️⃣ **POST /create-lead**
**Função:** Cria um novo lead no Google Sheets

**Workflow n8n:**
```
Webhook (POST) → Function (Generate ID) → Google Sheets (Append) → Respond to Webhook
```

**Function Node - Gerar ID:**
```javascript
const leadData = $json;
const leadId = `LEAD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

return {
  id: leadId,
  lead: leadData.lead,
  status: leadData.status || 'Novo Lead',
  empresa: leadData.empresa,
  whatsapp: leadData.whatsapp,
  contatoPrincipal: leadData.contatoPrincipal,
  segmento: leadData.segmento,
  regiao: leadData.regiao,
  ticketMedioEstimado: leadData.ticketMedioEstimado || 0,
  origem: leadData.origem || 'Prospecção Ativa',
  dataContato: new Date().toISOString().split('T')[0],
  proximoFollowUp: leadData.proximoFollowUp || '',
  prioridade: leadData.prioridade || 'Média',
  observacoes: leadData.observacoes || '',
  statusMsgWA: 'not_sent',
  dataEnvioWA: '',
  resultado: ''
};
```

**Google Sheets - Append Config:**
Mapear cada campo para a coluna correspondente.

**Resposta:**
```json
{
  "success": true,
  "leadId": "LEAD-1699123456-abc123xyz",
  "message": "Lead criado com sucesso"
}
```

---

### 5️⃣ **GET /metrics**
**Função:** Calcula e retorna métricas agregadas do CRM

**Workflow n8n:**
```
Webhook (GET) → Google Sheets (Read) → Function (Calculate Metrics) → Respond to Webhook
```

**Function Node - Cálculo de Métricas:**
```javascript
const leads = $input.all();
const today = new Date();
const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

// Total de leads
const totalLeads = leads.length;

// Contar por status
const leadsPorStatus = {};
const statusTypes = [
  'Novo Lead', 'Contato Inicial', 'Qualificação', 
  'Proposta Enviada', 'Negociação', 'Fechado Ganho', 
  'Fechado Perdido', 'Em Follow-up'
];

statusTypes.forEach(status => {
  leadsPorStatus[status] = leads.filter(l => l.json['Status'] === status).length;
});

// Contar por origem
const leadsPorOrigem = {};
leads.forEach(lead => {
  const origem = lead.json['Origem'] || 'Não definido';
  leadsPorOrigem[origem] = (leadsPorOrigem[origem] || 0) + 1;
});

// Contar por região
const leadsPorRegiao = {};
leads.forEach(lead => {
  const regiao = lead.json['Região'] || 'Não definido';
  leadsPorRegiao[regiao] = (leadsPorRegiao[regiao] || 0) + 1;
});

// Contar por segmento
const leadsPorSegmento = {};
leads.forEach(lead => {
  const segmento = lead.json['Segmento'] || 'Não definido';
  leadsPorSegmento[segmento] = (leadsPorSegmento[segmento] || 0) + 1;
});

// Taxa de conversão
const fechadoGanho = leadsPorStatus['Fechado Ganho'] || 0;
const fechadoPerdido = leadsPorStatus['Fechado Perdido'] || 0;
const totalFechados = fechadoGanho + fechadoPerdido;
const taxaConversao = totalFechados > 0 ? (fechadoGanho / totalFechados) * 100 : 0;

// Ticket médio
const ticketsValidos = leads
  .map(l => parseFloat(l.json['Ticket Médio Estimado']) || 0)
  .filter(t => t > 0);
const ticketMedioTotal = ticketsValidos.length > 0
  ? ticketsValidos.reduce((sum, t) => sum + t, 0) / ticketsValidos.length
  : 0;

// WhatsApp stats
const mensagensEnviadas = leads.filter(l => l.json['Status Msg. WA'] === 'sent').length;
const mensagensPendentes = leads.filter(l => l.json['Status Msg. WA'] === 'not_sent').length;

// Próximos follow-ups (próximos 7 dias)
const proximosFollowUps = leads
  .filter(lead => {
    const followUp = lead.json['Próximo Follow-up'];
    if (!followUp) return false;
    const followUpDate = new Date(followUp);
    return followUpDate >= today && followUpDate <= nextWeek;
  })
  .map(lead => ({
    leadId: lead.json['ID'],
    leadName: lead.json['Lead'],
    empresa: lead.json['Empresa'],
    data: lead.json['Próximo Follow-up']
  }))
  .sort((a, b) => new Date(a.data) - new Date(b.data));

return [{
  json: {
    totalLeads,
    novoLeads: leadsPorStatus['Novo Lead'] || 0,
    emNegociacao: leadsPorStatus['Negociação'] || 0,
    fechadoGanho,
    fechadoPerdido,
    taxaConversao: Math.round(taxaConversao * 100) / 100,
    ticketMedioTotal: Math.round(ticketMedioTotal * 100) / 100,
    leadsPorStatus,
    leadsPorOrigem,
    leadsPorRegiao,
    leadsPorSegmento,
    mensagensEnviadas,
    mensagensPendentes,
    proximosFollowUps
  }
}];
```

**Resposta Esperada:**
```json
{
  "totalLeads": 150,
  "novoLeads": 45,
  "emNegociacao": 23,
  "fechadoGanho": 35,
  "fechadoPerdido": 12,
  "taxaConversao": 74.47,
  "ticketMedioTotal": 8500,
  "leadsPorStatus": {
    "Novo Lead": 45,
    "Contato Inicial": 20,
    "Qualificação": 15,
    "Proposta Enviada": 18,
    "Negociação": 23,
    "Fechado Ganho": 35,
    "Fechado Perdido": 12,
    "Em Follow-up": 8
  },
  "leadsPorOrigem": {
    "Prospecção Ativa": 80,
    "Indicação": 35,
    "Site": 20,
    "Redes Sociais": 15
  },
  "leadsPorRegiao": {
    "Recife - Boa Viagem": 45,
    "Recife - Centro": 30,
    "Olinda": 25
  },
  "leadsPorSegmento": {
    "Alimentação": 60,
    "Saúde": 40,
    "Varejo": 50
  },
  "mensagensEnviadas": 85,
  "mensagensPendentes": 65,
  "proximosFollowUps": [
    {
      "leadId": "LEAD-123",
      "leadName": "João Silva",
      "empresa": "Restaurante Silva",
      "data": "2025-11-10"
    }
  ]
}
```

---

### 6️⃣ **POST /send-whatsapp-and-update-sheets**
**Função:** Envia mensagens WhatsApp para leads selecionados e atualiza Google Sheets

**Workflow n8n:**
```
Webhook (POST) 
  → Split In Batches (Leads)
  → Google Sheets (Lookup Lead Data)
  → Function (Prepare WhatsApp Message)
  → WhatsApp Business Cloud (Send Message)
  → Google Sheets (Update Status)
  → Aggregate Results
  → Respond to Webhook
```

**Body da Requisição:**
```json
{
  "leadIds": ["LEAD-123", "LEAD-456", "LEAD-789"],
  "action": "send_whatsapp"
}
```

**Function Node - Preparar Mensagem:**
```javascript
const lead = $json;
const templateMessage = `Olá *${lead.Lead}*, tudo bem?

Sou da equipe XPag e notamos que sua empresa *${lead.Empresa}* atua no segmento de *${lead.Segmento}* em *${lead.Região}*.

Gostaríamos de apresentar uma solução que pode ajudar a impulsionar seus resultados e otimizar sua gestão de pagamentos.

Você teria disponibilidade para uma conversa rápida de 15 minutos esta semana?

Aguardo seu retorno! 🚀`;

return {
  phone: lead.WhatsApp,
  message: templateMessage,
  leadId: lead.ID
};
```

**WhatsApp Business Cloud - Configuração:**
- To: `{{ $json.phone }}`
- Message Type: `text`
- Text Content: `{{ $json.message }}`

**Google Sheets - Update após envio:**
- Coluna `Status Msg. WA`: `sent` ou `failed`
- Coluna `Data Envio WA`: `{{ $now.toISO() }}`

**Resposta:**
```json
{
  "success": true,
  "results": [
    {
      "id": "LEAD-123",
      "status": "sent",
      "sentAt": "2025-11-08T14:30:00.000Z"
    },
    {
      "id": "LEAD-456",
      "status": "sent",
      "sentAt": "2025-11-08T14:30:05.000Z"
    },
    {
      "id": "LEAD-789",
      "status": "failed",
      "error": "Invalid phone number"
    }
  ],
  "message": "Mensagens enviadas e Google Sheets atualizado"
}
```

---

## 🔐 Configuração de Permissões

### Google Sheets API
1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione existente
3. Ative a **Google Sheets API**
4. Crie credenciais (Service Account)
5. Compartilhe sua planilha com o email do Service Account
6. Configure as credenciais no n8n

### WhatsApp Business Cloud API
1. Crie uma conta no [Meta for Developers](https://developers.facebook.com/)
2. Configure WhatsApp Business API
3. Obtenha:
   - Phone Number ID
   - Access Token
   - WhatsApp Business Account ID
4. Configure as credenciais no n8n

---

## 📱 Configuração na Plataforma LeadFinder

1. Acesse as **Configurações** (ícone de engrenagem)
2. Navegue até a aba **"Sincronização"**
3. Cole a URL base do seu n8n (sem endpoints)
   - Exemplo: `https://seu-n8n.app.n8n.cloud/webhook`
4. Clique em **"Salvar Todas Configurações"**

A plataforma automaticamente concatenará os endpoints:
- `GET /sync-all-leads`
- `PATCH /update-lead-status`
- `PUT /update-lead/:leadId`
- `POST /create-lead`
- `GET /metrics`
- `POST /send-whatsapp-and-update-sheets`

---

## 🧪 Testando a Integração

### Teste 1: Sincronização de Leads
```bash
curl -X GET "https://seu-n8n.app.n8n.cloud/webhook/sync-all-leads"
```

### Teste 2: Atualizar Status
```bash
curl -X PATCH "https://seu-n8n.app.n8n.cloud/webhook/update-lead-status" \
  -H "Content-Type: application/json" \
  -d '{"leadId":"LEAD-123","status":"Proposta Enviada"}'
```

### Teste 3: Obter Métricas
```bash
curl -X GET "https://seu-n8n.app.n8n.cloud/webhook/metrics"
```

### Teste 4: Enviar WhatsApp
```bash
curl -X POST "https://seu-n8n.app.n8n.cloud/webhook/send-whatsapp-and-update-sheets" \
  -H "Content-Type: application/json" \
  -d '{"leadIds":["LEAD-123"],"action":"send_whatsapp"}'
```

---

## 🚨 Troubleshooting

### Erro: "Webhook não configurado"
- Verifique se você salvou as configurações na plataforma
- Confira o localStorage do navegador: `leadfinder_sync_webhook_url`

### Erro: "Invalid phone number"
- Certifique-se que o número está no formato internacional: `+5581999999999`
- Remova espaços, parênteses e hífens

### Erro: "Sheet not found"
- Verifique se a planilha está compartilhada com o Service Account
- Confirme o nome exato das colunas (case-sensitive)

### Erro: "Rate limit exceeded"
- Implemente throttling no n8n (delay entre requisições)
- Use batches menores para envios de WhatsApp

---

## 📊 Próximas Fases

### Fase 2: Dashboard com Métricas
- Visualização de KPIs em tempo real
- Gráficos interativos (Recharts)
- Timeline de leads

### Fase 3: Kanban Board
- Drag & drop entre status
- Edição inline de leads
- Filtros avançados

### Fase 4: Tabela Detalhada de Leads
- Ordenação e paginação
- Busca full-text
- Exportação CSV/Excel
- Ações em massa

---

## 📞 Suporte

Se encontrar problemas durante a implementação, forneça:
1. Logs do n8n (execution logs)
2. Resposta da API (status code e body)
3. Estrutura atual do Google Sheets (screenshot das colunas)

---

**Desenvolvido para LeadFinder Pro** | Versão 1.0 | Novembro 2025
