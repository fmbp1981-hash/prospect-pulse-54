# 🚀 Guia de Deploy no Vercel

## Pré-requisitos

- ✅ Conta no [Vercel](https://vercel.com)
- ✅ Repositório GitHub conectado
- ✅ Projeto Supabase configurado

---

## 📋 Passo a Passo

### 1. Acessar Vercel Dashboard

1. Acesse https://vercel.com/dashboard
2. Clique em **"Add New Project"**
3. Selecione **"Import Git Repository"**

### 2. Conectar Repositório GitHub

1. Selecione: `fmbp1981-hash/prospect-pulse-54`
2. Branch: **`main`** (versão sem n8n)
3. Clique em **"Import"**

### 3. Configurar Projeto

O Vercel detectará automaticamente as configurações do `vercel.json`:

- ✅ Framework: **Vite**
- ✅ Build Command: `npm run build`
- ✅ Output Directory: `dist`
- ✅ Install Command: `npm install`

**Não precisa alterar nada!**

### 4. Configurar Variáveis de Ambiente

⚠️ **IMPORTANTE**: Configure estas variáveis no Vercel Dashboard:

Vá em: **Settings → Environment Variables**

Adicione:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-key-aqui
```

**Onde encontrar essas chaves:**
1. Acesse https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **Settings → API**
4. Copie:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** → `VITE_SUPABASE_ANON_KEY`

### 5. Deploy

1. Clique em **"Deploy"**
2. Aguarde o build (2-3 minutos)
3. ✅ Deploy concluído!

Você receberá uma URL tipo: `https://prospect-pulse-54.vercel.app`

---

## 🔄 Deploy Automático

Após o primeiro deploy, **TODA VEZ** que você fizer push na branch `main`:

```bash
git push origin main
```

O Vercel **automaticamente**:
1. Detecta o push
2. Faz build
3. Deploy da nova versão
4. Atualiza a URL

---

## 🎯 Configurações Avançadas (Opcional)

### Custom Domain

1. Vá em **Settings → Domains**
2. Adicione seu domínio personalizado
3. Configure DNS conforme instruções

### Performance

As configurações em `vercel.json` já incluem:
- ✅ Cache de assets por 1 ano
- ✅ Rewrites para SPA (Single Page Application)
- ✅ Otimizações automáticas

### Ambientes (Production/Preview)

- **Production** (main): Deploy automático da branch `main`
- **Preview**: Deploy automático de PRs e outras branches

---

## 🐛 Troubleshooting

### Build falhou?

1. **Verificar logs**: Clique no deploy falhado → Ver logs
2. **Comum**: Falta de variáveis de ambiente
3. **Solução**: Adicionar `VITE_SUPABASE_*` nas Environment Variables

### Página em branco após deploy?

1. **Verificar console do navegador** (F12)
2. **Comum**: Variáveis de ambiente não configuradas
3. **Solução**: Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

### Erro 404 em rotas?

- ✅ Já resolvido! O `vercel.json` tem rewrite para SPA

---

## 📊 Monitoramento

### Analytics (Built-in)

Vercel fornece analytics gratuito:
- Pageviews
- Unique visitors
- Top pages
- Performance metrics

Acesse em: **Analytics** no menu do projeto

### Logs

Veja logs em tempo real:
- Acesse **Deployments**
- Clique no deployment
- Aba **"Functions"** → Ver logs

---

## 🔒 Segurança

### Variáveis de Ambiente

✅ **Seguro**: Variáveis `VITE_SUPABASE_*` são públicas (usadas no frontend)

⚠️ **NUNCA expor**:
- Service Role Key do Supabase
- Chaves privadas de APIs
- Senhas ou secrets

### HTTPS

✅ Vercel fornece HTTPS automático para todos os deploys

---

## 📱 Pós-Deploy

### Atualizar Configurações do Supabase

Se você usa **Evolution API** ou webhooks:

1. Acesse Supabase Dashboard
2. Vá em **Edge Functions → prospection**
3. Atualize URLs de callback/webhook para a URL do Vercel

### Testar Aplicação

1. Acesse a URL do Vercel
2. Teste login/signup
3. Teste prospecção
4. Teste kanban board
5. Teste exportação

---

## 🎉 Pronto!

Seu projeto está no ar! 🚀

**URL**: https://prospect-pulse-54.vercel.app (exemplo)

**Deploy automático**: ✅ Ativado
**HTTPS**: ✅ Configurado
**Performance**: ✅ Otimizado

---

## 📞 Suporte

- **Vercel Docs**: https://vercel.com/docs
- **Vercel Community**: https://github.com/vercel/vercel/discussions
- **Supabase + Vercel**: https://supabase.com/docs/guides/hosting/vercel

---

**Criado com ❤️ por Claude Code**
