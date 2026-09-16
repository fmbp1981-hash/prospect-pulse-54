# Framework de Prospecção Multicanal — Planejamento

Branch: `claude/prospeccao-multicanal-linkedin`
Status: planejamento (nenhum código implementado ainda)
Base: `~/Downloads/intellix-framework-prospeccao-multicanal.md` + framework "Scrap → Filtro → Abordagem"

## 1. Objetivo

Evoluir o LeadFinder Pro de um sistema de prospecção mono-canal (Google Places) para
uma plataforma multicanal (Google Maps + LinkedIn + Instagram) com enriquecimento
orientado a lacunas, um gate de filtro/qualificação explícito, e abordagem
(e-mail/WhatsApp/Instagram) com controle de consentimento.

## 2. Pipeline de referência (revisado)

O pipeline original do documento colocava o ICP score quase no final (depois de todo
o enriquecimento). O framework "Scrap → Filtro → Abordagem" mostra a prática mais
eficiente: filtrar por nicho **antes** de gastar chamadas de enriquecimento pagas.
Por isso o pipeline abaixo tem **dois cortes de qualificação**, não um só.

```text
1. SCRAP (canais de origem)
   - Google Maps / Google Meu Negócio -> descoberta de empresas
   - LinkedIn -> pessoas, cargos, decisores (via fonte licenciada, nunca automação de conta)
   - Instagram -> presença digital, sinais de intenção (comentários em perfis)

2. FILTRO DE NICHO (corte barato, logo após o scrap)
   Pergunta: "o que esse cliente precisa TER para ser qualificado?"
   Regra simples sobre dados já coletados no scrap (categoria, cidade, porte aparente).
   REPROVADO -> descarta ou põe em quarentena, NÃO avança para enriquecimento pago
   APROVADO  -> segue para enriquecimento

3. ENRIQUECIMENTO ORIENTADO A LACUNAS (gap-first)
   Busca em fonte secundária SOMENTE o campo que está vazio/desatualizado/baixa confiança.
   Nunca sobrescreve valor anterior — mantém `source`, `confidence`, `collected_at` por campo.

4. QUALIFICAÇÃO FINA (ICP score, com dados completos)
   Score ponderado (indústria, porte, estado, senioridade, cargo, e-mail válido).
   Faixas: A (0.80–1.00) pronto para abordagem | B (0.60–0.79) cobertura maior | C (<0.60) quarentena/descarte

5. ABORDAGEM MULTICANAL
   Pergunta de canal: e-mail, WhatsApp, Direct do Instagram?
   Pergunta de método: mensagem direta ou "entrego uma análise antes"?
   Sujeito a Policy Engine (consentimento, opt-out, templates aprovados)
```

## 3. Canais de origem

### 3.1 Google Maps / Google Meu Negócio (já existe — manter)
Conector atual (Firecrawl + Supabase) permanece como está. Campos: `company_name`,
`phone_business`, `website`, `address`, `city`, `state`, `category`, `rating`,
`review_count`, `maps_url`.

### 3.2 LinkedIn (não existe hoje — só campo de texto livre)
Função: identificar pessoas associadas a empresas — cargo, departamento, senioridade,
URL pública de perfil.

**Classificação de risco obrigatória** (LinkedIn proíbe scraping/bots/automação via ToS):
- `licensed_api` — provedor com licença de dados formal (nenhum candidato confirmado
  até 2026-09; Proxycurl, cotado antes, **fechou em jul/2025 após ser processado pela
  LinkedIn** — não usar como referência)
- `vendor_dataset`
- `public_web_research` — **recomendado como padrão do MVP**: actors Apify
  "cookieless"/"no-login" (proxy residencial + busca indexada), sem conectar conta
  LinkedIn nenhuma, sem risco de banimento. Ver pesquisa de mercado em
  `references/architecture.md` (seção LinkedIn — provedores).
- `authenticated_automation_risk` — usa cookie `li_at` (conta autenticada). Real risco
  de banimento e de ação civil (caso Proxycurl é precedente concreto, não hipotético).
  **Bloqueado em produção sem aprovação jurídica.**

Firecrawl **não é usado para o canal LinkedIn** — LinkedIn bloqueia ativamente o
Firecrawl mesmo em Stealth Mode. Firecrawl continua no papel que já tem hoje:
enriquecimento do site institucional da empresa (Google Maps → website).

Campos: `person_name`, `linkedin_url`, `headline`, `current_title`, `department`,
`seniority`, `company_name`, `location`.

### 3.3 Instagram (não existe hoje)
Função: presença digital, bio, sinais de intenção. Skill mais potente mencionada na
referência visual: **ler comentários em perfis como sinal de intenção** — mais
avançado, também mais sensível a ToS de scraping do Instagram (avaliar via API
oficial vs. scraping antes de implementar).

Campos: `instagram_handle`, `instagram_url`, `bio`, `website_link`, `public_email`,
`public_phone` (extraído só se declarado publicamente, nunca como "verificado").

## 4. Etapa de Filtro/Qualificação — detalhamento

Esta é a etapa nova em relação ao desenho anterior. Duas perguntas de negócio guiam
a implementação (ainda em aberto, para decidir com o usuário):

- **Foco (nicho):** qual segmento/categoria a campanha está priorizando? Hoje o
  LeadFinder já tem `categoria` no lead — o filtro pode começar como uma regra sobre
  esse campo, sem precisar de nova infra.
- **Qualificação:** quais critérios mínimos um lead precisa ter para passar do corte
  barato? (ex: tem telefone OU site; categoria bate com o ICP da campanha; cidade
  dentro da área de atuação).

Implementação sugerida (fase 1, sem re-arquitetura de banco):
- Novo campo/status no lead: `qualification_status` (`pending`, `qualified`,
  `disqualified`, `quarantine`)
- Regra de filtro configurável por campanha (nicho + critérios mínimos)
- Rodar o filtro **imediatamente após o scrap**, antes de qualquer enriquecimento pago

## 5. Modelo de dados — decisão em aberto

O documento original propõe schema canônico (`companies` / `people` /
`lead_observations` / `contact_points`) com rastreamento de origem por campo. Isso é
uma mudança estrutural grande vs. a tabela única `leads_prospeccao` atual.

**Decisão pendente:** migrar para o modelo canônico completo (fase 3 do roadmap) ou
começar com extensões pontuais na tabela atual (`qualification_status`, `linkedin_*`
estruturado, `source`/`confidence` por campo crítico) e migrar depois? Recomendação:
começar pontual — menor risco, entrega valor mais rápido — e revisitar o schema
canônico quando LinkedIn + Instagram estiverem implementados e o volume de campos
por fonte justificar a normalização.

## 6. Compliance (LGPD + políticas de canal) — gap identificado

O LeadFinder Pro hoje dispara WhatsApp em massa sem uma máquina de estados de
consentimento documentada. O framework exige:

```text
not_eligible -> eligible_after_opt_in -> opted_in -> template_approved ->
sent -> replied -> human_handoff -> opted_out -> blocked
```

Isso precisa ser resolvido (ou pelo menos endereçado explicitamente) antes de
qualquer automação de outreach nova ser ligada a dados vindos de LinkedIn/Instagram,
que carregam ainda mais sensibilidade (dado pessoal de terceiro coletado sem
interação direta do titular).

### 6.1 Base legal para coleta de dados via LinkedIn/enriquecimento (LGPD Art. 7º, IX)

Achado da revisão de segurança do PR #8 (LGPD-01): faltava documentar formalmente a
base legal para tratar dado pessoal de terceiro (nome, cargo, e-mail, telefone de
pessoa física) coletado sem interação direta do titular. Registrado aqui.

**Base legal escolhida:** Legítimo interesse (Art. 7º, IX), com o teste de
balanceamento abaixo — não Consentimento (Art. 7º, I), porque o titular nunca interage
diretamente com o sistema no momento da coleta.

- **Finalidade:** prospecção comercial B2B — identificar potenciais decisores em
  empresas-alvo, a partir de dados **profissionais já públicos** (nome, cargo,
  empresa, e ocasionalmente e-mail/telefone institucional publicado no site da
  própria empresa).
- **Necessidade:** o dado coletado é o mínimo necessário para qualificar e abordar um
  contato comercial (não se coleta dado sensível — saúde, biometria, opinião
  política, orientação sexual — nem dado de contexto pessoal fora do profissional).
- **Balanceamento (direitos do titular vs. interesse do controlador):**
  - Fonte é sempre pública (perfil LinkedIn indexado, site institucional) — nunca
    scraping autenticado, nunca credencial de terceiro, nunca dado privado.
  - O dado tratado é profissional (cargo, empresa), não pessoal íntimo.
  - **Controles compensatórios obrigatórios** (já implementados ou corrigidos junto
    com este achado):
    1. Lista de supressão (`linkedin_suppression_list`) consultada antes de todo
       upsert — quem já pediu exclusão nunca é recriado.
    2. Rota `POST /api/prospecting/linkedin/suppress` — canal real de
       oposição/eliminação (Art. 18), não apenas documentado (ver LGPD-02).
    3. Retenção limitada do payload bruto (`linkedin_raw`/`enrichment_raw`,
       `expires_at` = 90 dias) com expurgo automático (ver LGPD-03).
    4. **Nenhum disparo automático de mensagem** (WhatsApp/e-mail) a partir de um
       contato coletado — a promoção para lead (`contact-promotion.service.ts`)
       apenas coloca o registro na fila normal de abordagem manual/bot já existente
       no CRM, sujeita à mesma falta de máquina de estados de consentimento já
       identificada na Seção 6 (gap pré-existente, não ampliado por esta feature).
- **Transparência:** pendente incluir, na política de privacidade pública do
  sistema, menção explícita a esta prática (prospecção B2B a partir de fontes
  profissionais públicas) — item de produto, não técnico, fora do escopo deste PR.

Esta seção não substitui uma Avaliação de Legítimo Interesse (LIA) formal caso a
ANPD venha a solicitar — é o registro mínimo da decisão e do teste de balanceamento
no momento da implementação, conforme Art. 10, §único.

## 7. Roadmap mapeado ao estado atual

| Fase | Escopo | Estado |
|------|--------|--------|
| 1 — MVP de dados | Manter Google Maps; filtro de nicho pós-scrap; `qualification_status`/`icp_fit_status` | ✅ Concluído |
| 2 — Enriquecimento | Conector LinkedIn (Apify cookieless); worker Firecrawl (gap-fill email/telefone); ICP score configurável | ✅ Concluído |
| 3 — Produto | Modelo canônico completo (companies/people/observations); dashboard de qualidade | Não iniciado (schema atual com extensões pontuais, mantido por decisão própria) |
| 4 — Sales Execution | Máquina de estados de consentimento; Instagram Direct; handoff vendedor | Parcial (disparo existe, sem state machine; Instagram não iniciado) |

## 8. Próximos passos / decisões pendentes

1. Confirmar critérios do filtro de nicho (fase 1) — quais campos e regras exatas.
2. Escolher provedor de dados de LinkedIn (pesquisar preço/limites atuais antes de decidir).
3. Decidir se Instagram entra via API oficial (mais restrita, mais segura) ou scraping (risco de ToS).
4. Definir se o `qualification_status` fica na tabela atual ou já nasce em tabela própria.
