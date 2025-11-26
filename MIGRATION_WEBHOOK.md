# Migration: Adicionar Campo Webhook ao User Settings

## ⚠️ IMPORTANTE - Execute ANTES de fazer deploy!

Este arquivo contém instruções para executar a migration SQL que adiciona o campo `whatsapp_webhook_url` à tabela `user_settings`.

---

## 📋 Passo a Passo:

### 1. Acessar o Supabase SQL Editor
1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **SQL Editor** (menu lateral esquerdo)

### 2. Executar a Migration
1. Clique em **New Query**
2. Cole o conteúdo do arquivo `supabase/migrations/20250126_add_webhook_to_user_settings.sql`:

```sql
-- Migration: Adicionar campo whatsapp_webhook_url a user_settings
-- Data: 2025-01-26
-- Descrição: Persistir URL do webhook WhatsApp no banco de dados para cada usuário

-- Adicionar coluna whatsapp_webhook_url
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS whatsapp_webhook_url TEXT;

-- Adicionar comentário
COMMENT ON COLUMN public.user_settings.whatsapp_webhook_url
IS 'URL do webhook n8n/Evolution API para envio de mensagens WhatsApp';
```

3. Clique em **Run** (ou pressione Ctrl+Enter)
4. Aguarde a mensagem de sucesso

### 3. Verificar
Execute o seguinte comando para verificar se a coluna foi adicionada:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_settings'
  AND table_schema = 'public';
```

Você deve ver a coluna `whatsapp_webhook_url` do tipo `text` na lista.

---

## ✅ Após Executar a Migration

1. Faça deploy da nova versão no Vercel
2. Acesse o sistema
3. Faça login como admin (`fmbp1981@gmail.com`)
4. Configure o webhook em **Config. Webhook** no sidebar
5. O webhook agora será persistido no banco de dados e não será perdido ao deslogar!

---

## 🔄 Migração de Dados do localStorage (Opcional)

Se você já tinha um webhook configurado no localStorage, ele NÃO será migrado automaticamente. Você precisará:

1. Acessar o sistema
2. Ir em **Config. Webhook**
3. Configurar novamente o webhook
4. Clicar em **Salvar Configurações**

O sistema agora salvará no Supabase ao invés do localStorage.

---

## 📝 O Que Mudou?

**ANTES**:
- Webhook salvo no `localStorage` do navegador
- Perdido ao limpar cache/cookies ou trocar de navegador
- Não compartilhado entre dispositivos

**AGORA**:
- Webhook salvo na tabela `user_settings` no Supabase
- Persistido mesmo após logout
- Sincronizado entre todos os dispositivos
- Cada usuário tem seu próprio webhook

---

## 🔐 Permissões

As políticas RLS (Row Level Security) já existentes permitem que:
- Cada usuário veja e edite apenas seu próprio webhook
- Admin (`fmbp1981@gmail.com`) pode ver e editar webhooks de todos os usuários (futura funcionalidade)

---

## ❓ Problemas?

Se encontrar erros ao executar a migration:

1. **Erro: "relation public.user_settings does not exist"**
   - Execute primeiro o arquivo `EXECUTAR_NO_SUPABASE_v2.sql` completo

2. **Erro: "column already exists"**
   - A migration já foi executada! Pode ignorar

3. **Outros erros**
   - Verifique se você está no projeto correto do Supabase
   - Verifique se tem permissões de admin no Supabase
