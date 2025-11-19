# 🛡️ Guia de Setup - Sistema de Roles e Permissões

**LeadFinder Pro CRM - Sistema RBAC**

Guia completo para configurar e usar o sistema de controle de acesso baseado em roles.

---

## 📋 Índice

1. [Aplicar Migration](#1-aplicar-migration)
2. [Criar Primeiro Admin](#2-criar-primeiro-admin)
3. [Tipos de Roles](#3-tipos-de-roles)
4. [Gerenciar Usuários](#4-gerenciar-usuários)
5. [Permissões por Funcionalidade](#5-permissões-por-funcionalidade)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Aplicar Migration

### Opção A: Via Supabase CLI (Recomendado)

```bash
# 1. Certifique-se de estar no diretório do projeto
cd prospect-pulse-54

# 2. Fazer login no Supabase (se ainda não estiver logado)
npx supabase login

# 3. Aplicar migration
npx supabase db push

# 4. Verificar se foi aplicada
npx supabase migration list
```

### Opção B: Via Dashboard Supabase

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **SQL Editor** (menu lateral esquerdo)
4. Clique em **New Query**
5. Copie e cole o conteúdo de `supabase/migrations/20250119_user_roles.sql`
6. Clique em **Run** (ou pressione Ctrl+Enter)
7. Verifique se executou sem erros

---

## 2. Criar Primeiro Admin

### ⚠️ IMPORTANTE: Faça isso ANTES de usar o sistema!

Após aplicar a migration, você precisa definir um usuário como admin. Execute este SQL:

```sql
-- Substitua 'seu-email@example.com' pelo email do usuário que será admin
UPDATE user_settings
SET role = 'admin'
WHERE user_id = (
  SELECT id FROM auth.users
  WHERE email = 'seu-email@example.com'
);
```

### Se o user_settings ainda não existe para este usuário:

```sql
-- Cria user_settings com role admin
INSERT INTO user_settings (user_id, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'seu-email@example.com'),
  'admin'
)
ON CONFLICT (user_id) DO UPDATE
SET role = 'admin';
```

### Verificar se funcionou:

```sql
-- Deve retornar seu usuário com role = 'admin'
SELECT u.email, us.role, us.created_at
FROM auth.users u
JOIN user_settings us ON u.id = us.user_id
WHERE u.email = 'seu-email@example.com';
```

---

## 3. Tipos de Roles

### 🛡️ Admin (Administrador)

**Permissões**:
- ✅ Criar, editar e deletar leads
- ✅ Bulk delete (exclusão em massa)
- ✅ Exportar dados
- ✅ Enviar mensagens WhatsApp
- ✅ Gerenciar roles de usuários
- ✅ Visualizar logs de auditoria
- ✅ Gerenciar integrações (webhooks, etc)

**Quando usar**:
- Proprietários da empresa
- Gerentes de TI
- Administradores do sistema

---

### ⚙️ Operador

**Permissões**:
- ✅ Criar, editar e deletar leads individuais
- ✅ Exportar dados
- ✅ Enviar mensagens WhatsApp
- ✅ Aplicar templates de mensagens
- ❌ Bulk delete (exclusão em massa)
- ❌ Gerenciar roles de usuários
- ❌ Visualizar logs de auditoria
- ❌ Gerenciar integrações

**Quando usar**:
- Vendedores
- Equipe de prospecção
- Analistas de CRM
- Operadores do dia a dia

---

### 👁️ Visualizador

**Permissões**:
- ✅ Visualizar todos os leads
- ✅ Exportar dados (apenas leitura)
- ❌ Criar, editar ou deletar leads
- ❌ Enviar mensagens WhatsApp
- ❌ Qualquer operação de escrita
- ❌ Gerenciar roles
- ❌ Visualizar logs de auditoria
- ❌ Gerenciar integrações

**Quando usar**:
- Estagiários
- Consultores externos
- Stakeholders que precisam apenas visualizar dados
- Auditores (visualização sem modificação)

---

## 4. Gerenciar Usuários

### Como alterar o role de um usuário (Interface)

1. **Login como Admin**
2. Vá em **Configurações** (menu lateral)
3. Role até a seção **Gerenciamento de Roles**
4. Encontre o usuário na tabela
5. Use o dropdown na coluna "Ações" para selecionar o novo role
6. A mudança é aplicada imediatamente
7. ✅ A alteração é registrada no log de auditoria

### Como alterar o role de um usuário (SQL)

```sql
-- Alterar role de um usuário específico
UPDATE user_settings
SET role = 'operador'  -- ou 'admin', 'visualizador'
WHERE user_id = (
  SELECT id FROM auth.users
  WHERE email = 'usuario@example.com'
);
```

### Visualizar todos os usuários e seus roles

```sql
SELECT
  u.email,
  us.role,
  us.created_at as "Cadastrado em",
  us.updated_at as "Última atualização"
FROM auth.users u
LEFT JOIN user_settings us ON u.id = us.user_id
ORDER BY us.created_at DESC;
```

### Ver histórico de mudanças de roles

```sql
-- Apenas admins têm acesso via RLS
SELECT
  rc.changed_at as "Data",
  u.email as "Usuário",
  rc.old_role as "Role Anterior",
  rc.new_role as "Novo Role",
  admin.email as "Alterado por"
FROM role_changes rc
JOIN auth.users u ON rc.user_id = u.id
LEFT JOIN auth.users admin ON rc.changed_by = admin.id
ORDER BY rc.changed_at DESC;
```

---

## 5. Permissões por Funcionalidade

### Dashboard
- **Todos**: Podem visualizar métricas e gráficos
- **Diferença**: Nenhuma (todos têm acesso igual)

### Prospecção (Página Inicial)
- **Admin/Operador**: Podem criar novas prospecções
- **Visualizador**: ❌ Não tem acesso ao formulário de prospecção

### Tabela de Leads
| Ação | Admin | Operador | Visualizador |
|------|-------|----------|--------------|
| Visualizar leads | ✅ | ✅ | ✅ |
| Selecionar leads (checkbox) | ✅ | ✅ | ❌ |
| Editar lead individual | ✅ | ✅ | ❌ |
| Deletar lead individual | ✅ | ✅ | ❌ |
| Enviar WhatsApp individual | ✅ | ✅ | ❌ |
| Exportar (CSV/Excel) | ✅ | ✅ | ✅ |
| Aplicar template | ✅ | ✅ | ❌ |
| Enviar WhatsApp em massa | ✅ | ✅ | ❌ |
| Deletar em massa | ✅ | ❌ | ❌ |
| Filtros avançados | ✅ | ✅ | ✅ |

### Kanban Board
- **Admin/Operador**: Podem arrastar/soltar cards, editar status
- **Visualizador**: ❌ Apenas visualização (drag and drop desabilitado)

### Integrações
- **Admin**: Pode configurar webhooks e visualizar logs
- **Operador/Visualizador**: ❌ Não tem acesso à página

### Configurações
| Seção | Admin | Operador | Visualizador |
|-------|-------|----------|--------------|
| Dados da Empresa | ✅ | ✅ | ✅ |
| Evolution API | ✅ | ✅ | ❌ |
| Gerenciamento de Roles | ✅ | ❌ | ❌ |

---

## 6. Troubleshooting

### ❌ "Erro ao carregar role do usuário"

**Causa**: user_settings não existe para o usuário

**Solução**:
```sql
-- Criar user_settings com role padrão (operador)
INSERT INTO user_settings (user_id, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'usuario@example.com'),
  'operador'
);
```

### ❌ "Você não tem permissão para esta ação"

**Causa**: Usuário não tem o role adequado

**Verificar role atual**:
```sql
SELECT u.email, us.role
FROM auth.users u
JOIN user_settings us ON u.id = us.user_id
WHERE u.email = 'usuario@example.com';
```

**Atualizar role** (apenas admin pode fazer):
```sql
UPDATE user_settings
SET role = 'admin'  -- ou outro role
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'usuario@example.com');
```

### ❌ Botões não aparecem na interface

**Causa**: RoleGuard está escondendo os componentes

**Verificação**:
1. Abra DevTools (F12)
2. Vá na aba Console
3. Digite: `localStorage.getItem('supabase.auth.token')`
4. Verifique se está autenticado
5. Faça logout e login novamente

### ❌ Migration falhou ao aplicar

**Erro comum**: "relation already exists"

**Solução**: A migration já foi aplicada. Verifique:
```sql
-- Ver se a coluna role existe
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_settings'
AND column_name = 'role';
```

### ❌ "Cannot read property 'canUpdate' of undefined"

**Causa**: Hook useUserRole não está carregando

**Solução**:
1. Verifique se está dentro de um `<AuthProvider>`
2. Aguarde isLoading do hook antes de renderizar
3. Limpe cache do navegador (Ctrl+Shift+Del)
4. Logout e login novamente

---

## 🎯 Checklist de Setup Completo

Use este checklist para garantir que tudo está configurado:

- [ ] Migration aplicada no Supabase
- [ ] Primeiro admin criado via SQL
- [ ] Login como admin funcionando
- [ ] Badge de role aparece no sidebar
- [ ] Seção "Gerenciamento de Roles" visível em Configurações
- [ ] Consegue alterar role de outros usuários
- [ ] Testou login como operador (botões apropriados aparecem)
- [ ] Testou login como visualizador (apenas leitura)
- [ ] Bulk delete só aparece para admin
- [ ] Logs de auditoria registrando mudanças de role

---

## 📞 Suporte

Problemas não cobertos neste guia?

1. Verifique o código em `src/hooks/useUserRole.ts`
2. Consulte a migration em `supabase/migrations/20250119_user_roles.sql`
3. Verifique RLS policies no Supabase Dashboard
4. Consulte logs de erro no browser console (F12)

---

**Última atualização**: 2025-01-19
**Versão do Sistema**: 2.0 (Fase 2 - Sistema de Roles)
