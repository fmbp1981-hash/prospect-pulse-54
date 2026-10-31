# 🤖 Evolution API + AI Agent - Guia Completo

**Versão:** Feature Branch `feature/evolution-ai`
**Data:** 16/11/2025

> **OBSOLETO (2026-10-30, Sprint 1 de segurança):** a Edge Function `whatsapp-webhook`
> descrita aqui foi removida do repositório (não tinha autenticação nem isolamento de
> tenant). Não faça deploy dela. O webhook do WhatsApp agora é
> `POST /api/webhooks/evolution/<webhook_token>`, com a URL mostrada em
> Configurações → WhatsApp. Se a função ainda estiver publicada no Supabase, remova com
> `supabase functions delete whatsapp-webhook`.

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Diferenças entre Versões](#diferenças-entre-versões)
3. [Pré-requisitos](#pré-requisitos)
4. [Configuração Evolution API](#configuração-evolution-api)
5. [Deploy Edge Function Webhook](#deploy-edge-function-webhook)
6. [Configurar Webhook na Evolution](#configurar-webhook-na-evolution)
7. [Testar o Sistema](#testar-o-sistema)
8. [Migração do n8n para Evolution](#migração-do-n8n-para-evolution)
9. [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

Esta versão implementa:

### ✅ **Disparo Direto via Evolution API**
- Envia mensagens WhatsApp SEM n8n
- Integração nativa no aplicativo
- Disparo em massa otimizado

### ✅ **Agente de IA Automatizado**
- Responde leads automaticamente
- Usa Gemini 2.0 Flash (via Lovable AI)
- Qualificação inteligente de leads
- Histórico de conversação contextualizado

### ✅ **Histórico de Conversas**
- Nova tabela `whatsapp_conversations`
- Interface visual de chat
- Timeline completa de interações

### ✅ **Analytics de Atendimento**
- Métricas de resposta
- Taxa de conversão
- Sentiment analysis (futuro)

---

## 🔄 Diferenças entre Versões

| Feature | Versão n8n (main) | Versão Evolution AI (feature/evolution-ai) |
|---------|-------------------|-------------------------------------------|
| **Disparo WhatsApp** | Via n8n webhook | Direto pela Evolution API |
| **Atendimento** | Manual | Automatizado com IA |
| **Histórico** | Apenas status | Conversa completa |
| **Complexidade** | Média (requer n8n) | Baixa (tudo no app) |
| **Custo** | n8n Cloud ($$$) | Apenas Evolution API ($) |
| **Escalabilidade** | Limitada | Alta |

---

## 📦 Pré-requisitos

### 1. Evolution API Instalada

Você precisa de uma instância Evolution API rodando:

**Opção A: Docker (Recomendado)**
```bash
docker run -d \
  --name evolution-api \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=seu-api-key-secreto \
  atendai/evolution-api:latest
```

**Opção B: Servidor Cloud**
- Contratar em: https://evolution-api.com
- Ou instalar em VPS própria

### 2. Configurar Instância WhatsApp

1. Acesse Evolution API: `http://seu-ip:8080`
2. Crie uma instância
3. Escaneie QR Code com WhatsApp
4. Anote: `INSTANCE_NAME` e `API_KEY`

### 3. Lovable AI Key (Opcional)

Para IA funcionar:
- Acesse: https://lovable.dev/settings/api
- Gere uma API Key
- Guarde para configurar depois

---

## ⚙️ Configuração Evolution API

### 1. Configurar Secrets no Supabase

Acesse: https://supabase.com/dashboard/project/kzvnwqlcrtxwagxkghxq/settings/vault

Execute os comandos ou adicione via interface:

```bash
# Evolution API
npx supabase secrets set EVOLUTION_API_URL=http://seu-ip:8080
npx supabase secrets set EVOLUTION_API_KEY=sua-api-key
npx supabase secrets set EVOLUTION_INSTANCE_NAME=sua-instancia

# Lovable AI (opcional para IA)
npx supabase secrets set LOVABLE_API_KEY=sua-lovable-key
```

### 2. Criar Tabela de Conversas

Execute a migration no Supabase SQL Editor:

```sql
-- Copie e cole o conteúdo de:
-- supabase/migrations/20250116_whatsapp_conversations.sql
```

Ou via CLI:

```bash
npx supabase db push
```

---

## 🚀 Deploy Edge Function Webhook

### 1. Deploy da Function

```bash
cd prospect-pulse-54
npx supabase functions deploy whatsapp-webhook
```

### 2. Anotar URL do Webhook

Após deploy, você terá:
```
https://kzvnwqlcrtxwagxkghxq.supabase.co/functions/v1/whatsapp-webhook
```

---

## 🔗 Configurar Webhook na Evolution

### 1. Acessar Endpoint Evolution

```bash
POST http://seu-ip:8080/webhook/set/{INSTANCE_NAME}
```

### 2. Configurar via cURL

```bash
curl -X POST http://seu-ip:8080/webhook/set/sua-instancia \
  -H "Content-Type: application/json" \
  -H "apikey: sua-api-key" \
  -d '{
    "enabled": true,
    "url": "https://kzvnwqlcrtxwagxkghxq.supabase.co/functions/v1/whatsapp-webhook",
    "webhookByEvents": true,
    "webhookBase64": false,
    "events": [
      "MESSAGES_UPSERT"
    ]
  }'
```

### 3. Verificar Configuração

```bash
curl -X GET http://seu-ip:8080/webhook/find/sua-instancia \
  -H "apikey: sua-api-key"
```

Deve retornar:
```json
{
  "enabled": true,
  "url": "https://...",
  "events": ["MESSAGES_UPSERT"]
}
```

---

## 🧪 Testar o Sistema

### 1. Teste de Disparo

No aplicativo:

1. Vá em **"Tabela de Leads"**
2. Selecione um lead com WhatsApp
3. Clique em **"Enviar WhatsApp"**
4. Escolha um template
5. Clique em **"Enviar"**

**Resultado esperado:**
- ✅ Mensagem enviada via Evolution API
- ✅ Status atualizado no banco
- ✅ Lead recebe mensagem

### 2. Teste de Atendimento IA

1. Com seu celular, responda a mensagem recebida
2. Aguarde 2-5 segundos
3. Você deve receber resposta automática da IA

**Resultado esperado:**
- ✅ Webhook recebe mensagem
- ✅ IA gera resposta contextualizada
- ✅ Resposta enviada automaticamente
- ✅ Histórico salvo no banco

### 3. Visualizar Histórico

No aplicativo:

1. Vá em **"Tabela de Leads"**
2. Clique no ícone de **chat** ao lado do lead
3. Veja o drawer com histórico completo

---

## 🔄 Migração do n8n para Evolution

### Passo 1: Backup

Antes de migrar:

```bash
# Fazer backup do branch main
git checkout main
git pull origin main
git tag backup-n8n-version
git push origin backup-n8n-version
```

### Passo 2: Testar Evolution (Branch Separado)

```bash
# Mudar para branch Evolution
git checkout feature/evolution-ai
npm install  # Caso tenha novas dependências
npm run dev
```

Teste TUDO:
- [ ] Disparo funciona
- [ ] IA responde
- [ ] Histórico salva
- [ ] Multi-tenancy OK

### Passo 3: Decidir Quando Migrar

**Opção A: Continuar com n8n**
```bash
git checkout main
```

**Opção B: Migrar para Evolution**
```bash
# Merge do feature branch para main
git checkout main
git merge feature/evolution-ai
git push origin main
```

**Opção C: Manter Ambos** ✅ Recomendado
- `main` - Versão n8n (produção estável)
- `feature/evolution-ai` - Versão Evolution (testes/novo)
- Alterna entre branches conforme necessário

---

## 🔧 Troubleshooting

### Erro: "Webhook não está recebendo mensagens"

**Causa:** Webhook não configurado corretamente na Evolution

**Solução:**
```bash
# Verificar webhook
curl -X GET http://seu-ip:8080/webhook/find/sua-instancia \
  -H "apikey: sua-api-key"

# Reconfigurar
curl -X POST http://seu-ip:8080/webhook/set/sua-instancia \
  -H "Content-Type: application/json" \
  -H "apikey: sua-api-key" \
  -d '{ ...config... }'
```

### Erro: "IA não está respondendo"

**Causas possíveis:**
1. **LOVABLE_API_KEY não configurada**
   - Adicione a key nos secrets do Supabase

2. **Quota da API esgotada**
   - Verifique uso no Lovable Dashboard

3. **Edge Function não deployada**
   ```bash
   npx supabase functions deploy whatsapp-webhook
   ```

### Erro: "Mensagem não envia"

**Causa:** Evolution API não acessível ou credenciais erradas

**Solução:**
```bash
# Testar manualmente
curl -X POST http://seu-ip:8080/message/sendText/sua-instancia \
  -H "Content-Type: application/json" \
  -H "apikey: sua-api-key" \
  -d '{
    "number": "5511999999999",
    "text": "Teste"
  }'
```

### Erro: "Lead não encontrado"

**Causa:** Número do WhatsApp não bate com cadastro

**Solução:**
- Certifique-se que `telefone_whatsapp` está no formato: `5511999999999`
- Sem espaços, hífens ou parênteses
- Prefixo do país (55 para Brasil)

---

## 📊 Analytics e Métricas

### Conversas Recebidas

```sql
SELECT COUNT(*) as total_mensagens_recebidas
FROM whatsapp_conversations
WHERE from_lead = true
AND created_at >= NOW() - INTERVAL '7 days';
```

### Taxa de Resposta da IA

```sql
SELECT
  COUNT(CASE WHEN from_lead = true THEN 1 END) as mensagens_recebidas,
  COUNT(CASE WHEN from_lead = false AND ai_generated = true THEN 1 END) as respostas_ia,
  (COUNT(CASE WHEN from_lead = false AND ai_generated = true THEN 1 END)::float /
   NULLIF(COUNT(CASE WHEN from_lead = true THEN 1 END), 0) * 100) as taxa_resposta
FROM whatsapp_conversations
WHERE created_at >= NOW() - INTERVAL '7 days';
```

### Leads Ativos (com conversas)

```sql
SELECT COUNT(DISTINCT lead_id) as leads_em_conversa
FROM whatsapp_conversations
WHERE created_at >= NOW() - INTERVAL '7 days';
```

---

## 🎯 Próximos Passos

### Fase 1: Estabilização ✅ CONCLUÍDO
- [x] Integração Evolution API
- [x] Webhook + AI Agent
- [x] Histórico de conversas
- [x] Interface de visualização

### Fase 2: Melhorias Planejadas
- [ ] Sentiment Analysis (detectar humor do lead)
- [ ] Intent Classification (interesse, objeção, etc)
- [ ] Templates de IA customizáveis
- [ ] Dashboard de performance IA
- [ ] A/B Testing de mensagens

### Fase 3: Automações Avançadas
- [ ] Agendamento automático de calls
- [ ] Integração com calendário
- [ ] Notificações em tempo real
- [ ] App mobile (React Native)

---

## 🔐 Segurança

### Boas Práticas

1. **Nunca commitar API Keys**
   - Use `.env` (já no .gitignore)
   - Use Supabase Vault para secrets

2. **Validar Webhook**
   - Verificar origin do webhook
   - Implementar assinatura HMAC (futuro)

3. **Rate Limiting**
   - Limitar mensagens por minuto
   - Prevenir spam de IA

4. **Multi-tenancy**
   - Sempre usar RLS
   - Nunca compartilhar dados entre usuários

---

## 📞 Suporte

**Problemas?**
1. Verifique logs: Supabase Dashboard → Edge Functions → Logs
2. Teste Evolution API manualmente com cURL
3. Verifique se secrets estão configurados
4. Consulte este documento

**Dúvidas?**
- Leia o código fonte (bem comentado)
- Veja exemplos de uso nos componentes
- Teste no branch antes de fazer merge

---

## 📝 Changelog

### v1.0.0 - 16/11/2025
- ✅ Integração Evolution API completa
- ✅ AI Agent com Gemini 2.0 Flash
- ✅ Histórico de conversas
- ✅ Interface de chat
- ✅ Webhook handler
- ✅ Documentação completa

---

**Branch:** `feature/evolution-ai`
**Status:** ✅ Funcional e pronto para testes
**Próximo:** Testar em produção antes de merge para main

🤖 Generated with [Claude Code](https://claude.com/claude-code)
