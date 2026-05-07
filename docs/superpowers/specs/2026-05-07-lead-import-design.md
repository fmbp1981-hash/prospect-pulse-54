# F16 — Importação de Leads com Normalização Inteligente

**Data:** 2026-05-07  
**Projeto:** LeadFinder Pro (`prospect-pulse-54`)  
**Status:** Aprovado — aguardando implementação

---

## 1. Contexto

O sistema já possui prospecção automática (F1) e gestão de leads (F2), mas não permite importar leads de fontes externas como planilhas do LinkedIn Sales Navigator, listas CSV, arquivos XLSX ou VCF de contatos WhatsApp.

Esta feature também inclui dois itens correlatos identificados durante o design:
- **Melhoria do `LeadEditModal`:** adicionar campos ausentes (`linkedin`, `telefone`, `bairro`, `resumo_analitico`)
- **Criação manual de lead:** botão "Novo Lead" na página `/leads` para inserção sem prospecção ou importação

---

## 2. Abordagem: Híbrido em 3 Etapas (Cliente + Servidor)

**Etapa 1 — Cliente:** parse do arquivo, normalização local via engine de regras, deduplicação intra-arquivo, envio de amostra para mapeamento IA.  
**Etapa 2 — Preview interativo:** modal com mapeamento sugerido pela IA (editável), tabela de dados normalizados e painel de conflitos para resolução campo a campo.  
**Etapa 3 — Servidor:** deduplicação contra banco, upsert em chunks de 50, relatório final.

Suporta até 1.000 leads por importação (processamento síncrono, sem filas).

---

## 3. Novos Módulos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/import/normalizer.ts` | Engine de regras de normalização (puro TS, sem deps externas) |
| `src/lib/import/deduplicator.ts` | Deduplicação intra-arquivo + merge de registros complementares |
| `src/lib/import/column-mapper.ts` | Lógica de mapeamento assistido por IA (prompt + parse do JSON) |
| `src/app/api/leads/import/map/route.ts` | Endpoint de mapeamento por IA |
| `src/app/api/leads/import/route.ts` | Endpoint de importação (upsert em batch) |
| `src/app/api/leads/route.ts` | Endpoint de criação manual (POST) |
| `src/components/leads/ImportLeadsModal.tsx` | Modal completo de importação (4 etapas) |

**Modificações em arquivos existentes:**
- `src/components/LeadEditModal.tsx` — adicionar campos `linkedin`, `telefone`, `bairro`, `resumo_analitico`
- `src/app/api/leads/[id]/route.ts` — adicionar novos campos ao schema Zod do PATCH
- `src/integrations/supabase/types.ts` — adicionar `linkedin` após migration
- `supabase/migrations/` — migration `ADD COLUMN linkedin text`

---

## 4. Formatos de Arquivo Suportados

| Formato | Parser | Casos de uso |
|---|---|---|
| CSV | papaparse | Exports genéricos, ferramentas de CRM |
| XLSX | xlsx (SheetJS) | LinkedIn Sales Navigator, Excel, Google Sheets |
| VCF | parser customizado | Contatos WhatsApp exportados |
| TXT | papaparse (delimiter: `\n`) | Listas de telefones/WhatsApp |

---

## 5. Campo Novo no Banco — `linkedin`

```sql
ALTER TABLE leads_prospeccao
  ADD COLUMN IF NOT EXISTS linkedin text;
```

Arquivo de migration: `supabase/migrations/YYYYMMDDHHMMSS_add_linkedin_to_leads.sql`

Após migration: atualizar `src/integrations/supabase/types.ts` com o novo campo.

---

## 6. UX do Modal — 4 Etapas

### Etapa 1 — Upload
- Drag-and-drop ou clique para selecionar
- Formatos aceitos: CSV, XLSX, VCF, TXT
- Limite: 1.000 leads (aviso, não bloqueio) / 10MB (bloqueio)
- XLSX com múltiplas abas: modal de seleção de aba

### Etapa 2 — Mapeamento de Colunas
- IA detecta e mapeia colunas automaticamente via `/api/leads/import/map`
- Cada linha mostra: coluna da planilha → campo do sistema + indicador de confiança (%)
- Confiança < 80%: destaque amarelo
- Usuário pode corrigir qualquer mapeamento via dropdown
- **Campos obrigatórios:** `empresa`, `lead`, `whatsapp` — bloqueiam avanço se sem mapeamento
- Colunas sem mapeamento: opção "Ignorar coluna" (não bloqueiam)

### Etapa 3 — Preview, Normalização e Conflitos
- Abas: Todos / Prontos / Conflitos / Inválidos
- **Prontos:** leads normalizados sem conflito — mostrar preview
- **Conflitos:** campos com valores diferentes entre registros duplicados — usuário escolhe: [Usar A] [Usar B] [Manter ambos] [Digitar outro]
- **Inválidos:** WhatsApp com dígitos insuficientes, email sem @, etc. — listados com motivo, não importados, editáveis manualmente
- Conflitos não resolvidos bloqueiam botão "Importar"
- "Vai mesclar (DB)": lead já existente no banco identificado por WhatsApp ou email

### Etapa 4 — Resultado
- Contadores: criados / atualizados (mesclados) / ignorados
- Botão "Ver leads importados": aplica filtro `origem = 'importação'` na listagem
- Botão "Baixar relatório CSV": log completo com status de cada linha

---

## 7. Engine de Normalização (`normalizer.ts`)

Todas as regras rodam no cliente, são puras (sem side effects) e testáveis unitariamente.

### 7.1 Nomes e Textos (`empresa`, `lead`, `cidade`, `bairro`, `categoria`)
- Title Case: primeira letra de cada palavra em maiúscula
- Exceções não capitalizadas no meio: `de`, `da`, `do`, `das`, `dos`, `e`, `em`, `com`, `para`
- Remove espaços extras, tabs, quebras de linha, caracteres de controle

### 7.2 WhatsApp e Telefone
**Formato-alvo:** E.164 com `+` → `+5511999998888`

```
"(11) 99999-8888"       → "+5511999998888"
"11999998888"           → "+5511999998888"
"5511999998888"         → "+5511999998888"
"+55 11 9 9999-8888"    → "+5511999998888"
"99999-8888"            → null  ⚠ sem DDD — inválido
"0800 123 4567"         → null  ✕ não é WhatsApp
```

Compatibilidade garantida com ambos os providers:
- **Evolution API:** strip automático do `+` em `messaging.client.ts` linha 29
- **Meta Cloud API:** strip automático do `+` em `meta-cloud.provider.ts` `normalizePhoneForMeta()`

Regras adicionais:
1. Strip tudo que não for dígito
2. 10 ou 11 dígitos sem código de país → prefixar `+55`
3. Começa com `55` + 10 ou 11 dígitos → adicionar `+`
4. Número de 8 dígitos (sem 9 de celular): **não adicionar 9 automaticamente** — marcar `⚠ verificar`
5. Fixo BR (DDD + 8 dígitos): válido para `telefone`, aviso em `whatsapp`

### 7.3 Email
- Lowercase total + trim
- Validação regex RFC 5322 simplificada
- Inválido → sinalizar no preview, não bloquear importação

### 7.4 CNPJ
- Strip não-dígitos → formatar `XX.XXX.XXX/XXXX-XX`
- Validar dígitos verificadores (algoritmo oficial)
- CNPJ inválido → sinalizar, importar sem CNPJ

### 7.5 Website
- Sem protocolo → prefixar `https://`
- `http://` → upgrade para `https://`
- `www.` sem protocolo → `https://www.`

### 7.6 Instagram
```
"empresa"                               → "@empresa"
"@empresa"                              → "@empresa"
"instagram.com/empresa"                 → "@empresa"
"https://www.instagram.com/empresa/"    → "@empresa"
```

### 7.7 LinkedIn (campo novo)
```
"linkedin.com/in/joao-silva"            → "linkedin.com/in/joao-silva"
"https://www.linkedin.com/company/xpag" → "linkedin.com/company/xpag"
"João Silva" (texto livre)              → ⚠ sinalizar para revisão manual
```
Distingue perfil pessoal (`/in/`) de empresa (`/company/`).

---

## 8. Deduplicação

### 8.1 Intra-arquivo (cliente)
**Chave de identidade** (prioridade decrescente):
1. `whatsapp` normalizado
2. `email` normalizado
3. `empresa` + `cidade` com similaridade > 85% (fuzzy match)

**Estratégia de merge:**
- Campo vazio em A + preenchido em B → B vence (complementação automática)
- Campo preenchido em A e em B com valores diferentes → entra na fila de conflitos (Etapa 3)

### 8.2 Contra banco (servidor)
- Busca por `whatsapp` via RPC `find_lead_by_phone_digits`
- Fallback: busca por `email` exact match
- Se encontrado: merge — campo vazio no banco é atualizado com valor do import; campo preenchido em ambos → import vence (usuário já resolveu no preview)

---

## 9. API Routes

### `POST /api/leads/import/map`
```typescript
// Request
{ columns: string[], sample: Record<string, string>[] }

// Response
{
  mappings: { sourceColumn: string, targetField: string, confidence: number }[],
  unmapped: string[]
}
```
- Model: `gpt-4o-mini`, `response_format: { type: "json_object" }`
- Timeout: 8s — se exceder, retorna mapeamento vazio (fallback manual)

### `POST /api/leads/import`
```typescript
// Request
{ leads: NormalizedLead[], options: { defaultEstagio: string, defaultOrigem: string } }

// Response
{ created: number, updated: number, skipped: number, errors: { row: number, reason: string }[], importId: string }
```
- Upsert em chunks de 50
- Salva audit log `IMPORT_LEADS`
- Retenta chunk com falha 1x antes de marcar como erro

### `POST /api/leads`
```typescript
// Request — criação manual
{ empresa: string, whatsapp: string, lead?: string, telefone?: string, email?: string,
  cidade?: string, bairro?: string, categoria?: string, cnpj?: string,
  website?: string, instagram?: string, linkedin?: string, resumo_analitico?: string }

// Response — lead completo criado
```
- `origem` fixo: `'manual'`
- `estagio_pipeline` fixo: `'Novo'`
- Normalização via `normalizer.ts` (mesmo engine do import)
- WhatsApp duplicado: HTTP 409 com payload do lead existente

---

## 10. Criação e Edição Manual de Leads

### Criação Manual (`LeadEditModal` em modo create)
- Botão "Novo Lead" na página `/leads` (ao lado do botão "Importar")
- Reutiliza `LeadEditModal` sem lead pré-preenchido
- Campos obrigatórios: `empresa`, `whatsapp`
- Chama `POST /api/leads`

### Melhoria do `LeadEditModal`
Campos a adicionar ao formulário existente:
- `linkedin` ← novo campo no banco
- `telefone` ← já existe no banco, faltava no form
- `bairro` ← já existe no banco, faltava no form
- `resumo_analitico` ← já existe no banco, faltava no form

---

## 11. Tratamento de Erros

| Situação | Comportamento |
|---|---|
| Arquivo > 10MB | Bloqueado no cliente antes do upload |
| Formato não suportado | Bloqueado no cliente |
| XLSX com múltiplas abas | Modal de seleção de aba |
| CSV encoding inválido | Detecção automática UTF-8 → ISO-8859-1 → Win-1252 |
| Mais de 1.000 leads | Aviso, importa apenas primeiros 1.000 |
| IA timeout (> 8s) | Fallback: mapeamento vazio, usuário mapeia manualmente |
| Campos obrigatórios sem mapeamento | Botão "Próximo" desabilitado |
| 100% dos leads inválidos | Botão "Importar" bloqueado |
| Falha em chunk do upsert | Retenta 1x, continua demais chunks, reporta erros |
| WhatsApp duplicado (criação manual) | HTTP 409 + toast com link para lead existente |
| JWT inválido | HTTP 401 |
| Violação de RLS | HTTP 403 |
| Supabase fora do ar | HTTP 503 + botão "Tentar novamente" |

---

## 12. Decisões Técnicas

- **Normalização no cliente:** engine pura em TS, sem deps externas, testável unitariamente. O servidor recebe dados já normalizados — não duplica o trabalho.
- **IA apenas para mapeamento de colunas:** não para normalização (regras determinísticas são mais confiáveis e baratas).
- **`gpt-4o-mini` no mapeamento:** tarefa simples de classificação — não justifica modelo mais caro.
- **Upsert em chunks de 50:** evita timeout do Supabase em batches grandes; permite relato parcial em caso de falha.
- **WhatsApp como chave primária de deduplicação:** alinhado com a RPC existente `find_lead_by_phone_digits` e com o fluxo do agente IA.
- **Reutilização do `LeadEditModal`:** modo create vs. edit controlado por presença/ausência da prop `lead`.
