# Configuração de Email - Supabase Auth

## 🚨 Problema: "Email não confirmado"

Por padrão, o Supabase **exige confirmação de email** ao criar conta. Existem 2 soluções:

---

## ✅ Solução 1: Desabilitar Confirmação (Desenvolvimento)

**⚠️ Use apenas em desenvolvimento! Não recomendado para produção.**

### Passos:

1. **Abra o Supabase Dashboard**
   - URL: https://supabase.com/dashboard/project/swkukafujhsyfaoojhfj

2. **Vá em Authentication → Settings**
   - Menu lateral: **Authentication**
   - Aba: **Settings**

3. **Desabilite "Enable email confirmations"**
   - Procure por: **Enable email confirmations**
   - Toggle: **OFF** (desligado)
   - Clique em: **Save**

4. **Teste novamente**
   - Crie uma nova conta
   - Agora pode fazer login imediatamente!

---

## ✅ Solução 2: Configurar SMTP (Produção - Recomendado)

Para emails funcionarem em produção, configure SMTP:

### Opção A: Usar SMTP Próprio

1. **Supabase Dashboard → Authentication → Settings**

2. **Role até "SMTP Settings"**

3. **Preencha:**
   ```
   SMTP Host: smtp.gmail.com (exemplo)
   SMTP Port: 587
   SMTP User: seu-email@gmail.com
   SMTP Password: sua-senha-de-app
   Sender Email: seu-email@gmail.com
   Sender Name: LeadFinder Pro
   ```

4. **Teste**:
   - Cadastre novo usuário
   - Verifique se email chegou

### Opção B: Usar Serviço de Email

Serviços recomendados:
- **SendGrid** (100 emails/dia grátis)
- **Mailgun** (100 emails/dia grátis)
- **Amazon SES** (62.000 emails/mês grátis)

### Exemplo com SendGrid:

1. **Criar conta**: https://sendgrid.com/
2. **Criar API Key**: Settings → API Keys
3. **Configurar no Supabase**:
   ```
   SMTP Host: smtp.sendgrid.net
   SMTP Port: 587
   SMTP User: apikey
   SMTP Password: [SUA_API_KEY_AQUI]
   Sender Email: noreply@seudominio.com
   ```

---

## 📧 Configurar Templates de Email (Opcional)

Personalize os emails enviados:

1. **Supabase → Authentication → Email Templates**

2. **Templates disponíveis:**
   - **Confirm signup** (Confirmação de cadastro)
   - **Reset password** (Recuperação de senha)
   - **Magic link** (Login sem senha)

3. **Personalize** com HTML/CSS e variáveis:
   ```html
   <h2>Bem-vindo ao LeadFinder Pro!</h2>
   <p>Olá {{ .Name }},</p>
   <p>Clique no link abaixo para confirmar seu email:</p>
   <a href="{{ .ConfirmationURL }}">Confirmar Email</a>
   ```

---

## 🧪 Testar Fluxo Completo

### Com confirmação DESABILITADA:
```bash
1. Criar conta → Login direto ✅
```

### Com confirmação HABILITADA:
```bash
1. Criar conta → Mensagem "Verifique seu email" ✅
2. Abrir email → Clicar link de confirmação ✅
3. Fazer login → Sucesso ✅
```

---

## 💡 Recomendações

### Para Desenvolvimento:
- ✅ **Desabilite confirmação** (mais rápido para testar)
- ⚠️ Lembre de habilitar antes do deploy

### Para Produção:
- ✅ **Habilite confirmação** (segurança)
- ✅ **Configure SMTP próprio** (melhor deliverability)
- ✅ **Use domínio próprio** para emails
- ✅ **Personalize templates**
- ✅ **Configure SPF/DKIM** (evita spam)

---

## 🔗 Links Úteis

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [SMTP Configuration](https://supabase.com/docs/guides/auth/auth-smtp)
- [Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
