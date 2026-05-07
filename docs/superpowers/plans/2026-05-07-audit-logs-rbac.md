# Plano F10+F11 — Audit Logs Completos + RBAC Completo

**Projeto:** LeadFinder Pro (`prospect-pulse-54`)  
**Data:** 2026-05-07  
**Escopo:** F10 (Audit Logs completos) + F11 (RBAC completo)

---

## Contexto e Diagnóstico

### Estado atual
- `audit_logs` tabela existe mas sem coluna `user_email` e sem policy de admin (admin não consegue ver todos os logs)
- `audit.ts` usa `any` types e só tem 4 eventos (EXPORT, WHATSAPP, PROSPECTION, BULK_DELETE)
- `/integrations` protegida apenas client-side via `useUserRole` — sem server-side RBAC no middleware
- Vários fluxos críticos sem audit: login/logout, settings, webhooks, importação, mudança de role

### Decisões técnicas
- `user_email` armazenado desnormalizado em `audit_logs` — evita JOIN com `auth.users` server-side
- Admin vê todos os logs via nova RLS policy usando `is_admin()` (já existe em `user_settings`)
- Middleware protege `/integrations` via query `role` em `user_settings` (server-side, antes do render)

---

## Tasks

### T1: Migration SQL
**Arquivo:** `supabase/migrations/20260507_audit_logs_v2.sql`

- `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_email TEXT`
- `CREATE INDEX idx_audit_logs_user_email ON audit_logs(user_email)`
- `CREATE POLICY "Admins can view all audit logs" ON audit_logs FOR SELECT USING (is_admin())`

### T2: Fix `src/lib/audit.ts`
- Remover todos os `any` — tipar com `AuditEvent` union type
- Adicionar `user_email` no insert (buscar `user.email` após `getUser()`)
- Novos eventos: `LOGIN`, `LOGOUT`, `SETTINGS_CHANGE`, `WEBHOOK_KEY_CREATE`, `WEBHOOK_KEY_DELETE`, `IMPORT_LEADS`, `ROLE_CHANGE`
- `getAuditLogs(limit, action?)` — filtro opcional por action

### T3: Middleware RBAC para `/integrations`
**Arquivo:** `lib/supabase/middleware.ts`

- Adicionar bloco após a verificação de `pending_setup`
- Se `pathname.startsWith('/integrations')` → query `user_settings.role` → se não for `admin`, redirecionar para `/`
- Admin por email fixo (`fmbp1981@gmail.com`) passa sem query

### T4: Wiring de audit events
Arquivos a editar (localizar e confirmar paths antes):
- `AuthContext` → `logAudit(LOGIN)` no onAuthStateChange sign_in, `logAudit(LOGOUT)` no signOut
- Settings page → `logAudit(SETTINGS_CHANGE)` ao salvar configurações
- `WebhookKeysPanel` → `logAudit(WEBHOOK_KEY_CREATE/DELETE)` ao criar/deletar chave
- `ImportLeadsModal` → `logAudit(IMPORT_LEADS)` ao concluir importação com sucesso
- `RoleManagement` component → `logAudit(ROLE_CHANGE)` ao aprovar/mudar role

### T5: UI `/integrations` — coluna email + filtro
**Arquivo:** `app/(protected)/integrations/page.tsx`

- Adicionar coluna "Usuário" na tabela de logs (exibe `user_email`)
- Adicionar `<Select>` para filtrar por action (ALL + cada action conhecida)
- Chamar `getAuditLogs(50, selectedAction)` ao mudar filtro
