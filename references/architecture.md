# Arquitetura — Gate de ICP Fit + Perfil de Cliente Ideal (Fase 1 da prospecção multicanal)

> **Atualização (2026-09-15):** o gate foi renomeado de `qualification_status` para
> `icp_fit_status` — o nome antigo colidia com o estágio de pipeline "Qualificação"
> (LeadStatus), que é conversacional e conduzido pelo agente de SDR, não um match de
> dados. Também foi adicionada a tabela `icp_settings`: o Perfil de Cliente Ideal
> configurado **uma única vez** pela empresa (não por campanha/execução de scrap),
> reaproveitado por todos os canais. Ver migration
> `20260915_rename_qualification_to_icp_fit_and_add_icp_settings.sql`.
>
> **Duas camadas de "qualificação" distintas neste sistema — não confundir:**
> | | ICP fit (`icp_fit_status`) | Qualificação conversacional (SDR) |
> |---|---|---|
> | Responde | "Tem o perfil certo pra abordar?" | "Está pronto pra comprar agora?" |
> | Decide com | Dados firmográficos (categoria, cidade, porte) | Diálogo real (BANT) |
> | Quando | Antes (LinkedIn) ou logo após inserir (Maps) | Depois, já em conversa |
> | Executor | Trigger/função determinística | Agente de IA ou consultor humano |

Fase IntelliX: 01 (architecture). Escopo: só o gate de filtro/qualificação pós-scrap
(o restante do framework multicanal — LinkedIn/Instagram/enriquecimento — fica para
fases seguintes, ver `docs/PROSPECCAO-MULTICANAL.md`).

## Correção de stack (importante para qualquer arquitetura futura neste projeto)

O `CLAUDE.md` da raiz do projeto está desatualizado: descreve Vite + React Router,
mas o projeto real é **Next.js 14 (App Router)** — `vite`/`react-router-dom` não
estão mais em `package.json`; `vite.config.ts` é arquivo morto do scaffold original
do Lovable.dev. Rotas reais ficam em `app/(protected)/*` e `app/api/*/route.ts`.
A lógica de negócio já vive em `src/lib/services/` e `src/lib/repositories/`,
consumida pelos route handlers — exatamente o padrão que a skill `intellix:architecture`
pede, só que com os diretórios dentro de `src/lib/` em vez de `src/` raiz.

## Problema de arquitetura

Um lead pode ser criado por 3 caminhos diferentes:
1. Scrap — Edge Function `supabase/functions/prospection/index.ts` (Deno, isolado,
   não importa código de `src/`)
2. Import de CSV — `src/lib/import/import-service.ts` (Next.js/Node)
3. Criação manual — `LeadEditModal.tsx` -> Supabase client direto (Next.js/browser)

Duplicar a regra de qualificação nos 3 lugares seria frágil (drift entre
implementações, fácil esquecer um caminho ao mudar a regra).

## Decisão

Gate de qualificação implementado como **trigger Postgres** em vez de código de
aplicação — roda automaticamente para qualquer um dos 3 caminhos, sem exigir que
cada um chame uma função explicitamente.

### Schema (`supabase/migrations/20260915_rename_qualification_to_icp_fit_and_add_icp_settings.sql`)

```sql
-- leads_prospeccao ganha (renomeado de qualification_status/reason/qualified_at):
--   icp_fit_status text DEFAULT 'pending'
--     CHECK (icp_fit_status IN ('pending','fit','no_fit','disqualified','quarantine'))
--   icp_fit_reason text
--   icp_fit_evaluated_at timestamptz

-- Perfil de Cliente Ideal — configuração única por empresa, canal-agnóstica
CREATE TABLE icp_settings (
  user_id uuid UNIQUE REFERENCES auth.users(id),
  target_categories text[] DEFAULT '{}',   -- ex: ['Restaurante','Pizzaria']
  target_cities text[] DEFAULT '{}',
  target_states text[] DEFAULT '{}',       -- usado pelo canal LinkedIn (fase futura)
  target_seniorities text[] DEFAULT '{}',  -- idem
  target_departments text[] DEFAULT '{}',  -- idem
  min_employee_count integer,
  max_employee_count integer,
  require_contact_channel boolean DEFAULT true
);

-- trigger BEFORE INSERT OR UPDATE OF (categoria, telefone, whatsapp, email, website)
-- consulta icp_settings do user_id e calcula icp_fit_status automaticamente
```

RLS: `leads_prospeccao` não precisou de policy nova (coluna na mesma linha, já
coberta pelas 4 policies existentes). `icp_settings` é tabela nova — RLS habilitado
com policy `auth.uid() = user_id`.

### Regra de fit (consulta `icp_settings`, com fallback quando não configurado)

- `quarantine`: falta `categoria` OU (se `require_contact_channel`, que é `true` por
  padrão) nenhum canal de contato — critério mínimo de dado, independe de ICP
  configurado
- Sem `icp_settings` configurado (ou configurado sem nenhuma restrição): `fit` —
  não filtra por perfil ainda, só exige o critério mínimo acima
- Com `icp_settings` configurado: `fit` se `categoria` ∈ `target_categories` E
  `cidade` ∈ `target_cities` (array vazio nesses campos = sem restrição naquele
  atributo); caso contrário `no_fit` — **tem dado suficiente, mas está fora do
  perfil que a empresa quer prospectar** (diferente de `quarantine`, que é falta
  de dado)
- `disqualified`: **nunca setado automaticamente** — reservado para decisão humana,
  para não descartar lead por engano

### Regra "sticky" (não sobrescrever decisão já consolidada)

O trigger só recalcula em UPDATE se o status atual ainda for `pending`,
`quarantine` ou `no_fit`. Uma vez `fit`/`disqualified`, o trigger não mexe mais
nesse lead — mesmo padrão de "nunca sobrescrever silenciosamente" do documento de
prospecção multicanal (seção 2). `no_fit` fica fora dessa trava porque, ao
contrário de `fit`/`disqualified`, não é uma decisão consolidada — é reavaliável
se o usuário mudar o ICP configurado depois.

### `icp_settings` é canal-agnóstico por design

O usuário pediu explicitamente que essa configuração não seja por
campanha/execução de scrap, e sim **de conta, feita uma vez** — daí o
`UNIQUE(user_id)` (uma linha por empresa) em vez de uma tabela de regras por
campanha. Os campos `target_states`/`target_seniorities`/`target_departments`/
`min_employee_count`/`max_employee_count` já existem no schema pensando no canal
LinkedIn (`companies`/`contacts`), mesmo que o trigger de `leads_prospeccao` hoje
só use `target_categories`/`target_cities` (únicos atributos disponíveis no canal
Google Maps).

## Tipos TypeScript

`src/types/prospection.ts` — `Lead` ganha `icpFitStatus`, `icpFitReason`,
`icpFitEvaluatedAt` (mantido manualmente, como o resto do arquivo).
`src/integrations/supabase/types.ts` **não foi editado à mão** — é gerado
automaticamente; regenerar via MCP Supabase (`generate_typescript_types`) antes
de consumir `icp_settings` em código novo.

## Pendências (fora do escopo desta fase)

- Regenerar `src/integrations/supabase/types.ts` (pendente após o rename)
- Tela de configuração do ICP (Configurações) para o usuário editar `icp_settings`
  sem SQL direto
- Serviço/repository para `icp_settings` (`src/lib/repositories/`,
  `src/lib/services/`, `src/lib/validations/`), seguindo o mesmo padrão de
  `lead.repository.ts`/`lead.service.ts`
- Superfície de UI para a fila de `quarantine`/`no_fit` (revisão/enriquecimento
  manual) — fase de dev-standards / frontend
- Conectores LinkedIn/Instagram, worker de enriquecimento (`prospecting_jobs`) e
  regra de auto-promoção (`contacts.converted_lead_id`) — fases seguintes do
  roadmap em `docs/PROSPECCAO-MULTICANAL.md`

## 9. Pesquisa de mercado — conectores LinkedIn (2026-09-15)

Pesquisa via WebSearch (Perplexity MCP indisponível na sessão — servidor não
conectado apesar do hook indicar "ativo"; usar Perplexity quando disponível para
revalidar antes de decidir de fato, preços/players mudam rápido neste mercado).

### Firecrawl não serve para o canal LinkedIn
LinkedIn bloqueia ativamente o Firecrawl — mesmo o Stealth Mode (proxy residencial +
fingerprint rotation) não é confiável contra a parede de login sem uma sessão
autenticada (`li_at`), que é justamente a categoria `authenticated_automation_risk`
já bloqueada por padrão. Papel do Firecrawl no sistema: só enriquecimento do site
institucional (Google Maps → website), não LinkedIn.

### Apify é um marketplace, não uma ferramenta única — dois perfis de risco
- **Cookieless/no-login** (`public_web_research`, recomendado como padrão): usa
  proxy residencial + busca indexada em perfis públicos, sem conectar conta LinkedIn
  nenhuma, zero risco de banimento. Extrai: nome, headline, localização, empresa
  atual, URL do perfil, e (se o perfil for público/indexado) about, experiência,
  formação, seguidores.
- **Com cookie `li_at`** (`authenticated_automation_risk`, bloqueado por padrão):
  precisa de conta LinkedIn autenticada (recomendação do mercado: conta descartável,
  nunca a principal — risco real de banimento). Retorna ~5x mais dado por perfil e
  até ~100x mais funcionários por empresa.

### Precedente legal concreto: caso Proxycurl
Proxycurl (cotado antes no doc de prospecção como opção) foi processado pela
LinkedIn em jan/2025 e **fechou em jul/2025** em vez de continuar litigando. Isso
confirma, com caso real (não hipotético), por que a classificação de risco por
conector e o bloqueio de `authenticated_automation_risk` sem aprovação jurídica são
necessários — LinkedIn processa vendors de scraping, não só bane contas individuais.
Unipile, cotado como alternativa no mesmo doc, hoje é uma API de conectividade/
mensageria (usa a própria conta autenticada do cliente) — não é um substituto
direto para scraping de perfil em massa.

### Custos operacionais (ordem de grandeza, não cotação fechada)
- **Apify**: assinatura de plataforma (Free ~$5 de uso / Starter $29 / Scale $199 /
  Business $999 por mês, orçamento pré-pago de créditos) + preço do actor
  (pay-per-result). Actors de LinkedIn (ago/2026): perfis US$ 1,50–12,00/1.000,
  vagas US$ 0,28–5,00/1.000, empresas a partir de US$ 4,00/1.000.
- **Firecrawl** (site institucional, não LinkedIn): Free (1.000 créditos) / Hobby
  $16 (5.000) / Standard $83 (100.000) / Growth $333 (500.000) / Scale $599
  (1.000.000). 1 crédito/página no scrape básico.
- Exemplo: 5.000 leads/mês com enriquecimento LinkedIn cookieless + validação de
  site ≈ Apify Starter ($29 + ~$20 de actor) + Firecrawl Hobby ($16) ≈ **US$ 65/mês**.

### Decisão recomendada
MVP usa só a camada `public_web_research` do Apify (cookieless) para LinkedIn — cobre
cargo/empresa/cidade/URL de perfil sem risco de conta. `authenticated_automation_risk`
fica travado atrás da aprovação jurídica já desenhada; só reconsiderar se o volume/
qualidade do cookieless não for suficiente.
