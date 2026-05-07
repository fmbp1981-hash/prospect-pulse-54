# F18 — Google Drive → Apollo → LeadFinder (Automação com Histórico)

**Data:** 2026-05-07
**Projeto:** LeadFinder Pro (`prospect-pulse-54`)
**Status:** Aprovado — aguardando plano de implementação

---

## 1. Contexto

F16 entregou importação manual de CSV/XLSX via modal UI. F17 entregou o webhook autenticado por API key + workflow n8n para disparo manual. F18 fecha o ciclo: monitoramento automático de uma pasta do Google Drive, processamento das planilhas Apollo e gravação do histórico de importações visível no LeadFinder.

---

## 2. Abordagem Escolhida

**Opção B — Tabela dedicada `import_history`**

Nova tabela centraliza histórico de todas as origens (manual, webhook, google_drive). O `import-service.ts` grava lá ao final de cada `runImport()`. Webhook aceita `metadata` opcional. Nova rota GET expõe o histórico para a UI.

---

## 3. Banco de Dados

### Migration — `import_history`

```sql
CREATE TABLE import_history (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source      text        NOT NULL CHECK (source IN ('manual', 'webhook', 'google_drive')),
  filename    text,
  created     integer     NOT NULL DEFAULT 0,
  updated     integer     NOT NULL DEFAULT 0,
  skipped     integer     NOT NULL DEFAULT 0,
  errors      integer     NOT NULL DEFAULT 0,
  import_id   text        NOT NULL,
  created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE import_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own history"
  ON import_history FOR ALL USING (auth.uid() = user_id);

CREATE INDEX import_history_user_date
  ON import_history(user_id, created_at DESC);
```

`source` usa check constraint (não enum) para facilitar adição de novas origens via ALTER TABLE.

---

## 4. Backend

### 4.1 `src/lib/import/import-service.ts`

Novo tipo `ImportMetadata`:

```ts
export interface ImportMetadata {
  source?: 'manual' | 'webhook' | 'google_drive';
  filename?: string;
}
```

`runImport()` recebe quarto parâmetro `metadata: ImportMetadata = {}`. Ao final, grava em `import_history`:

```ts
await db.from('import_history').insert({
  user_id: userId,
  source: metadata.source ?? 'webhook',
  filename: metadata.filename ?? null,
  created,
  updated,
  skipped,
  errors,
  import_id: importId,
  created_at: now,
});
```

O bloco `audit_logs` existente permanece (não é removido — serve para auditoria geral).

### 4.2 `app/api/leads/import/webhook/route.ts`

Adiciona campo `metadata` opcional ao `RequestSchema`:

```ts
metadata: z.object({
  source: z.enum(['webhook', 'google_drive']).default('webhook'),
  filename: z.string().max(255).optional(),
}).optional(),
```

Repassa para `runImport(userId, leads, options, metadata)`.

### 4.3 `app/api/leads/import/route.ts` (importação manual)

Passa `{ source: 'manual', filename: file.name }` para `runImport()`.

### 4.4 Nova rota `GET /api/leads/import/history`

- Requer autenticação Supabase (cookie session)
- Query params: `limit` (default 20, max 100), `offset` (default 0)
- Retorna: `{ data: ImportHistoryRow[], total: number }`
- Ordena por `created_at DESC`

```ts
interface ImportHistoryRow {
  id: string;
  source: 'manual' | 'webhook' | 'google_drive';
  filename: string | null;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  import_id: string;
  created_at: string;
}
```

---

## 5. Workflow n8n — Google Drive → LeadFinder

### 5.1 Estrutura de pasta no Drive

```
Apollo Exports/
  ├── (arquivos novos ficam aqui — trigger monitora esta pasta)
  ├── Processados/   (arquivo movido após sucesso, renomeado com timestamp)
  └── Erros/         (arquivo movido após falha)
```

### 5.2 Nós do workflow (10 nós)

| # | Nó | Tipo | Descrição |
|---|-----|------|-----------|
| 1 | **Google Drive Trigger** | Trigger | Watch "Apollo Exports/" → evento File Created |
| 2 | **Filtrar formato** | IF | `fileName` termina em `.csv` ou `.xlsx`; FALSE → nó 10 |
| 3 | **Download File** | Google Drive | Baixa binário pelo `fileId` |
| 4 | **Parse + Calcular Confidence** | Code | Parse CSV/XLSX; aplica mapeamento Apollo; calcula confidence |
| 5 | **Confidence >= 0.7?** | IF | TRUE → nó 6 (usa Apollo); FALSE → nó 7 (fallback IA) |
| 6 | **Montar payload Apollo** | Code | Converte linhas com mapeamento fixo para `NormalizedLead[]` |
| 7 | **Fallback IA** | HTTP Request | POST `/api/leads/import/map`; aplica mappings retornados |
| 8 | **POST webhook** | HTTP Request | POST `/api/leads/import/webhook` com `x-api-key` e metadata |
| 9 | **Mover → Processados** | Google Drive | Move + renomeia `YYYY-MM-DD_HH-mm_<fileName>` |
| 10 | **Mover → Erros** | Google Drive | Move arquivo com falha (acionado por Error Trigger) |

Nós 6 e 7 convergem para o nó 8 via duas conexões de entrada (n8n suporta múltiplas entradas em HTTP Request).

### 5.3 Mapeamento fixo Apollo (nó 4)

```js
const APOLLO_MAP = {
  empresa:  ['Account Name', 'Company'],
  contato:  ['First Name+Last Name'],   // concatenar com espaço
  email:    ['Email'],
  linkedin: ['Person Linkedin Url'],
  cidade:   ['City'],
  categoria:['Title'],
  website:  ['Website'],
};
// confidence = colunas reconhecidas / total colunas do arquivo
// threshold: >= 0.7 → usa mapeamento fixo; < 0.7 → chama /map
```

### 5.4 Variáveis a configurar

| Variável | Onde configurar | Valor |
|----------|----------------|-------|
| `LEADFINDER_API_KEY` | n8n Variables | Key gerada em Settings → Integrações |
| `APOLLO_FOLDER_ID` | n8n Variables | ID da pasta "Apollo Exports" no Drive |
| `LEADFINDER_WEBHOOK_URL` | n8n Variables | `https://prospect-pulse-54.vercel.app/api/leads/import/webhook` |
| Google OAuth2 | n8n Credentials | Conta com acesso à pasta |

---

## 6. UI

### 6.1 `src/components/settings/ImportHistoryPanel.tsx` (novo)

Tabela com colunas: Data, Arquivo, Origem (badge), Resultado.

**Badges por `source`:**
- `google_drive` → azul · "Drive"
- `manual` → cinza · "Manual"
- `webhook` → roxo · "API"

**Resultado formatado:** `+47 criados · 2 atualizados · 3 erros`

**Paginação:** botão "Carregar mais" (offset +20). Polling de 30s quando aba ativa.

### 6.2 `app/(protected)/settings/page.tsx`

Adiciona `<ImportHistoryPanel />` após `<WebhookKeysPanel />` na seção Integrações.

### 6.3 `app/(protected)/leads/page.tsx`

Banner informativo abaixo dos filtros, visível quando houver importação nas últimas 24h:

```
🔄 Última importação: há 2h via Google Drive · +47 leads  [Ver histórico →]
```

- "Ver histórico →" navega para `/settings?tab=integrations#import-history`
- A settings page precisa suportar `?tab=` como query param para abrir a aba correta via `useSearchParams()`
- Oculto automaticamente se nenhuma importação nas últimas 24h
- Dados carregados via `GET /api/leads/import/history?limit=1`

**Novo arquivo:** `src/components/settings/ImportHistoryPanel.tsx`

**Arquivos modificados:**
- `src/lib/import/import-service.ts`
- `app/api/leads/import/webhook/route.ts`
- `app/api/leads/import/route.ts`
- `app/(protected)/settings/page.tsx`
- `app/(protected)/leads/page.tsx`

---

## 7. Arquivos de Entrega

| Artefato | Tipo | Descrição |
|----------|------|-----------|
| `supabase/migrations/20260507_import_history.sql` | Migration | Tabela `import_history` + RLS + índice |
| `app/api/leads/import/history/route.ts` | Nova rota | GET histórico paginado |
| `docs/n8n/google-drive-apollo-workflow.json` | Workflow n8n | JSON importável |
| `src/components/settings/ImportHistoryPanel.tsx` | Componente | Tabela de histórico |

---

## 8. Fora de Escopo

- Notificações WhatsApp (decidido na sessão de brainstorming)
- Suporte a Google Sheets ao vivo (só arquivos exportados CSV/XLSX)
- Multi-tenant (histórico é sempre por `user_id`)
- Reprocessamento de arquivo com erro pela UI
