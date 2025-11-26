# ⚠️ IMPORTANTE: Execute Esta Migration no Supabase

## Problema Identificado

A tabela `search_history` não possui política RLS para **UPDATE**, causando o erro "Erro ao carregar histórico" ao tentar atualizar o status das buscas após reprocessamento.

---

## 📋 Passo a Passo para Executar:

### 1. Acessar o Supabase SQL Editor
1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **SQL Editor** (menu lateral esquerdo)

### 2. Executar a Migration
1. Clique em **New Query**
2. Cole o seguinte SQL:

```sql
-- Add UPDATE policy for search_history table
-- This allows users to update their own search history records

DROP POLICY IF EXISTS "Users can update own history" ON public.search_history;
CREATE POLICY "Users can update own history"
  ON public.search_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add comment
COMMENT ON POLICY "Users can update own history" ON public.search_history
IS 'Permite que usuários atualizem apenas seu próprio histórico de buscas';
```

3. Clique em **Run** (ou pressione Ctrl+Enter)
4. Aguarde a mensagem de sucesso

### 3. Verificar
Execute o seguinte comando para verificar se a política foi adicionada:

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'search_history'
ORDER BY policyname;
```

Você deve ver **4 políticas**:
- ✅ Users can delete own history (DELETE)
- ✅ Users can insert own history (INSERT)
- ✅ Users can update own history (UPDATE) ← **NOVA**
- ✅ Users can view own history (SELECT)

---

## ✅ Após Executar a Migration

1. O erro "Erro ao carregar histórico" será corrigido
2. O reprocessamento de buscas funcionará corretamente
3. O status das buscas será atualizado no banco de dados

---

## 🔄 Já Executei, E Agora?

Após executar a migration no Supabase:
1. Aguarde 1-2 minutos para o Vercel completar o deploy
2. Acesse sua aplicação
3. Faça login
4. Teste o histórico de buscas - deve carregar sem erros
5. Teste o reprocessamento - deve atualizar corretamente

---

## ❓ Problemas?

Se encontrar erros ao executar a migration:

1. **Erro: "table public.search_history does not exist"**
   - Execute primeiro o arquivo `supabase/migrations/20251122_create_search_history.sql`

2. **Outros erros**
   - Verifique se está no projeto correto do Supabase
   - Verifique se tem permissões de admin no Supabase
