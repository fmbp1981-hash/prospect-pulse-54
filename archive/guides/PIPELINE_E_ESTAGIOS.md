# 🎯 Sistema de Pipeline e Estágios - Guia Completo

**Versão:** 2.0
**Data:** 17/11/2025

---

## 📋 Visão Geral

O sistema de pipeline gerencia automaticamente o avanço dos leads através do funil de vendas com 6 estágios e gatilhos automáticos.

---

## 🔄 Estágios do Pipeline

### 1. **Novo Lead** 🆕
- **Cor**: Azul
- **Trigger Automático**: ✅ Assim que o lead é prospectado
- **Ação Manual**: Nenhuma
- **Próximo Estágio**: Contato Inicial (após envio WhatsApp)

### 2. **Contato Inicial** 📱
- **Cor**: Roxo
- **Trigger Automático**: ✅ Assim que mensagem de prospecção é enviada via WhatsApp
- **Ação Manual**: Nenhuma
- **Próximo Estágio**: Proposta Enviada (quando enviar proposta)

### 3. **Proposta Enviada** 📄
- **Cor**: Laranja
- **Trigger**: Manual - Usuário marca que enviou proposta
- **Campo no Banco**: `data_envio_proposta`
- **Próximo Estágio**: Negociação (quando lead responder)

### 4. **Negociação** 🤝
- **Cor**: Índigo
- **Trigger Automático**: ✅ Quando lead responde após receber proposta
- **Webhook**: Evolution API detecta resposta
- **Próximo Estágio**: Fechado ou Follow-up

### 5. **Fechado** ✅
- **Cor**: Verde
- **Trigger**: Manual - Usuário marca como fechado (ganho)
- **Estágio Final**: Sim
- **Ação**: Lead removido do fluxo de Follow-up

### 6. **Follow-up** 🔄
- **Cor**: Rosa
- **Triggers Automáticos**:
  - Lead não responde após contato inicial (7 dias)
  - Lead não responde após proposta enviada (5 dias)
  - Lead estagnado em qualquer estágio (exceto Fechado) por mais de 10 dias
- **Ação**: Sistema envia mensagem automática de reativação
- **Retorno**: Pode voltar para estágio anterior se lead responder

---

## ⚙️ Gatilhos Automáticos

### Gatilho 1: Prospecção → Novo Lead
```typescript
// Automático na Edge Function de prospecção
estagio_pipeline: 'Novo Lead',
data_ultima_interacao: NOW()
```

### Gatilho 2: Envio WhatsApp → Contato Inicial
```typescript
// Automático ao enviar mensagem via WhatsApp
UPDATE leads_prospeccao
SET estagio_pipeline = 'Contato Inicial',
    data_ultima_interacao = NOW()
WHERE id = lead_id
AND estagio_pipeline = 'Novo Lead';
```

### Gatilho 3: Resposta do Lead → Negociação
```typescript
// Webhook da Evolution API detecta resposta
if (lead.estagio_pipeline === 'Proposta Enviada' && lead_respondeu) {
  estagio_pipeline = 'Negociação';
  data_ultima_interacao = NOW();
}
```

### Gatilho 4: Estagnação → Follow-up
```typescript
// Cron job diário verifica estagnação
const diasSemInteracao = NOW() - data_ultima_interacao;

if (diasSemInteracao > 7 && estagio !== 'Fechado') {
  estagio_pipeline = 'Follow-up';
  enviar_mensagem_reativacao();
}
```

---

## 🗄️ Estrutura no Banco de Dados

### Novas Colunas
```sql
-- Estágio atual no pipeline
estagio_pipeline TEXT DEFAULT 'Novo Lead'

-- Data da última interação (para detectar estagnação)
data_ultima_interacao TIMESTAMP WITH TIME ZONE DEFAULT NOW()

-- Data de envio da proposta comercial
data_envio_proposta TIMESTAMP WITH TIME ZONE

-- Telefone separado (não WhatsApp)
telefone TEXT
```

### Índices para Performance
```sql
CREATE INDEX idx_leads_estagio_pipeline ON leads_prospeccao(estagio_pipeline);
CREATE INDEX idx_leads_data_ultima_interacao ON leads_prospeccao(data_ultima_interacao);
```

---

## 📊 Fluxo Completo do Pipeline

```
┌─────────────┐
│ PROSPECÇÃO  │
└──────┬──────┘
       │ (Automático)
       ↓
┌─────────────┐
│  Novo Lead  │ 🆕
└──────┬──────┘
       │ (Envio WhatsApp - Automático)
       ↓
┌──────────────────┐
│ Contato Inicial  │ 📱
└──────┬───────────┘
       │ (Usuário marca envio - Manual)
       ↓
┌───────────────────┐
│ Proposta Enviada  │ 📄
└──────┬────────────┘
       │ (Lead responde - Automático via Webhook)
       ↓
┌─────────────┐
│ Negociação  │ 🤝
└──────┬──────┘
       │ (Usuário fecha negócio - Manual)
       ↓
┌─────────────┐
│  Fechado    │ ✅
└─────────────┘

       ┌──────────────────────────────┐
       │  ESTAGNAÇÃO DETECTADA        │
       │  (Sem resposta > 7 dias)     │
       └──────┬───────────────────────┘
              │ (Automático - Cron)
              ↓
       ┌─────────────┐
       │  Follow-up  │ 🔄
       └──────┬──────┘
              │ (Lead responde)
              ↓
       (Retorna ao estágio anterior)
```

---

## 🤖 Automações Implementadas

### ✅ Já Implementado

1. **Mudança para "Novo Lead"** - Automático na prospecção
2. **Atualização do Kanban** - Arraste manual funciona
3. **Campo `estagio_pipeline`** no banco

### 🔜 A Implementar

1. **Mudança para "Contato Inicial"** - Trigger ao enviar WhatsApp
2. **Mudança para "Negociação"** - Webhook Evolution API
3. **Sistema de Follow-up** - Cron job detecta estagnação
4. **Botão "Enviar Proposta"** - Marca estágio e registra data

---

## 💡 Regras de Negócio

### Tempo de Estagnação
- **Contato Inicial**: 7 dias sem resposta → Follow-up
- **Proposta Enviada**: 5 dias sem resposta → Follow-up
- **Negociação**: 10 dias sem movimento → Follow-up

### Mensagens de Follow-up
- **Após Contato Inicial**: "Olá {{empresa}}! Vi que não conseguimos conversar ainda. Ainda tem interesse em conhecer nossa solução?"
- **Após Proposta**: "Oi {{empresa}}! Conseguiu avaliar nossa proposta? Posso esclarecer alguma dúvida?"
- **Negociação Estagnada**: "Olá! Como está o andamento da nossa negociação? Podemos ajudar em algo?"

### Retorno do Follow-up
- Se lead responder → Volta para o estágio anterior
- Se não responder em 15 dias → Permanece em Follow-up
- Manual: Usuário pode mover para qualquer estágio

---

## 🔧 Como Usar

### 1. Para o Usuário

#### Mover Lead Manualmente
1. Abra o Kanban (menu lateral)
2. Arraste o card do lead para o estágio desejado
3. Sistema atualiza automaticamente

#### Marcar Envio de Proposta
```typescript
// Na tela de detalhes do lead
<Button onClick={() => marcarPropostaEnviada(lead.id)}>
  📄 Proposta Enviada
</Button>
```

#### Marcar como Fechado
```typescript
// No Kanban ou detalhes
lead.estagio_pipeline = 'Fechado';
// Registro de fechamento, sem mais Follow-up
```

### 2. Para o Desenvolvedor

#### Atualizar Estágio Programaticamente
```typescript
import { supabaseCRM } from "@/lib/supabaseCRM";

await supabaseCRM.updateLead(leadId, {
  estagiopipeline: 'Contato Inicial',
  data_ultima_interacao: new Date().toISOString(),
});
```

#### Detectar Estagnação (Cron)
```typescript
// Edge Function executada diariamente
const leadsEstagnados = await supabase
  .from('leads_prospeccao')
  .select('*')
  .neq('estagio_pipeline', 'Fechado')
  .lt('data_ultima_interacao', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

// Mover para Follow-up e enviar mensagem
```

---

## 📈 Métricas e Relatórios

### Dashboards
- Taxa de conversão por estágio
- Tempo médio em cada estágio
- Leads em Follow-up
- Taxa de fechamento

### KPIs
- **Novo Lead → Contato**: < 24h (automático)
- **Contato → Proposta**: < 3 dias
- **Proposta → Negociação**: < 5 dias
- **Negociação → Fechado**: < 10 dias

---

## 🎯 Próximos Passos

1. **Execute o SQL**: `EXECUTAR_NO_SUPABASE.sql`
2. **Configure sua empresa**: Menu → Configurações
3. **Teste o Kanban**: Arraste leads entre estágios
4. **Aguarde implementações**:
   - Triggers automáticos de WhatsApp
   - Sistema de Follow-up
   - Botão de enviar proposta

---

**Implementado por**: Claude Code
**Status**: ✅ Estrutura pronta, automações em desenvolvimento

🤖 Generated with [Claude Code](https://claude.com/claude-code)
