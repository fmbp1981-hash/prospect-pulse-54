# 🔧 SQL Passo a Passo - Execute Separadamente

Se o SQL completo der erro, execute cada bloco SEPARADAMENTE no Supabase SQL Editor.

---

## ✅ PASSO 1: Criar Tabela user_settings

```sql
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);
```

**Execute → Aguarde "Success" → Próximo passo**

---

## ✅ PASSO 2: Habilitar RLS na Tabela

```sql
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
```

**Execute → Aguarde "Success" → Próximo passo**

---

## ✅ PASSO 3: Criar Políticas RLS (Uma por Vez)

### 3.1 - Política SELECT
```sql
DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;

CREATE POLICY "Users can view own settings"
ON public.user_settings FOR SELECT
USING (auth.uid() = user_id);
```

### 3.2 - Política INSERT
```sql
DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;

CREATE POLICY "Users can insert own settings"
ON public.user_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

### 3.3 - Política UPDATE
```sql
DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;

CREATE POLICY "Users can update own settings"
ON public.user_settings FOR UPDATE
USING (auth.uid() = user_id);
```

**Execute cada uma → Aguarde "Success" → Próximo passo**

---

## ✅ PASSO 4: Criar Índice

```sql
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id
ON public.user_settings(user_id);
```

**Execute → Aguarde "Success" → Próximo passo**

---

## ✅ PASSO 5: Criar Function e Trigger

### 5.1 - Function
```sql
CREATE OR REPLACE FUNCTION update_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 5.2 - Trigger
```sql
DROP TRIGGER IF EXISTS trigger_update_user_settings_updated_at
ON public.user_settings;

CREATE TRIGGER trigger_update_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION update_user_settings_updated_at();
```

**Execute → Aguarde "Success" → Próximo passo**

---

## ✅ PASSO 6: Adicionar Colunas na Tabela leads_prospeccao

```sql
ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS telefone TEXT;

ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS estagio_pipeline TEXT DEFAULT 'Novo Lead';

ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS data_envio_proposta TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.leads_prospeccao
ADD COLUMN IF NOT EXISTS data_ultima_interacao TIMESTAMP WITH TIME ZONE DEFAULT NOW();
```

**Execute → Aguarde "Success" → Próximo passo**

---

## ✅ PASSO 7: Criar Índices nas Novas Colunas

```sql
CREATE INDEX IF NOT EXISTS idx_leads_estagio_pipeline
ON public.leads_prospeccao(estagio_pipeline);

CREATE INDEX IF NOT EXISTS idx_leads_data_ultima_interacao
ON public.leads_prospeccao(data_ultima_interacao);
```

**Execute → Aguarde "Success" → Próximo passo**

---

## ✅ PASSO 8: Atualizar Leads Existentes

```sql
UPDATE public.leads_prospeccao
SET estagio_pipeline = 'Novo Lead'
WHERE estagio_pipeline IS NULL;

UPDATE public.leads_prospeccao
SET data_ultima_interacao = COALESCE(created_at, NOW())
WHERE data_ultima_interacao IS NULL;
```

**Execute → Aguarde "Success" → CONCLUÍDO!** ✅

---

## 🎉 Verificação Final

Execute este SQL para verificar se tudo foi criado:

```sql
-- Verificar tabela user_settings
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'user_settings'
) AS user_settings_existe;

-- Verificar colunas em leads_prospeccao
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'leads_prospeccao'
AND column_name IN ('telefone', 'estagio_pipeline', 'data_envio_proposta', 'data_ultima_interacao');
```

**Se retornar TRUE e 4 linhas → TUDO CERTO!** ✅

---

## 🆘 Se Algum Passo Der Erro:

1. **Copie a mensagem de erro completa**
2. **Me envie** para eu corrigir
3. **Não execute os próximos passos** até resolver o erro
4. **Ignore erros** de "already exists" - são normais!

---

Depois de concluir, vá em **Settings** e configure o nome da sua empresa! 🚀
