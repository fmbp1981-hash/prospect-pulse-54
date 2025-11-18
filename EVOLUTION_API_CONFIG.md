# Configuração da Evolution API para Verificação de WhatsApp

## 📋 Visão Geral

A prospecção agora verifica automaticamente se os números de telefone encontrados têm WhatsApp ativo usando a **Evolution API**.

## 🔑 Variáveis de Ambiente Necessárias

Configure estas variáveis no **Supabase Edge Function Secrets**:

### 1. EVOLUTION_API_URL
**Descrição**: URL base da sua instância Evolution API

**Formato**:
```
https://sua-evolution-api.com/instance/SUA_INSTANCIA
```

**Exemplo**:
```
https://evolution.meudominio.com.br/instance/leadfinder
```

**Onde encontrar**:
- Dashboard da Evolution API → Instances → Copiar URL da instância

### 2. EVOLUTION_API_KEY
**Descrição**: API Key para autenticação

**Formato**: String alfanumérica longa

**Exemplo**:
```
B6D9F6E3-4B89-4B0E-8F9E-1234567890AB
```

**Onde encontrar**:
- Dashboard da Evolution API → API Key → Copiar

---

## ⚙️ Como Configurar no Supabase

### Opção 1: Via Dashboard (Recomendado)

1. Acesse: https://supabase.com/dashboard/project/kzvnwqlcrtxwagxkghxq/functions
2. Clique na função `prospection`
3. Vá em **Settings** → **Secrets**
4. Adicione as variáveis:

```bash
EVOLUTION_API_URL = https://sua-evolution-api.com/instance/SUA_INSTANCIA
EVOLUTION_API_KEY = B6D9F6E3-4B89-4B0E-8F9E-1234567890AB
```

5. Clique em **Save**

### Opção 2: Via CLI

```bash
# Configurar Evolution API URL
supabase secrets set EVOLUTION_API_URL="https://sua-evolution-api.com/instance/SUA_INSTANCIA" --project-ref kzvnwqlcrtxwagxkghxq

# Configurar Evolution API Key
supabase secrets set EVOLUTION_API_KEY="B6D9F6E3-4B89-4B0E-8F9E-1234567890AB" --project-ref kzvnwqlcrtxwagxkghxq
```

---

## 🔍 Como Funciona

### Fluxo de Verificação

```
1. Google Places retorna telefone
      ↓
2. Edge Function chama Evolution API
      ↓
3. Evolution verifica: "Número tem WhatsApp?"
      ↓
4. SIM → Vai para coluna `whatsapp`
   NÃO → Vai para coluna `telefone`
```

### Endpoint Utilizado

```http
POST /checkNumber
Content-Type: application/json
apikey: {EVOLUTION_API_KEY}

{
  "number": "5511999999999"
}
```

### Resposta Esperada

```json
{
  "exists": true,
  "jid": "5511999999999@s.whatsapp.net"
}
```

**OU**

```json
{
  "onWhatsApp": true,
  "jid": "5511999999999@s.whatsapp.net"
}
```

---

## 🚨 Comportamento sem Configuração

Se as variáveis de ambiente **NÃO forem configuradas**:

- ✅ A prospecção **continua funcionando** normalmente
- ⚠️ **TODOS os números** são assumidos como WhatsApp
- 📝 Números vão para a coluna `whatsapp` (não para `telefone`)
- 💬 Log no console: `"⚠️ Evolution API não configurada, assumindo que número tem WhatsApp"`

---

## 🧪 Testando a Configuração

### 1. Verificar se as Variáveis Estão Configuradas

No Supabase Dashboard:
- Functions → prospection → Settings → Secrets
- Verifique se `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` estão presentes

### 2. Fazer uma Prospecção de Teste

1. Prospecte 2-3 leads (ex: "Pizzarias em São Paulo")
2. Abra o **Console do Navegador** (F12)
3. Procure pelos logs:
   - `🔍 Verificando WhatsApp: +55...`
   - `✅ [número] TEM WhatsApp` OU `❌ [número] NÃO TEM WhatsApp`

### 3. Verificar no Banco de Dados

```sql
-- Ver leads com WhatsApp
SELECT empresa, whatsapp, telefone
FROM public.leads_prospeccao
WHERE whatsapp IS NOT NULL;

-- Ver leads sem WhatsApp
SELECT empresa, whatsapp, telefone
FROM public.leads_prospeccao
WHERE telefone IS NOT NULL;
```

---

## ❌ Troubleshooting

### Problema 1: Todos os Números Vão para WhatsApp

**Causa**: Evolution API não configurada ou inacessível

**Solução**:
1. Verificar se variáveis estão configuradas no Supabase
2. Testar Evolution API manualmente:
```bash
curl -X POST https://sua-evolution-api.com/checkNumber \
  -H "Content-Type: application/json" \
  -H "apikey: SUA_API_KEY" \
  -d '{"number": "5511999999999"}'
```

### Problema 2: Erro 401/403 na Evolution API

**Causa**: API Key inválida ou expirada

**Solução**:
1. Gerar nova API Key no Dashboard da Evolution
2. Atualizar `EVOLUTION_API_KEY` no Supabase

### Problema 3: Erro 404 na Evolution API

**Causa**: URL da instância incorreta

**Solução**:
1. Verificar URL no Dashboard da Evolution
2. Formato correto: `https://dominio.com/instance/NOME_INSTANCIA`
3. **NÃO** incluir `/checkNumber` no final da URL base

### Problema 4: Timeout

**Causa**: Evolution API muito lenta ou fora do ar

**Solução**:
- Verificar status da Evolution API
- Aumentar timeout (atual: padrão do fetch)
- Considerar usar fallback (assumir WhatsApp em caso de erro)

---

## 📊 Logs de Debug

A Edge Function gera logs detalhados:

```bash
# Ver logs da função
supabase functions logs prospection

# Ou no Dashboard
https://supabase.com/dashboard/project/kzvnwqlcrtxwagxkghxq/functions/prospection/logs
```

**Logs esperados**:
```
🔍 Verificando WhatsApp: +55 11 99999-9999
✅ +55 11 99999-9999 TEM WhatsApp
📞 +55 11 88888-8888 NÃO TEM WhatsApp
```

---

## 🔐 Segurança

### Boas Práticas

1. **Nunca commite API Keys** no código
2. **Use HTTPS** para Evolution API
3. **Restrinja IPs** na Evolution API (se possível)
4. **Rotacione API Keys** periodicamente
5. **Monitore uso** da Evolution API

### Permissões Necessárias

A API Key da Evolution precisa ter permissão para:
- ✅ `checkNumber` (verificar número)

Outras permissões **NÃO são necessárias** para esta funcionalidade.

---

## 📝 Notas Importantes

1. **Performance**: Cada número verificado = 1 requisição à Evolution API
   - Para 20 leads: ~20 requisições (em paralelo, ~2-3 segundos)

2. **Rate Limiting**: Evolution API pode ter limites de requisições
   - Verifique documentação da sua instância
   - Considere adicionar delay entre verificações se necessário

3. **Custos**: Verifique se sua instância Evolution cobra por requisição

4. **Fallback**: Em caso de erro na API, o sistema assume que é WhatsApp
   - Evita bloqueio da prospecção
   - Pode gerar falsos positivos

---

## 🆘 Suporte

- **Evolution API Docs**: https://doc.evolution-api.com
- **Supabase Docs**: https://supabase.com/docs/guides/functions

---

**Última Atualização**: 2025-11-17
**Versão**: 1.0
