# 🏢 Migration: Multi-Tenant por Empresa (Xpag)

## 📋 Objetivo

Implementar sistema multi-tenant que identifica leads por **tenant** (empresa dona do lead) e **origem** (fonte do lead), permitindo que:

- **Empresa Xpag (App)**: Leads provenientes do app sejam marcados com `tenant_id='xpag'` e `origem='app'`
- **Site Xpag**: Leads do site continuem sendo marcados com `tenant_id='xpag'` e `origem='website'`
- **Outras empresas**: Mantenham o comportamento padrão (`tenant_id=NULL`, `origem='google_places'`)

### Estrutura de Campos

- **`empresa`**: Nome da empresa **PROSPECTADA** (ex: "Restaurante do João", "Padaria Silva")
- **`tenant_id`**: Identificador da empresa/tenant **DONA** do lead (ex: "xpag", "intellix", NULL)
- **`origem`**: Fonte do lead (ex: "app", "website", "google_places", "manual")

---

## 🔄 O Que Foi Implementado

### 1. Novo Campo `tenant_id`
- **Tipo**: TEXT (nullable)
- **Descrição**: Identifica a empresa/tenant DONA do lead
- **Exemplos**: `'xpag'`, `'intellix'`, `NULL` (usuários comuns)
- **Importante**: Diferente do campo `empresa` que contém o nome da empresa prospectada

### 2. Novo Campo `origem`
- **Tipo**: TEXT (default: 'google_places')
- **Valores possíveis**:
  - `'google_places'` - Prospecção via Google Places API (padrão)
  - `'app'` - Lead criado via app por empresa específica (tenant)
  - `'website'` - Lead vindo do site da empresa
  - `'manual'` - Lead inserido manualmente

### 3. Campo `empresa` Existente (Preservado)
- **Mantido sem alterações**: Continua armazenando o nome da empresa **PROSPECTADA**
- **Exemplo**: "Restaurante do João", "Padaria Silva", etc.

### 4. Função `get_user_tenant_id()`
- Busca o `company_name` do usuário na tabela `user_settings`
- Retorna o valor normalizado (lowercase, trimmed) para usar como `tenant_id`
- Retorna NULL se usuário não tem company_name configurado

### 5. Trigger Automático
- **Nome**: `set_tenant_trigger`
- **Ação**: Preenche automaticamente `tenant_id` e ajusta `origem` ao inserir lead
- **Lógica**:
  ```
  SE user_id tem company_name configurado ENTÃO
    tenant_id = company_name (normalizado em lowercase)
    SE origem é NULL ou 'google_places' ENTÃO
      origem = 'app'
    FIM SE
  SENÃO
    tenant_id = NULL
    origem = 'google_places' (se NULL)
  FIM SE
  ```

---

## 📦 Estrutura de Dados

### Exemplo: Lead da Xpag via App
```json
{
  "lead": "Lead-001",
  "empresa": "Restaurante do João",  // ← Nome da empresa PROSPECTADA
  "user_id": "uuid-do-usuario-xpag",
  "tenant_id": "xpag",              // ✅ Auto-preenchido pelo trigger
  "origem": "app",                  // ✅ Ajustado automaticamente
  "categoria": "Restaurante",
  "status": "Novo"
}
```

### Exemplo: Lead da Xpag via Site
```json
{
  "lead": "site_1733876543_abc123",
  "empresa": "Maria Silva",          // ← Nome do lead/contato do site
  "tenant_id": "xpag",              // ✅ Definido pelo código do site
  "origem": "website",              // ✅ Definido pelo código do site
  "email": "maria@example.com",
  "contato": "Maria Silva",
  "status": "Novo"
}
```

### Exemplo: Lead de Usuário Comum
```json
{
  "lead": "Lead-042",
  "empresa": "Empresa ABC",          // ← Nome da empresa prospectada
  "user_id": "uuid-usuario-comum",
  "tenant_id": null,                // ✅ Usuário comum não tem tenant
  "origem": "google_places",        // ✅ Prospecção via Google Places
  "categoria": "Varejo",
  "status": "Novo"
}
```

---

## 🚀 Como Executar a Migration

### 1. Acessar Supabase SQL Editor
1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **SQL Editor** (menu lateral)

### 2. Executar a Migration
1. Clique em **New Query**
2. Cole o conteúdo do arquivo:
   ```
   supabase/migrations/20251211_add_empresa_multi_tenant.sql
   ```
3. Clique em **Run** (Ctrl+Enter)
4. Aguarde mensagem de sucesso

### 3. Verificar a Migration

**Verificar colunas adicionadas:**
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'leads_prospeccao'
AND column_name IN ('tenant_id', 'origem', 'empresa')
ORDER BY column_name;
```

**Resultado esperado:**
```
column_name | data_type | is_nullable | column_default
------------+-----------+-------------+-------------------
empresa     | text      | NO          |
origem      | text      | YES         | 'google_places'
tenant_id   | text      | YES         |
```

**Verificar funções criadas:**
```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('get_user_tenant_id', 'set_tenant_and_origem_on_insert');
```

**Verificar trigger:**
```sql
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'set_tenant_trigger';
```

---

## ⚙️ Configuração para Usuário Xpag

### Passo 1: Identificar o user_id do usuário Xpag

```sql
-- Listar todos os usuários
SELECT id, email, created_at
FROM auth.users
ORDER BY created_at DESC;
```

### Passo 2: Configurar company_name='xpag'

**Se o usuário já existe na user_settings:**
```sql
UPDATE public.user_settings
SET company_name = 'xpag'
WHERE user_id = 'UUID-DO-USUARIO-XPAG';
```

**Se o usuário NÃO existe na user_settings:**
```sql
INSERT INTO public.user_settings (user_id, company_name)
VALUES ('UUID-DO-USUARIO-XPAG', 'xpag');
```

**Verificar configuração:**
```sql
SELECT u.email, us.company_name
FROM auth.users u
LEFT JOIN public.user_settings us ON us.user_id = u.id
WHERE u.email = 'email-do-usuario-xpag@example.com';
```

---

## 🧪 Testar o Sistema

### 1. Teste Manual via SQL

**Simular inserção de lead pela Xpag:**
```sql
-- Inserir lead como se fosse o usuário Xpag
INSERT INTO public.leads_prospeccao (
  id,
  lead,
  empresa,
  categoria,
  user_id,
  status
) VALUES (
  gen_random_uuid(),
  'Lead-999',
  'Teste Restaurante Xpag',
  'Restaurante',
  'UUID-DO-USUARIO-XPAG', -- ⚠️ Substituir pelo UUID real
  'Novo'
) RETURNING id, lead, empresa, tenant_id, origem;
```

**Resultado esperado:**
```
id                                   | lead      | empresa                  | tenant_id | origem
-------------------------------------+-----------+--------------------------+-----------+--------
xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx | Lead-999  | Teste Restaurante Xpag   | xpag      | app
```

### 2. Teste via App

1. Faça login como usuário Xpag
2. Crie uma nova prospecção de leads
3. Verifique no banco se os leads foram criados com:
   - `tenant_id = 'xpag'`
   - `origem = 'app'`
   - `empresa = nome da empresa prospectada`

```sql
SELECT
  id,
  lead,
  empresa,
  tenant_id,
  origem,
  created_at
FROM public.leads_prospeccao
WHERE user_id = 'UUID-DO-USUARIO-XPAG'
ORDER BY created_at DESC
LIMIT 5;
```

**Resultado esperado:**
```
lead      | empresa           | tenant_id | origem
----------+-------------------+-----------+--------
Lead-105  | Restaurante ABC   | xpag      | app
Lead-104  | Padaria XYZ       | xpag      | app
```

### 3. Teste de Usuário Comum

1. Faça login como usuário comum (sem company_name)
2. Crie leads normalmente
3. Verifique que:
   - `tenant_id = NULL`
   - `origem = 'google_places'`
   - `empresa = nome da empresa prospectada`

---

## 📊 Consultas Úteis

### Ver todos os leads da Xpag (app + site)
```sql
SELECT
  lead,
  empresa,
  tenant_id,
  origem,
  cidade,
  created_at
FROM public.leads_prospeccao
WHERE tenant_id = 'xpag'
ORDER BY created_at DESC;
```

### Comparar leads por origem
```sql
SELECT
  origem,
  COUNT(*) as total,
  COUNT(DISTINCT tenant_id) as tenants_distintos
FROM public.leads_prospeccao
GROUP BY origem
ORDER BY total DESC;
```

**Resultado esperado:**
```
origem        | total | tenants_distintos
--------------+-------+-------------------
google_places | 1250  | 0
app           | 150   | 1
website       | 45    | 1
```

### Leads da Xpag separados por origem
```sql
SELECT
  origem,
  COUNT(*) as total
FROM public.leads_prospeccao
WHERE tenant_id = 'xpag'
GROUP BY origem;
```

**Resultado esperado:**
```
origem   | total
---------+-------
app      | 150
website  | 45
```

### Dashboard por tenant
```sql
SELECT
  COALESCE(tenant_id, 'Usuários Comuns') as tenant,
  COUNT(*) as total_leads,
  COUNT(CASE WHEN origem = 'app' THEN 1 END) as leads_app,
  COUNT(CASE WHEN origem = 'website' THEN 1 END) as leads_site,
  COUNT(CASE WHEN origem = 'google_places' THEN 1 END) as leads_prospeccao
FROM public.leads_prospeccao
GROUP BY tenant_id
ORDER BY total_leads DESC;
```

**Resultado esperado:**
```
tenant          | total_leads | leads_app | leads_site | leads_prospeccao
----------------+-------------+-----------+------------+------------------
Usuários Comuns | 1250        | 0         | 0          | 1250
xpag            | 195         | 150       | 45         | 0
```

---

## 🔒 Segurança (RLS)

As políticas RLS existentes continuam funcionando:
- Usuários só veem seus próprios leads (filtro por `user_id`)
- Os campos `tenant_id` e `origem` são apenas informativos
- A função `get_user_tenant_id()` é SECURITY DEFINER (segura)

**IMPORTANTE**:
- O campo `tenant_id` NÃO substitui o `user_id` para segurança
- Ele é apenas um identificador adicional para organização, relatórios e analytics
- A segurança continua baseada em RLS com `user_id`

---

## 🆘 Troubleshooting

### Erro: "relation user_settings does not exist"
**Solução**: Execute a migration `20251117_create_user_settings.sql` primeiro

### Leads não estão sendo marcados com tenant_id
**Verificar**:
1. Usuário tem `company_name` configurado em `user_settings`?
   ```sql
   SELECT user_id, company_name FROM public.user_settings WHERE user_id = 'UUID-DO-USUARIO';
   ```
2. Trigger está ativo?
   ```sql
   SELECT * FROM information_schema.triggers WHERE trigger_name = 'set_tenant_trigger';
   ```
3. Função está retornando o tenant_id?
   ```sql
   SELECT public.get_user_tenant_id('UUID-DO-USUARIO');
   ```

### Origem não está mudando para 'app'
**Motivo**: O trigger só ajusta origem quando `tenant_id` é preenchido
**Verificar**:
1. Se `user_settings.company_name` está definido
2. Se a função `get_user_tenant_id()` retorna um valor válido

---

## 🎯 Próximos Passos

Após executar esta migration:

1. ✅ Configurar `company_name='xpag'` para usuário Xpag na tabela `user_settings`
2. ✅ Testar criação de leads via app (devem ter `tenant_id='xpag'` e `origem='app'`)
3. ✅ Atualizar código do site para preencher `tenant_id='xpag'` e `origem='website'`
4. ✅ Criar dashboard de visualização por tenant
5. ✅ Atualizar tipos TypeScript para incluir `tenant_id` e `origem`
6. ✅ Atualizar documentação do projeto

### Código Necessário no Site Xpag

Atualizar o arquivo `src/lib/supabase.ts` do site para incluir `tenant_id`:

```typescript
const lead: Omit<LeadProspeccao, "created_at" | "updated_at"> = {
  id: generateLeadId(),
  lead: formData.name,
  empresa: formData.name, // Nome do contato/lead
  tenant_id: "xpag", // ← ADICIONAR ESTE CAMPO
  origem: "website",  // ← ADICIONAR ESTE CAMPO
  contato: formData.name,
  email: formData.email,
  telefone: formData.phone || null,
  data: formData.message || null,
  status: "novo",
  estagio_pipeline: "Lead Site",
  data_ultima_interacao: new Date().toISOString(),
};
```

---

## 📚 Arquivos Relacionados

- **Migration**: `supabase/migrations/20251211_add_empresa_multi_tenant.sql`
- **Tabela principal**: `public.leads_prospeccao`
- **Tabela de configuração**: `public.user_settings`
- **Site Xpag**: `C:\Projects\Xpag\xpagbrasil-one-page-main\src\lib\supabase.ts`

---

**Data de Criação**: 2025-12-11
**Autor**: Claude Code Assistant
**Status**: ✅ Pronto para execução
