# 🤖 Gerador de Templates com IA - Guia de Configuração

**Versão:** 1.0
**Data:** 17/11/2025

---

## 📋 Visão Geral

O sistema permite gerar templates de WhatsApp automaticamente usando Inteligência Artificial. Suporta duas APIs:

1. **Groq** (Llama 3.3 70B) - **GRATUITA** e super rápida ⚡ **[RECOMENDADA]**
2. **Google Gemini Flash** - Gratuita até 15 req/min

---

## 🚀 Configuração Rápida

### Opção 1: Groq API (RECOMENDADA - 100% Gratuita)

#### 1. Obter API Key Gratuita

1. Acesse: https://console.groq.com
2. Crie uma conta (gratuita)
3. Vá em: **API Keys** → **Create API Key**
4. Copie a chave gerada

#### 2. Configurar no Supabase

**Via Dashboard (Recomendado):**
1. Acesse: https://supabase.com/dashboard/project/kzvnwqlcrtxwagxkghxq/settings/vault
2. Clique em **"New Secret"**
3. Nome: `GROQ_API_KEY`
4. Valor: Cole sua API key da Groq
5. Clique em **"Add Secret"**

**Via CLI:**
```bash
npx supabase secrets set GROQ_API_KEY=sua-chave-aqui
```

#### 3. Testar

1. Abra o aplicativo
2. Vá em **"Gerenciar Templates"** (sidebar)
3. Clique em **"Gerar com IA"** (botão roxo)
4. Descreva o template que quer
5. Clique em **"Gerar Template"**
6. Aguarde 3-5 segundos
7. Revise e salve!

---

### Opção 2: Google Gemini Flash (Alternativa Gratuita)

#### 1. Obter API Key

1. Acesse: https://makersuite.google.com/app/apikey
2. Crie uma conta Google (se necessário)
3. Clique em **"Create API Key"**
4. Copie a chave gerada

#### 2. Configurar no Supabase

**Via Dashboard:**
1. Acesse: https://supabase.com/dashboard/project/kzvnwqlcrtxwagxkghxq/settings/vault
2. Clique em **"New Secret"**
3. Nome: `GEMINI_API_KEY`
4. Valor: Cole sua API key do Gemini
5. Clique em **"Add Secret"**

**Via CLI:**
```bash
npx supabase secrets set GEMINI_API_KEY=sua-chave-aqui
```

---

## 💡 Como Funciona

### Fluxo Completo

```
1. Usuário descreve o que quer
   ↓
2. Frontend chama Edge Function no Supabase
   ↓
3. Edge Function chama Groq ou Gemini
   ↓
4. IA gera 3 variações:
   - Variação 1: Tom FORMAL (👔)
   - Variação 2: Tom CASUAL (😊)
   - Variação 3: Tom DIRETO (🎯)
   ↓
5. Usuário revisa e edita se necessário
   ↓
6. Salva o template pronto!
```

### Exemplo de Uso

**Entrada do Usuário:**
> "Quero uma mensagem para oferecer nosso serviço de consultoria empresarial para empresas que estão crescendo rapidamente. Enfatizar que ajudamos a escalar operações."

**IA Gera Automaticamente:**

**Variação 1 - Formal (👔):**
```
Olá! 👋

Notei que a {{empresa}} em {{cidade}} está crescendo e tenho uma proposta interessante.

Nossa consultoria ajuda empresas de {{categoria}} a escalar operações mantendo a qualidade. Já ajudamos dezenas de negócios similares.

Podemos agendar 15 minutos para eu apresentar?

Atenciosamente
```

**Variação 2 - Casual (😊):**
```
Oi! Tudo bem?

Vi a {{empresa}} e achei incrível! Vocês estão crescendo bastante né?

A gente ajuda empresas de {{categoria}} como vocês a crescer sem perder a qualidade. Bora bater um papo sobre isso?

Abraço!
```

**Variação 3 - Direto (🎯):**
```
{{empresa}},

Consultoria para escalabilidade operacional em {{categoria}}.

ROI comprovado. 15 min para apresentar?

Aguardo retorno.
```

---

## 🎨 Recursos do Gerador

### Parâmetros Configuráveis

1. **Categoria do Template**
   - Primeiro Contato
   - Follow-up
   - Proposta
   - Negociação
   - Pós-venda
   - Personalizado

2. **Tom Geral**
   - 👔 Profissional (mais formal)
   - 🎯 Misto (balanceado) - **RECOMENDADO**
   - 😊 Casual (mais descontraído)

3. **Descrição Livre**
   - Descreva o objetivo, público-alvo e benefícios
   - Quanto mais específico, melhor o resultado!

### Variáveis Inseridas Automaticamente

A IA usa automaticamente estas variáveis nos templates:

- `{{empresa}}` - Nome da empresa do lead
- `{{categoria}}` - Categoria/nicho do negócio
- `{{cidade}}` - Cidade do lead
- `{{contato}}` - Nome do contato
- `{{lead}}` - ID do lead (Lead-001, etc)

---

## 📊 Comparação: Groq vs Gemini

| Característica | Groq (Llama 3) | Gemini Flash |
|---------------|----------------|--------------|
| **Preço** | 100% Gratuito | Gratuito até 15/min |
| **Velocidade** | ⚡ Super rápida (2-3s) | Rápida (3-5s) |
| **Qualidade** | Excelente | Excelente |
| **Limite** | Alto | 15 req/min gratuito |
| **Recomendação** | ✅ **MELHOR** | ✅ Boa alternativa |

---

## 🔧 Troubleshooting

### Erro: "Nenhuma API de IA configurada"

**Causa:** API key não foi configurada no Supabase

**Solução:**
1. Configure `GROQ_API_KEY` conforme instruções acima
2. Aguarde 1-2 minutos para propagar
3. Tente novamente

### Erro: "IA API error: 401"

**Causa:** API key inválida ou expirada

**Solução:**
1. Verifique se copiou a chave corretamente
2. Gere uma nova chave
3. Atualize no Supabase Vault

### Erro: "Erro ao gerar template"

**Causa:** Problema na comunicação com a IA

**Solução:**
1. Tente novamente (pode ser temporário)
2. Simplifique a descrição
3. Verifique logs no Supabase:
   - Dashboard → Edge Functions → generate-template-ai → Logs

### Templates não são salvos

**Causa:** Você precisa clicar em "Usar Template" e depois "Salvar"

**Solução:**
1. Gere o template
2. Clique em **"Usar Template"**
3. Revise no editor
4. Clique em **"Criar Template"** ou **"Salvar Alterações"**

---

## 💰 Custos

### Groq (RECOMENDADA)
- ✅ **100% GRATUITA**
- Sem limites significativos
- Perfeito para uso ilimitado

### Gemini Flash
- ✅ **Gratuita até 15 requisições/minuto**
- Depois: $0.00025 por requisição (~R$ 0,0012)
- 1000 gerações = ~R$ 1,20

### Exemplo de Economia

Se você gerar **100 templates por mês**:
- **Com Groq**: R$ 0,00 ✅
- **Com Gemini**: R$ 0,00 (dentro do limite gratuito) ✅
- **Manualmente**: ~10 horas de trabalho 😰

---

## 📝 Dicas para Melhores Resultados

### ✅ Faça:

1. **Seja específico na descrição**
   - ❌ "Uma mensagem de vendas"
   - ✅ "Mensagem oferecendo consultoria de RH para empresas com 50-200 funcionários, focando em redução de turnover"

2. **Mencione o público-alvo**
   - "Para empresas de tecnologia em crescimento"
   - "Para restaurantes familiares tradicionais"

3. **Destaque os principais benefícios**
   - "Enfatizar ROI rápido"
   - "Destacar facilidade de implementação"

### ❌ Evite:

1. Descrições muito vagas
2. Pedidos contraditórios ("seja formal e casual ao mesmo tempo")
3. Textos muito longos (a IA já limita para 30-80 palavras)

---

## 🎯 Casos de Uso

### 1. Prospecção Inicial
```
Descrição: "Mensagem para contato inicial com clínicas médicas oferecendo
sistema de agendamento online. Enfatizar redução de no-show e facilidade
para pacientes."

Tom: Profissional
Categoria: Primeiro Contato
```

### 2. Follow-up Pós-Reunião
```
Descrição: "Follow-up após reunião comercial, relembrar os pontos discutidos
e propor próximos passos. Tom consultivo e próximo."

Tom: Misto
Categoria: Follow-up
```

### 3. Proposta Comercial
```
Descrição: "Enviar proposta comercial para implementação de software ERP.
Destacar prazo de implantação (60 dias) e suporte dedicado."

Tom: Profissional
Categoria: Proposta
```

---

## 🔐 Segurança

### Boas Práticas

1. **API Keys ficam no backend** (Supabase Edge Function)
2. **Nunca exponha as keys no frontend**
3. **Use secrets do Supabase Vault**
4. **Rotacione keys periodicamente** (a cada 6 meses)

### Dados Enviados

A IA recebe apenas:
- Sua descrição do template
- Categoria e tom escolhidos
- **NÃO recebe**: Dados de leads, nomes, telefones, etc.

---

## 📞 Suporte

### Problemas Técnicos

1. **Verifique logs** no Supabase Dashboard
2. **Teste manualmente** a Edge Function:
   ```bash
   curl -X POST https://kzvnwqlcrtxwagxkghxq.supabase.co/functions/v1/generate-template-ai \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer sua-anon-key" \
     -d '{
       "description": "Teste de mensagem",
       "category": "Primeiro Contato",
       "tone": "misto"
     }'
   ```

3. **Consulte documentação**:
   - Groq: https://console.groq.com/docs
   - Gemini: https://ai.google.dev/docs

---

## 🚀 Próximas Melhorias (Futuro)

- [ ] Suporte a mais modelos de IA (Claude, GPT-4, etc)
- [ ] Histórico de templates gerados
- [ ] Refinamento iterativo ("Gerar novamente com mais criatividade")
- [ ] Templates por segmento (ex: "Templates para Restaurantes")
- [ ] A/B Testing automático de variações

---

**Implementado:** 17/11/2025
**Edge Function:** `generate-template-ai`
**Status:** ✅ Funcional e em produção

🤖 Generated with [Claude Code](https://claude.com/claude-code)
