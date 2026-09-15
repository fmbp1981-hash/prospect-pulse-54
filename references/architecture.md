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
