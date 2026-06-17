# IntelliX — Templates WhatsApp e Guia de Operação
## Campanha: Encontro & Relacionamento

> **Tenant:** `intellix` | **Provider:** Meta Cloud API | **Responsável:** Felipe (contato@intellixai.com.br)

---

## T2 — Configuração Meta (manual no banco)

Após obter as credenciais no Meta Business Manager, execute no Supabase SQL Editor:

```sql
UPDATE user_settings
SET
  business_phone_number_id = '<SEU_PHONE_NUMBER_ID>',
  business_access_token    = '<SEU_SYSTEM_USER_TOKEN>',
  meta_verify_token        = '<TOKEN_VERIFICAÇÃO_WEBHOOK>',
  integration_configured   = true,
  updated_at               = now()
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'contato@intellixai.com.br'
);
```

**Webhook Meta → URL do sistema:**
- Verificação: `GET https://prospect-pulse-54.vercel.app/api/webhooks/evolution?hub.verify_token=<TOKEN>&hub.challenge=<CHALLENGE>`
- Recebimento: `POST https://prospect-pulse-54.vercel.app/api/webhooks/evolution`

**Secrets Vercel (Dashboard → Project → Settings → Environment Variables):**
```
WHATSAPP_PROVIDER=meta
META_WA_TOKEN=EAAxxxxx
META_WA_PHONE_NUMBER_ID=123456789
META_WA_VERSION=v20.0
META_WA_VERIFY_TOKEN=<mesmo-token-acima>
OPENAI_API_KEY=sk-...
CRON_SECRET=<segredo-forte-aqui>
```

---

## T6 — Templates de Primeira Mensagem (Meta Business Manager)

Cadastre em: Meta Business Manager → WhatsApp → Gerenciar Templates → Criar Template
- **Categoria:** Marketing
- **Idioma:** Português (Brasil)
- **Variáveis:** `{{1}}` = primeiro nome, `{{2}}` = empresa

---

### `intellix_er_universal_v1` (fallback)
```
Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro & Relacionamento do Dirceu Cordeiro — foi muito bom conhecer o trabalho da {{2}}. Queria te mandar um resumo de 2 minutos sobre como ajudamos empresas do Nordeste a automatizar tarefas repetitivas com IA, sem complicar a operação. Posso te enviar? Se preferir não receber, responda "sair".
```

### `intellix_er_construcao_v1`
```
Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se cruzou no Encontro & Relacionamento do Dirceu Cordeiro — foi bom conhecer a {{2}}. Trabalho com empresas de construção e imobiliário que perdem tempo qualificando leads sem perfil e fazendo follow-up manual em negociação longa. Posso te mostrar como resolver em 2 minutos? Se preferir não receber, responda "sair".
```

### `intellix_er_juridico_v1`
```
Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — curti conhecer a {{2}}. Muitos escritórios perdem tempo com triagem de casos fora do perfil e atendimento inicial que não converte. Tenho uma solução específica para isso. Posso te mandar um resumo? Se preferir não receber, responda "sair".
```

### `intellix_er_saude_v1`
```
Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — foi ótimo conhecer a {{2}}. Clínicas e laboratórios costumam ter duas dores: confirmar consultas manualmente e perder pacientes que não retornam. A gente resolve as duas com IA, sem trocar de sistema. Posso te mandar um resumo? Se preferir não receber, responda "sair".
```

### `intellix_er_atacado_v1`
```
Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se cruzou no Encontro do Dirceu Cordeiro — curti conhecer a {{2}}. Distribuidoras e atacadistas perdem tempo respondendo pedidos no WhatsApp e cobrando manualmente. A gente automatiza isso e libera o time. Posso te mostrar como funciona? Se preferir não receber, responda "sair".
```

### `intellix_er_tech_v1`
```
Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — foi bom trocar ideia com a {{2}}. Empresas de TI têm dois desafios: prospecção ativa escassa e suporte que consome o time técnico. Tenho soluções para os dois — e uma conversa sobre parceria que pode fazer sentido. Posso mandar mais detalhes? Se preferir não receber, responda "sair".
```

### `intellix_er_agencia_v1`
```
Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — curti conhecer a {{2}}. Agências perdem tempo gerando relatório manual e fazendo onboarding de novos contratos. A gente automatiza isso com IA e o time foca em estratégia. Posso te mandar um resumo? Se preferir não receber, responda "sair".
```

### `intellix_er_financeiro_v1`
```
Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se cruzou no Encontro do Dirceu Cordeiro — foi bom conhecer a {{2}}. Empresas de consultoria e seguros recebem muitos leads mas qualificam poucos, e perdem venda por falta de follow-up. A gente resolve isso com automação inteligente. Posso te mostrar como? Se preferir não receber, responda "sair".
```

### `intellix_er_energiasolar_v1`
```
Oi, {{1}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — curti conhecer a {{2}}. Empresas de energia solar recebem muitos leads mas convertem pouco, por falta de qualificação rápida e follow-up pós-visita. A gente automatiza esse funil. Posso te mandar um resumo? Se preferir não receber, responda "sair".
```

---

## Mapeamento categoria → template (para o disparo em massa)

| Categoria (campo `categoria` do lead) | Template |
|---|---|
| Construção, Incorporação, Imobiliário, Imóveis*, Construtora | `intellix_er_construcao_v1` |
| Jurídico*, Advocacia, Trabalhista, Direito | `intellix_er_juridico_v1` |
| Saúde*, Clínica, Odontologia, Laboratório, Harmonização | `intellix_er_saude_v1` |
| Atacado*, Distribuição*, Food Service, Alimentício, Supermercado | `intellix_er_atacado_v1` |
| Tecnologia*, TI, Telecom, Suporte | `intellix_er_tech_v1` |
| Marketing*, Agência*, Publicidade, Comunicação, Tráfego | `intellix_er_agencia_v1` |
| Consultoria*, Financeiro*, Seguros*, Consórcio, Finanças | `intellix_er_financeiro_v1` |
| Energia Solar | `intellix_er_energiasolar_v1` |
| Qualquer outro | `intellix_er_universal_v1` |

*Matching parcial (contém a palavra) — use ILIKE no filtro.

---

## T9 — Plano de aquecimento e disparo

**O número Meta é novo — aqueça antes de disparar em massa.**

| Semana | Segmentos prioritários | Volume/dia |
|---|---|---|
| 1 | Construção, Jurídico, Saúde, Energia Solar | 50/dia |
| 2 | Atacado/Distribuição, Tecnologia/TI, Agências | 80/dia |
| 3 | Consultoria/Financeiro + demais | 100/dia |
| 4+ | Remainder + follow-ups pendentes | até 200/dia |

**Como disparar via sistema (F7 — Bulk WhatsApp):**
1. Acesse `/leads` → selecione leads por `categoria` e `estagio_pipeline = 'Novo'`
2. Ação em massa → "Enviar WhatsApp" → selecione template correspondente
3. Configure delay entre mensagens: mínimo 10s para aquecimento (semana 1)
4. O sistema atualiza automaticamente `estagio_pipeline = 'Contato Inicial'` e `status_msg_wa = 'sent'`

**SQL para verificar antes de cada lote:**
```sql
SELECT categoria, COUNT(*) as total
FROM leads_prospeccao
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'contato@intellixai.com.br')
  AND tenant_id = 'intellix'
  AND estagio_pipeline = 'Novo'
  AND status_msg_wa = 'not_sent'
  AND modo_atendimento = 'bot'
GROUP BY categoria
ORDER BY total DESC;
```

---

## Checklist de validação

```
[ ] contato@intellixai.com.br existe no Supabase Auth
[ ] user_settings: provider='meta', pending_setup=false, consultant_whatsapp preenchido
[ ] 111+ leads em leads_prospeccao com tenant_id='intellix', estagio_pipeline='Novo'
[ ] agent_configs: is_active=true, model='gpt-4.1', temperature=0.6, prompt Bia v1
[ ] rag_documents: 4 docs com status='ready' (RAG_Leads_Dossie + 3 institucionais)
[ ] Secrets Vercel: META_WA_TOKEN, META_WA_PHONE_NUMBER_ID, OPENAI_API_KEY, CRON_SECRET
[ ] user_settings: business_phone_number_id e business_access_token preenchidos
[ ] Webhook Meta verificado em /api/webhooks/evolution
[ ] 9 templates aprovados no Meta Business Manager
[ ] Teste ponta a ponta: template → lead responde → Bia (5 etapas) → pede humano → Felipe notificado
[ ] build sem erro: npm run build
```
