# F16 — Importação de Leads com Normalização Inteligente

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar importação de leads via CSV/XLSX/VCF/TXT com normalização automática, mapeamento de colunas por IA, deduplicação inteligente e preview interativo em modal de 4 etapas. Inclui criação manual de leads e melhoria do formulário de edição.

**Architecture:** Cliente faz parse + normalização local; IA mapeia colunas via API em amostra de 5 linhas; servidor recebe dados já validados, deduplica contra banco e faz upsert em chunks de 50. Modal de 4 etapas: Upload → Mapeamento → Preview/Conflitos → Resultado.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, papaparse (CSV), xlsx/SheetJS (XLSX), Zod, Supabase, OpenAI gpt-4o-mini, Vitest (testes unitários da engine)

---

## Mapa de Arquivos

| Ação | Arquivo |
|---|---|
| **CRIAR** | `src/lib/import/normalizer.ts` |
| **CRIAR** | `src/lib/import/deduplicator.ts` |
| **CRIAR** | `src/lib/import/column-mapper.ts` |
| **CRIAR** | `src/lib/import/types.ts` |
| **CRIAR** | `tests/unit/normalizer.spec.ts` |
| **CRIAR** | `app/api/leads/import/map/route.ts` |
| **CRIAR** | `app/api/leads/route.ts` |
| **REESCREVER** | `app/api/leads/import/route.ts` |
| **REESCREVER** | `src/components/leads/ImportLeadsModal.tsx` |
| **MODIFICAR** | `src/components/LeadEditModal.tsx` |
| **MODIFICAR** | `app/(protected)/leads/page.tsx` |
| **MODIFICAR** | `src/lib/normalizePhone.ts` |
| **CRIAR** | `supabase/migrations/20260507120000_add_linkedin_to_leads.sql` |

---

## Task 1: Vitest setup + migration linkedin

**Files:**
- Create: `vitest.config.ts`
- Create: `supabase/migrations/20260507120000_add_linkedin_to_leads.sql`

- [ ] **Step 1: Instalar vitest**

```bash
cd "C:\Projects\prospect-pulse-54"
npm install -D vitest @vitest/ui
```

- [ ] **Step 2: Criar vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 3: Adicionar script test ao package.json**

Abrir `package.json` e adicionar na seção `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Criar migration do campo linkedin**

Criar `supabase/migrations/20260507120000_add_linkedin_to_leads.sql`:
```sql
ALTER TABLE leads_prospeccao
  ADD COLUMN IF NOT EXISTS linkedin text;
```

- [ ] **Step 5: Aplicar migration no Supabase**

```bash
npx supabase db push --linked
```

Verificar output: deve aparecer `Applied 1 migration`.

- [ ] **Step 6: Atualizar types.ts**

Em `src/integrations/supabase/types.ts`, adicionar `linkedin: string | null` em `Row`, `Insert` e `Update` da tabela `leads_prospeccao`. Buscar o bloco da tabela e adicionar o campo em ordem alfabética (entre `lead` e `link_gmn`).

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts supabase/migrations/20260507120000_add_linkedin_to_leads.sql src/integrations/supabase/types.ts package.json
git commit -m "chore: vitest setup + migration add linkedin to leads_prospeccao"
```

---

## Task 2: Tipos compartilhados da engine de importação

**Files:**
- Create: `src/lib/import/types.ts`

- [ ] **Step 1: Criar src/lib/import/types.ts**

```typescript
/** Campos que o sistema aceita na importação */
export const LEAD_FIELDS = [
  'empresa', 'lead', 'whatsapp', 'telefone', 'email',
  'cidade', 'bairro', 'categoria', 'cnpj', 'website',
  'instagram', 'linkedin', 'resumo_analitico',
] as const;

export type LeadField = typeof LEAD_FIELDS[number];

/** Um lead após parse e normalização */
export interface NormalizedLead {
  empresa: string;
  lead: string;
  whatsapp: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  bairro: string | null;
  categoria: string | null;
  cnpj: string | null;
  website: string | null;
  instagram: string | null;
  linkedin: string | null;
  resumo_analitico: string | null;
  /** Warnings de normalização por campo */
  warnings: Partial<Record<LeadField, string>>;
  /** Erros que invalidam o lead */
  errors: Partial<Record<LeadField, string>>;
}

/** Um lead antes de normalização (dados brutos mapeados) */
export type RawMappedLead = Partial<Record<LeadField, string>>;

/** Mapeamento de coluna da planilha → campo do sistema */
export interface ColumnMapping {
  sourceColumn: string;
  targetField: LeadField | 'ignore';
  confidence: number; // 0.0 – 1.0
}

/** Conflito entre dois valores para o mesmo campo */
export interface FieldConflict {
  field: LeadField;
  valueA: string;
  valueB: string;
  /** Resolução escolhida pelo usuário */
  resolution?: 'a' | 'b' | 'both' | 'custom';
  customValue?: string;
}

/** Lead após deduplicação intra-arquivo, pode ter conflitos pendentes */
export interface MergedLead {
  normalized: NormalizedLead;
  conflicts: FieldConflict[];
  /** true = lead já existe no banco (detectado no preview do servidor) */
  existsInDb?: boolean;
  dbLeadId?: string;
}

/** Status de cada lead na importação final */
export type ImportStatus = 'created' | 'updated' | 'skipped' | 'error';

export interface ImportResultRow {
  empresa: string;
  status: ImportStatus;
  reason?: string;
}

export interface ImportReport {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  rows: ImportResultRow[];
  importId: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/import/types.ts
git commit -m "feat: tipos compartilhados da engine de importação de leads"
```

---

## Task 3: Engine de normalização

**Files:**
- Create: `src/lib/import/normalizer.ts`
- Create: `tests/unit/normalizer.spec.ts`

- [ ] **Step 1: Escrever o teste antes da implementação**

Criar `tests/unit/normalizer.spec.ts`:

```typescript
import { normalizePhone, normalizeText, normalizeEmail, normalizeCnpj, normalizeWebsite, normalizeInstagram, normalizeLinkedin, normalizeLeadRow } from '../../src/lib/import/normalizer';

describe('normalizePhone', () => {
  it('formata celular BR com parênteses e hífen', () => {
    expect(normalizePhone('(11) 99999-8888')).toEqual({ value: '+5511999998888', warning: null, error: null });
  });
  it('formata número sem código de país (11 dígitos)', () => {
    expect(normalizePhone('11999998888')).toEqual({ value: '+5511999998888', warning: null, error: null });
  });
  it('formata número com código 55 sem +', () => {
    expect(normalizePhone('5511999998888')).toEqual({ value: '+5511999998888', warning: null, error: null });
  });
  it('formata número com + e espaços', () => {
    expect(normalizePhone('+55 11 9 9999-8888')).toEqual({ value: '+5511999998888', warning: null, error: null });
  });
  it('retorna erro para número sem DDD', () => {
    const r = normalizePhone('99999-8888');
    expect(r.error).toBeTruthy();
    expect(r.value).toBeNull();
  });
  it('retorna null para 0800', () => {
    const r = normalizePhone('0800 123 4567');
    expect(r.error).toBeTruthy();
    expect(r.value).toBeNull();
  });
  it('emite warning para fixo com 8 dígitos no whatsapp', () => {
    const r = normalizePhone('(11) 3333-4444');
    expect(r.value).toBe('+551133334444');
    expect(r.warning).toMatch(/fixo/i);
  });
  it('retorna null para string vazia', () => {
    expect(normalizePhone('')).toEqual({ value: null, warning: null, error: null });
  });
});

describe('normalizeText', () => {
  it('aplica Title Case', () => {
    expect(normalizeText('CLÍNICA SÃO PEDRO')).toBe('Clínica São Pedro');
  });
  it('mantém preposições em minúsculo no meio', () => {
    expect(normalizeText('PADARIA DE MINAS')).toBe('Padaria de Minas');
  });
  it('capitaliza preposição no início', () => {
    expect(normalizeText('de minas gerais')).toBe('De Minas Gerais');
  });
  it('remove espaços extras', () => {
    expect(normalizeText('  empresa   teste  ')).toBe('Empresa Teste');
  });
});

describe('normalizeEmail', () => {
  it('converte para minúsculo e faz trim', () => {
    expect(normalizeEmail('  CONTATO@EMPRESA.COM.BR  ')).toEqual({ value: 'contato@empresa.com.br', error: null });
  });
  it('retorna erro para email inválido', () => {
    expect(normalizeEmail('sem-arroba').error).toBeTruthy();
  });
  it('retorna null para string vazia', () => {
    expect(normalizeEmail('')).toEqual({ value: null, error: null });
  });
});

describe('normalizeCnpj', () => {
  it('formata CNPJ de 14 dígitos', () => {
    expect(normalizeCnpj('12345678000195')).toEqual({ value: '12.345.678/0001-95', error: null });
  });
  it('retorna error para CNPJ com dígitos inválidos', () => {
    expect(normalizeCnpj('12345678000199').error).toBeTruthy();
  });
  it('aceita CNPJ já formatado', () => {
    expect(normalizeCnpj('12.345.678/0001-95')).toEqual({ value: '12.345.678/0001-95', error: null });
  });
});

describe('normalizeWebsite', () => {
  it('adiciona https:// se ausente', () => {
    expect(normalizeWebsite('empresa.com.br')).toBe('https://empresa.com.br');
  });
  it('faz upgrade de http para https', () => {
    expect(normalizeWebsite('http://empresa.com.br')).toBe('https://empresa.com.br');
  });
  it('mantém https intacto', () => {
    expect(normalizeWebsite('https://empresa.com.br')).toBe('https://empresa.com.br');
  });
  it('retorna null para string vazia', () => {
    expect(normalizeWebsite('')).toBeNull();
  });
});

describe('normalizeInstagram', () => {
  it('adiciona @ ao handle simples', () => {
    expect(normalizeInstagram('empresa')).toBe('@empresa');
  });
  it('mantém @ já existente', () => {
    expect(normalizeInstagram('@empresa')).toBe('@empresa');
  });
  it('extrai handle de URL completa', () => {
    expect(normalizeInstagram('https://www.instagram.com/empresa/')).toBe('@empresa');
  });
  it('retorna null para string vazia', () => {
    expect(normalizeInstagram('')).toBeNull();
  });
});

describe('normalizeLinkedin', () => {
  it('normaliza URL company com https e www', () => {
    expect(normalizeLinkedin('https://www.linkedin.com/company/xpag/')).toBe('linkedin.com/company/xpag');
  });
  it('mantém perfil /in/ intacto (sem https)', () => {
    expect(normalizeLinkedin('linkedin.com/in/joao-silva')).toBe('linkedin.com/in/joao-silva');
  });
  it('retorna null para string vazia', () => {
    expect(normalizeLinkedin('')).toBeNull();
  });
  it('emite warning para texto livre sem URL', () => {
    const r = normalizeLinkedin('João Silva');
    expect(r).toBeNull(); // texto livre não é URL
  });
});
```

- [ ] **Step 2: Rodar o teste para ver falhar**

```bash
cd "C:\Projects\prospect-pulse-54"
npx vitest run tests/unit/normalizer.spec.ts
```

Esperado: múltiplos erros `Cannot find module`.

- [ ] **Step 3: Implementar src/lib/import/normalizer.ts**

```typescript
import type { NormalizedLead, RawMappedLead } from './types';

type PhoneResult = { value: string | null; warning: string | null; error: string | null };
type TextFieldResult = { value: string | null; error: string | null };

const LOWERCASE_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com', 'para', 'a', 'o', 'as', 'os']);

export function normalizeText(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\xC0-\xFF]/g, '') // remove control chars, keep latin
    .split(' ')
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function normalizePhone(raw: string): PhoneResult {
  if (!raw || !raw.trim()) return { value: null, warning: null, error: null };

  // Remove tudo exceto dígitos e +
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);

  // 0800 não é WhatsApp
  if (digits.startsWith('0800') || digits.startsWith('800')) {
    return { value: null, warning: null, error: 'Número 0800 não é suportado como WhatsApp' };
  }

  // Remove zero à esquerda (ex: 011...)
  if (digits.startsWith('0')) digits = digits.slice(1);

  // Com código de país 55
  if (digits.startsWith('55')) {
    const rest = digits.slice(2);
    if (rest.length === 11) return { value: `+55${rest}`, warning: null, error: null };
    if (rest.length === 10) {
      return { value: `+55${rest}`, warning: 'Número fixo: verifique se é WhatsApp', error: null };
    }
  }

  // Sem código de país
  if (digits.length === 11) return { value: `+55${digits}`, warning: null, error: null };
  if (digits.length === 10) {
    return { value: `+55${digits}`, warning: 'Número fixo: verifique se é WhatsApp', error: null };
  }

  return { value: null, warning: null, error: `Número inválido: dígitos insuficientes (${digits.length})` };
}

export function normalizeEmail(raw: string): TextFieldResult {
  if (!raw || !raw.trim()) return { value: null, error: null };
  const clean = raw.trim().toLowerCase().replace(/\s/g, '');
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
  if (!valid) return { value: null, error: 'Email inválido' };
  return { value: clean, error: null };
}

export function normalizeCnpj(raw: string): TextFieldResult {
  if (!raw || !raw.trim()) return { value: null, error: null };
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 14) return { value: null, error: 'CNPJ deve ter 14 dígitos' };

  // Validação dos dígitos verificadores
  const calcDigit = (nums: number[], weights: number[]) => {
    const sum = nums.reduce((acc, n, i) => acc + n * weights[i], 0);
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };
  const nums = digits.split('').map(Number);
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  if (calcDigit(nums.slice(0, 12), w1) !== nums[12]) return { value: null, error: 'CNPJ inválido (dígito verificador)' };
  if (calcDigit(nums.slice(0, 13), w2) !== nums[13]) return { value: null, error: 'CNPJ inválido (dígito verificador)' };

  const formatted = `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12)}`;
  return { value: formatted, error: null };
}

export function normalizeWebsite(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  let url = raw.trim();
  if (url.startsWith('http://')) url = url.replace('http://', 'https://');
  if (!url.startsWith('https://')) url = `https://${url}`;
  return url;
}

export function normalizeInstagram(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  let handle = raw.trim();
  // Extrai handle de URL
  const match = handle.match(/instagram\.com\/([^/?#]+)/i);
  if (match) handle = match[1];
  // Remove @ se tiver para recolocar limpo
  handle = handle.replace(/^@/, '');
  if (!handle) return null;
  return `@${handle}`;
}

export function normalizeLinkedin(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  // Detecta se é URL LinkedIn
  if (!trimmed.toLowerCase().includes('linkedin')) return null;
  // Remove https:// www. e trailing slash
  return trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
}

/** Normaliza uma linha já mapeada para os campos do sistema */
export function normalizeLeadRow(raw: RawMappedLead): NormalizedLead {
  const warnings: NormalizedLead['warnings'] = {};
  const errors: NormalizedLead['errors'] = {};

  const phone = normalizePhone(raw.whatsapp ?? '');
  if (phone.error) errors.whatsapp = phone.error;
  if (phone.warning) warnings.whatsapp = phone.warning;

  const tel = normalizePhone(raw.telefone ?? '');
  if (tel.error && raw.telefone) warnings.telefone = tel.error;

  const email = normalizeEmail(raw.email ?? '');
  if (email.error) warnings.email = email.error;

  const cnpj = normalizeCnpj(raw.cnpj ?? '');
  if (cnpj.error && raw.cnpj) warnings.cnpj = cnpj.error;

  return {
    empresa: normalizeText(raw.empresa ?? ''),
    lead: normalizeText(raw.lead ?? ''),
    whatsapp: phone.value,
    telefone: tel.value,
    email: email.value,
    cidade: raw.cidade ? normalizeText(raw.cidade) : null,
    bairro: raw.bairro ? normalizeText(raw.bairro) : null,
    categoria: raw.categoria ? normalizeText(raw.categoria) : null,
    cnpj: cnpj.value,
    website: normalizeWebsite(raw.website ?? ''),
    instagram: normalizeInstagram(raw.instagram ?? ''),
    linkedin: normalizeLinkedin(raw.linkedin ?? ''),
    resumo_analitico: raw.resumo_analitico?.trim() || null,
    warnings,
    errors,
  };
}
```

- [ ] **Step 4: Rodar os testes para ver passar**

```bash
npx vitest run tests/unit/normalizer.spec.ts
```

Esperado: todos passando. Se algum falhar, ajustar a implementação.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/normalizer.ts tests/unit/normalizer.spec.ts
git commit -m "feat: engine de normalização de leads (normalizer.ts) com testes"
```

---

## Task 4: Engine de deduplicação intra-arquivo

**Files:**
- Create: `src/lib/import/deduplicator.ts`

- [ ] **Step 1: Implementar deduplicator.ts**

Criar `src/lib/import/deduplicator.ts`:

```typescript
import type { NormalizedLead, MergedLead, FieldConflict, LeadField } from './types';

const MERGEABLE_FIELDS: LeadField[] = [
  'empresa', 'lead', 'whatsapp', 'telefone', 'email',
  'cidade', 'bairro', 'categoria', 'cnpj', 'website',
  'instagram', 'linkedin', 'resumo_analitico',
];

/** Similaridade de Sørensen–Dice entre duas strings (0–1) */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const getBigrams = (s: string) => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
    }
    return bigrams;
  };
  const bigramsA = getBigrams(a.toLowerCase());
  const bigramsB = getBigrams(b.toLowerCase());
  let intersection = 0;
  bigramsA.forEach((count, bg) => {
    intersection += Math.min(count, bigramsB.get(bg) ?? 0);
  });
  return (2 * intersection) / (a.length + b.length - 2);
}

function getIdentityKey(lead: NormalizedLead): string | null {
  if (lead.whatsapp) return `wa:${lead.whatsapp}`;
  if (lead.email) return `em:${lead.email}`;
  return null;
}

function mergeTwo(a: NormalizedLead, b: NormalizedLead): MergedLead {
  const merged = { ...a };
  const conflicts: FieldConflict[] = [];

  for (const field of MERGEABLE_FIELDS) {
    const valA = a[field] as string | null;
    const valB = b[field] as string | null;

    if (!valA && valB) {
      // A vazio, B preenchido → B vence
      (merged as Record<string, unknown>)[field] = valB;
    } else if (valA && valB && valA !== valB) {
      // Ambos preenchidos com valores diferentes → conflito
      conflicts.push({ field, valueA: valA, valueB: valB });
    }
  }

  // Merge warnings/errors
  merged.warnings = { ...a.warnings, ...b.warnings };
  merged.errors = { ...a.errors, ...b.errors };

  return { normalized: merged, conflicts };
}

/**
 * Deduplica uma lista de leads normalizados.
 * Retorna MergedLead[] sem duplicatas — registros idênticos são mesclados.
 */
export function deduplicateLeads(leads: NormalizedLead[]): MergedLead[] {
  const keyMap = new Map<string, MergedLead>();
  const noKeyResults: MergedLead[] = [];

  for (const lead of leads) {
    const key = getIdentityKey(lead);

    if (!key) {
      // Sem chave de identidade — tenta fuzzy match por empresa+cidade
      const fuzzyMatch = noKeyResults.find(existing => {
        const sim = similarity(
          `${existing.normalized.empresa} ${existing.normalized.cidade ?? ''}`,
          `${lead.empresa} ${lead.cidade ?? ''}`
        );
        return sim > 0.85;
      });

      if (fuzzyMatch) {
        const merged = mergeTwo(fuzzyMatch.normalized, lead);
        fuzzyMatch.normalized = merged.normalized;
        fuzzyMatch.conflicts.push(...merged.conflicts);
      } else {
        noKeyResults.push({ normalized: lead, conflicts: [] });
      }
      continue;
    }

    const existing = keyMap.get(key);
    if (existing) {
      const merged = mergeTwo(existing.normalized, lead);
      existing.normalized = merged.normalized;
      existing.conflicts.push(...merged.conflicts);
    } else {
      keyMap.set(key, { normalized: lead, conflicts: [] });
    }
  }

  return [...keyMap.values(), ...noKeyResults];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/import/deduplicator.ts
git commit -m "feat: deduplicação intra-arquivo com merge de campos complementares"
```

---

## Task 5: Column mapper (mapeamento por IA)

**Files:**
- Create: `src/lib/import/column-mapper.ts`

- [ ] **Step 1: Implementar column-mapper.ts**

Criar `src/lib/import/column-mapper.ts`:

```typescript
import type { ColumnMapping, LeadField } from './types';
import { LEAD_FIELDS } from './types';

export interface MapColumnsInput {
  columns: string[];
  sample: Record<string, string>[];
}

export interface MapColumnsResult {
  mappings: ColumnMapping[];
  unmapped: string[];
}

const FIELD_DESCRIPTIONS: Record<LeadField, string> = {
  empresa: 'nome da empresa ou razão social',
  lead: 'nome do contato ou responsável',
  whatsapp: 'número de WhatsApp ou celular',
  telefone: 'número de telefone fixo',
  email: 'endereço de email',
  cidade: 'cidade ou município',
  bairro: 'bairro ou região',
  categoria: 'categoria, nicho ou segmento de mercado',
  cnpj: 'CNPJ da empresa',
  website: 'site ou URL da empresa',
  instagram: 'perfil do Instagram',
  linkedin: 'perfil do LinkedIn (pessoa ou empresa)',
  resumo_analitico: 'resumo, observações ou descrição da empresa',
};

/** Chama a API de mapeamento. Usar no cliente. */
export async function mapColumnsViaApi(input: MapColumnsInput): Promise<MapColumnsResult> {
  const res = await fetch('/api/leads/import/map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Mapeamento falhou: ${res.status}`);
  return res.json();
}

/** Fallback local: tenta mapear por correspondência de string simples */
export function mapColumnsLocally(columns: string[]): MapColumnsResult {
  const KNOWN_ALIASES: Record<string, LeadField> = {
    'empresa': 'empresa', 'company': 'empresa', 'razao social': 'empresa', 'razão social': 'empresa', 'nome empresa': 'empresa',
    'lead': 'lead', 'contato': 'lead', 'nome': 'lead', 'name': 'lead', 'responsavel': 'lead', 'responsável': 'lead',
    'whatsapp': 'whatsapp', 'celular': 'whatsapp', 'cel': 'whatsapp', 'mobile': 'whatsapp', 'phone': 'whatsapp',
    'telefone': 'telefone', 'tel': 'telefone', 'fone': 'telefone', 'fixo': 'telefone',
    'email': 'email', 'e-mail': 'email', 'mail': 'email',
    'cidade': 'cidade', 'city': 'cidade', 'municipio': 'cidade', 'município': 'cidade',
    'bairro': 'bairro', 'regiao': 'bairro', 'região': 'bairro',
    'categoria': 'categoria', 'nicho': 'categoria', 'segmento': 'categoria', 'category': 'categoria',
    'cnpj': 'cnpj',
    'website': 'website', 'site': 'website', 'url': 'website',
    'instagram': 'instagram', 'insta': 'instagram',
    'linkedin': 'linkedin',
    'resumo': 'resumo_analitico', 'observacoes': 'resumo_analitico', 'observações': 'resumo_analitico', 'descricao': 'resumo_analitico', 'descrição': 'resumo_analitico', 'notes': 'resumo_analitico',
  };

  const mappings: ColumnMapping[] = [];
  const unmapped: string[] = [];

  for (const col of columns) {
    const normalized = col.toLowerCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ');
    const field = KNOWN_ALIASES[normalized];
    if (field) {
      mappings.push({ sourceColumn: col, targetField: field, confidence: 0.9 });
    } else {
      unmapped.push(col);
    }
  }

  return { mappings, unmapped };
}

export { FIELD_DESCRIPTIONS, LEAD_FIELDS };
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/import/column-mapper.ts
git commit -m "feat: mapeamento de colunas (IA + fallback local)"
```

---

## Task 6: API — POST /api/leads/import/map

**Files:**
- Create: `app/api/leads/import/map/route.ts`

- [ ] **Step 1: Criar o endpoint de mapeamento**

Criar `app/api/leads/import/map/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { LEAD_FIELDS, FIELD_DESCRIPTIONS } from '@/lib/import/column-mapper';
import type { ColumnMapping } from '@/lib/import/types';
import { getCurrentOpenAIKey } from '@/lib/ai/openai-key-context';

export const runtime = 'nodejs';
export const maxDuration = 10;

const RequestSchema = z.object({
  columns: z.array(z.string()).min(1).max(100),
  sample: z.array(z.record(z.string())).max(5),
});

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { columns, sample } = parsed.data;

  const fieldDescriptions = LEAD_FIELDS
    .map(f => `- "${f}": ${FIELD_DESCRIPTIONS[f]}`)
    .join('\n');

  const prompt = `Você é um assistente que mapeia colunas de planilhas para campos de um sistema de CRM.

Campos disponíveis no sistema:
${fieldDescriptions}

Colunas da planilha do usuário: ${JSON.stringify(columns)}

Amostra de dados (até 5 linhas):
${JSON.stringify(sample, null, 2)}

Retorne um JSON com este formato exato:
{
  "mappings": [
    { "sourceColumn": "nome da coluna na planilha", "targetField": "campo do sistema ou null", "confidence": 0.95 }
  ],
  "unmapped": ["colunas que não se encaixam em nenhum campo"]
}

Regras:
- confidence entre 0.0 e 1.0
- Se a coluna não corresponde a nenhum campo, coloque targetField como null e adicione em unmapped
- Não crie campos que não existem na lista
- Analise o conteúdo da amostra para inferir o tipo de dado`;

  try {
    const apiKey = getCurrentOpenAIKey() || process.env.OPENAI_API_KEY!;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
    });

    clearTimeout(timeout);

    if (!aiRes.ok) throw new Error(`OpenAI ${aiRes.status}`);
    const aiJson = await aiRes.json();
    const content = JSON.parse(aiJson.choices[0].message.content);

    // Filtra targetField null e garante que só campos válidos passam
    const validFields = new Set<string>(LEAD_FIELDS);
    const mappings: ColumnMapping[] = (content.mappings ?? [])
      .filter((m: { targetField: string | null }) => m.targetField && validFields.has(m.targetField))
      .map((m: { sourceColumn: string; targetField: string; confidence: number }) => ({
        sourceColumn: m.sourceColumn,
        targetField: m.targetField as typeof LEAD_FIELDS[number],
        confidence: Math.min(1, Math.max(0, m.confidence ?? 0)),
      }));

    const unmapped: string[] = content.unmapped ?? columns.filter(
      (c: string) => !mappings.some((m: ColumnMapping) => m.sourceColumn === c)
    );

    return NextResponse.json({ mappings, unmapped });
  } catch (err) {
    // Timeout ou erro da IA → retorna mapeamento vazio (fallback manual no cliente)
    console.warn('[import/map] AI mapping failed, returning empty:', err);
    return NextResponse.json({ mappings: [], unmapped: columns });
  }
}
```

- [ ] **Step 2: Testar manualmente**

```bash
curl -X POST http://localhost:3000/api/leads/import/map \
  -H "Content-Type: application/json" \
  -d '{"columns":["Nome da Empresa","Cel / WhatsApp","E-mail"],"sample":[{"Nome da Empresa":"Clínica São Pedro","Cel / WhatsApp":"(11) 99999-8888","E-mail":"contato@clinica.com"}]}'
```

Esperado: JSON com `mappings` mapeando `empresa`, `whatsapp`, `email`.

- [ ] **Step 3: Commit**

```bash
git add app/api/leads/import/map/route.ts
git commit -m "feat: POST /api/leads/import/map — mapeamento de colunas via IA"
```

---

## Task 7: API — Reescrever POST /api/leads/import

**Files:**
- Rewrite: `app/api/leads/import/route.ts`

- [ ] **Step 1: Reescrever o endpoint de importação**

Substituir todo o conteúdo de `app/api/leads/import/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { normalizePhone } from '@/lib/import/normalizer';
import type { NormalizedLead, ImportReport, ImportResultRow } from '@/lib/import/types';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NormalizedLeadSchema = z.object({
  empresa: z.string().min(1),
  lead: z.string(),
  whatsapp: z.string().nullable(),
  telefone: z.string().nullable(),
  email: z.string().nullable(),
  cidade: z.string().nullable(),
  bairro: z.string().nullable(),
  categoria: z.string().nullable(),
  cnpj: z.string().nullable(),
  website: z.string().nullable(),
  instagram: z.string().nullable(),
  linkedin: z.string().nullable(),
  resumo_analitico: z.string().nullable(),
  warnings: z.record(z.string()).optional(),
  errors: z.record(z.string()).optional(),
});

const RequestSchema = z.object({
  leads: z.array(NormalizedLeadSchema).min(1).max(1000),
  options: z.object({
    defaultEstagio: z.string().default('Novo'),
    defaultOrigem: z.string().default('importação'),
  }).optional(),
});

async function findExistingLead(db: ReturnType<typeof createClient>, userId: string, lead: NormalizedLead) {
  if (lead.whatsapp) {
    const digits = lead.whatsapp.replace(/\D/g, '');
    const localDigits = digits.length >= 11 ? digits.slice(-11) : digits.slice(-8);
    const { data } = await (db as any).rpc('find_lead_by_phone_digits', {
      p_digits: localDigits,
      p_user_id: userId,
    });
    if (data?.[0]) return data[0] as { id: string };
  }
  if (lead.email) {
    const { data } = await db
      .from('leads_prospeccao')
      .select('id')
      .eq('user_id', userId)
      .eq('email', lead.email)
      .limit(1)
      .maybeSingle();
    if (data) return data as { id: string };
  }
  return null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { leads, options } = parsed.data;
  const estagio = options?.defaultEstagio ?? 'Novo';
  const origem = options?.defaultOrigem ?? 'importação';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const rows: ImportResultRow[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const importId = uuidv4();
  const now = new Date().toISOString();

  const chunks = chunk(leads, 50);

  for (const batch of chunks) {
    for (const lead of batch) {
      try {
        const existing = await findExistingLead(db, user.id, lead);

        if (existing) {
          // Merge: atualiza apenas campos vazios no banco
          const updateFields: Record<string, unknown> = { updated_at: now };
          const fieldsToCheck: (keyof NormalizedLead)[] = [
            'telefone', 'email', 'cidade', 'bairro', 'categoria',
            'cnpj', 'website', 'instagram', 'linkedin', 'resumo_analitico',
          ];

          const { data: current } = await db
            .from('leads_prospeccao')
            .select(fieldsToCheck.join(','))
            .eq('id', existing.id)
            .single();

          for (const field of fieldsToCheck) {
            const currentVal = current?.[field as keyof typeof current];
            const newVal = lead[field];
            if (!currentVal && newVal) updateFields[field] = newVal;
          }

          if (Object.keys(updateFields).length > 1) {
            await db.from('leads_prospeccao').update(updateFields).eq('id', existing.id);
          }

          rows.push({ empresa: lead.empresa, status: 'updated' });
          updated++;
        } else {
          const { error: insertErr } = await db.from('leads_prospeccao').insert({
            id: `import-${importId}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
            user_id: user.id,
            empresa: lead.empresa,
            lead: lead.lead || lead.empresa,
            contato: lead.lead || null,
            whatsapp: lead.whatsapp,
            telefone: lead.telefone,
            email: lead.email,
            cidade: lead.cidade,
            bairro: lead.bairro,
            categoria: lead.categoria,
            cnpj: lead.cnpj,
            website: lead.website,
            instagram: lead.instagram,
            linkedin: lead.linkedin,
            resumo_analitico: lead.resumo_analitico,
            status: 'Novo Lead',
            estagio_pipeline: estagio,
            status_msg_wa: 'not_sent',
            modo_atendimento: 'bot',
            origem,
            created_at: now,
            updated_at: now,
          });

          if (insertErr) {
            rows.push({ empresa: lead.empresa, status: 'error', reason: insertErr.message });
            errors++;
          } else {
            rows.push({ empresa: lead.empresa, status: 'created' });
            created++;
          }
        }
      } catch (err) {
        rows.push({ empresa: lead.empresa, status: 'error', reason: String(err) });
        errors++;
      }
    }
  }

  // Audit log
  await db.from('audit_logs').insert({
    user_id: user.id,
    action: 'IMPORT_LEADS',
    details: { created, updated, skipped, errors, importId },
    created_at: now,
  }).catch(() => null); // não falha a importação por erro de audit

  const report: ImportReport = { created, updated, skipped, errors, rows, importId };
  return NextResponse.json(report);
}
```

- [ ] **Step 2: Verificar se uuid está disponível**

```bash
npm list uuid
```

Se não estiver: `npm install uuid && npm install -D @types/uuid`

- [ ] **Step 3: Commit**

```bash
git add app/api/leads/import/route.ts
git commit -m "feat: POST /api/leads/import — upsert em batch com merge e audit log"
```

---

## Task 8: API — POST /api/leads (criação manual)

**Files:**
- Create: `app/api/leads/route.ts`

- [ ] **Step 1: Criar o endpoint de criação manual**

Criar `app/api/leads/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { normalizeLeadRow } from '@/lib/import/normalizer';

export const runtime = 'nodejs';

const CreateLeadSchema = z.object({
  empresa: z.string().min(1, 'Nome da empresa obrigatório'),
  whatsapp: z.string().min(1, 'WhatsApp obrigatório'),
  lead: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().optional(),
  cidade: z.string().optional(),
  bairro: z.string().optional(),
  categoria: z.string().optional(),
  cnpj: z.string().optional(),
  website: z.string().optional(),
  instagram: z.string().optional(),
  linkedin: z.string().optional(),
  resumo_analitico: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = CreateLeadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const normalized = normalizeLeadRow(parsed.data);

  // Checar WhatsApp duplicado
  if (normalized.whatsapp) {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const digits = normalized.whatsapp.replace(/\D/g, '');
    const localDigits = digits.length >= 11 ? digits.slice(-11) : digits.slice(-8);
    const { data: existing } = await (db as any).rpc('find_lead_by_phone_digits', {
      p_digits: localDigits,
      p_user_id: user.id,
    });
    if (existing?.[0]) {
      return NextResponse.json(
        { error: 'Já existe um lead com esse WhatsApp', existingLead: existing[0] },
        { status: 409 }
      );
    }
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const now = new Date().toISOString();
  const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const { data, error } = await db.from('leads_prospeccao').insert({
    id,
    user_id: user.id,
    empresa: normalized.empresa,
    lead: normalized.lead || normalized.empresa,
    contato: normalized.lead || null,
    whatsapp: normalized.whatsapp,
    telefone: normalized.telefone,
    email: normalized.email,
    cidade: normalized.cidade,
    bairro: normalized.bairro,
    categoria: normalized.categoria,
    cnpj: normalized.cnpj,
    website: normalized.website,
    instagram: normalized.instagram,
    linkedin: normalized.linkedin,
    resumo_analitico: normalized.resumo_analitico,
    status: 'Novo Lead',
    estagio_pipeline: 'Novo',
    status_msg_wa: 'not_sent',
    modo_atendimento: 'bot',
    origem: 'manual',
    created_at: now,
    updated_at: now,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/leads/route.ts
git commit -m "feat: POST /api/leads — criação manual de lead com normalização"
```

---

## Task 9: LeadEditModal — adicionar campos ausentes

**Files:**
- Modify: `src/components/LeadEditModal.tsx`
- Modify: `src/types/prospection.ts`

- [ ] **Step 1: Adicionar `linkedin` ao tipo Lead**

Em `src/types/prospection.ts`, localizar a interface `Lead` e adicionar o campo:

```typescript
linkedin?: string | null;
```

Verificar também se `telefone`, `bairro` e `resumo_analitico` já estão no tipo — se não estiverem, adicionar também.

- [ ] **Step 2: Adicionar campos ao schema Zod**

Em `src/components/LeadEditModal.tsx`, localizar o `leadEditSchema` (linha ~40) e adicionar os campos ausentes:

```typescript
// Adicionar após instagram:
  linkedin: z.string().optional(),
  telefone: z.string().optional(),
  bairro: z.string().optional(),
  resumo_analitico: z.string().optional(),
```

- [ ] **Step 2: Adicionar campos aos defaultValues do useForm**

No `useForm` (linha ~80), adicionar nos `defaultValues`:
```typescript
linkedin: lead?.linkedin || "",
telefone: lead?.telefone || "",
bairro: lead?.bairro || "",
resumo_analitico: lead?.resumo_analitico || "",
```

- [ ] **Step 3: Adicionar campos ao useEffect de reset**

No `form.reset` dentro do `useEffect` (linha ~101), adicionar:
```typescript
linkedin: lead?.linkedin || "",
telefone: lead?.telefone || "",
bairro: lead?.bairro || "",
resumo_analitico: lead?.resumo_analitico || "",
```

- [ ] **Step 4: Adicionar campos ao updateData**

No `onSubmit`, dentro de `updateData` (linha ~123), adicionar:
```typescript
linkedin: data.linkedin || null,
telefone: data.telefone || null,
bairro: data.bairro || null,
resumo_analitico: data.resumo_analitico || null,
```

- [ ] **Step 5: Adicionar campos ao JSX do formulário**

Após o campo `instagram` no JSX, adicionar:

```tsx
<FormField
  control={form.control}
  name="linkedin"
  render={({ field }) => (
    <FormItem>
      <FormLabel>LinkedIn</FormLabel>
      <FormControl>
        <Input placeholder="linkedin.com/company/empresa" {...field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
<FormField
  control={form.control}
  name="telefone"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Telefone Fixo</FormLabel>
      <FormControl>
        <Input placeholder="(11) 3333-4444" {...field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
<FormField
  control={form.control}
  name="bairro"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Bairro</FormLabel>
      <FormControl>
        <Input placeholder="Centro" {...field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
<FormField
  control={form.control}
  name="resumo_analitico"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Observações</FormLabel>
      <FormControl>
        <Textarea placeholder="Informações adicionais sobre o lead..." rows={3} {...field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

- [ ] **Step 6: Suportar modo "criar" (sem lead pré-preenchido)**

No início do componente, antes do `useForm`, adicionar:
```typescript
const isCreateMode = !lead;
```

No `onSubmit`, adicionar o branch de criação antes da lógica de update existente:

```typescript
if (isCreateMode) {
  const res = await fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      empresa: data.empresa,
      whatsapp: data.whatsapp,
      lead: data.contato,
      telefone: data.telefone,
      email: data.email,
      website: data.website,
      instagram: data.instagram,
      linkedin: data.linkedin,
      cidade: data.cidade,
      bairro: data.bairro,
      categoria: data.categoria,
      cnpj: data.cnpj,
      resumo_analitico: data.resumo_analitico,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    if (res.status === 409) {
      toast.warning('WhatsApp já cadastrado', { description: 'Já existe um lead com esse número.' });
    } else {
      toast.error('Erro ao criar lead', { description: err.error });
    }
    return;
  }
  toast.success('Lead criado com sucesso!');
  onSuccess?.();
  onClose();
  return;
}
```

No `DialogTitle`, alterar para mostrar o modo correto:
```tsx
<DialogTitle>{isCreateMode ? 'Novo Lead' : 'Editar Lead'}</DialogTitle>
```

Tornar `whatsapp` obrigatório no modo create (adicionar ao schema):
```typescript
whatsapp: z.string().min(10, 'WhatsApp obrigatório').optional().or(z.literal('')),
```

- [ ] **Step 7: Commit**

```bash
git add src/components/LeadEditModal.tsx
git commit -m "feat: LeadEditModal — add linkedin, telefone, bairro, resumo; modo criar lead"
```

---

## Task 10: Botão "Novo Lead" na página /leads

**Files:**
- Modify: `app/(protected)/leads/page.tsx`

- [ ] **Step 1: Adicionar estado para o modal de criação**

Em `leads/page.tsx`, localizar os estados existentes do `LeadEditModal` e adicionar:
```typescript
const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
```

- [ ] **Step 2: Adicionar botão "Novo Lead" no header**

Localizar o botão `ImportLeadsModal` (que já existe na página) e adicionar ao lado:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setIsCreateModalOpen(true)}
  className="gap-2"
>
  <Plus className="h-4 w-4" />
  Novo Lead
</Button>
```

Adicionar `Plus` ao import de `lucide-react`.

- [ ] **Step 3: Adicionar o modal de criação no JSX**

Ao final do JSX da página, antes do fechamento, adicionar:

```tsx
<LeadEditModal
  lead={null}
  open={isCreateModalOpen}
  onClose={() => setIsCreateModalOpen(false)}
  onSuccess={() => {
    setIsCreateModalOpen(false);
    loadLeads();
  }}
/>
```

- [ ] **Step 4: Commit**

```bash
git add app/(protected)/leads/page.tsx
git commit -m "feat: botão 'Novo Lead' na página /leads para criação manual"
```

---

## Task 11: ImportLeadsModal — reescrever com 4 etapas

**Files:**
- Rewrite: `src/components/leads/ImportLeadsModal.tsx`

Este é o componente mais complexo. Substitua todo o conteúdo do arquivo:

- [ ] **Step 1: Implementar o modal completo**

```tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2,
  AlertTriangle, X, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { normalizeLeadRow } from '@/lib/import/normalizer';
import { deduplicateLeads } from '@/lib/import/deduplicator';
import { mapColumnsViaApi, mapColumnsLocally, LEAD_FIELDS } from '@/lib/import/column-mapper';
import type {
  ColumnMapping, MergedLead, FieldConflict, NormalizedLead,
  RawMappedLead, LeadField, ImportReport,
} from '@/lib/import/types';

const SUPPORTED_EXTS = ['.csv', '.xlsx', '.xls', '.vcf', '.txt'];
const REQUIRED_FIELDS: LeadField[] = ['empresa', 'whatsapp', 'lead'];
const MAX_LEADS = 1000;
const MAX_FILE_MB = 10;

type Step = 1 | 2 | 3 | 4;

interface ImportLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: (count: number) => void;
}

// ─── Parsers ───────────────────────────────────────────────────────────────────

function parseFile(file: File): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'csv' || ext === 'txt') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const result = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        const columns = result.meta.fields ?? [];
        resolve({ columns, rows: result.data });
      };
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        resolve({ columns, rows: rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))) });
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    } else if (ext === 'vcf') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const cards = text.split(/BEGIN:VCARD/i).slice(1);
        const rows = cards.map(card => {
          const get = (field: string) => card.match(new RegExp(`${field}[^:]*:(.+)`, 'i'))?.[1]?.trim() ?? '';
          return {
            'empresa': get('ORG') || get('FN'),
            'lead': get('FN'),
            'whatsapp': get('TEL;TYPE=WHATSAPP') || get('TEL;CELL') || get('TEL;MOBILE') || get('TEL'),
            'email': get('EMAIL'),
          };
        }).filter(r => r.lead || r.whatsapp);
        resolve({ columns: ['empresa', 'lead', 'whatsapp', 'email'], rows });
      };
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    } else {
      reject(new Error(`Formato não suportado: .${ext}`));
    }
  });
}

function applyMappings(
  rows: Record<string, string>[],
  mappings: ColumnMapping[]
): RawMappedLead[] {
  return rows.map(row => {
    const mapped: RawMappedLead = {};
    for (const m of mappings) {
      if (m.targetField !== 'ignore') {
        const val = row[m.sourceColumn];
        if (val) mapped[m.targetField] = val;
      }
    }
    return mapped;
  });
}

function generateReportCSV(report: ImportReport): string {
  const header = 'Empresa,Status,Motivo\n';
  const body = report.rows.map(r =>
    `"${r.empresa.replace(/"/g, '""')}","${r.status}","${(r.reason ?? '').replace(/"/g, '""')}"`
  ).join('\n');
  return header + body;
}

// ─── Componente Principal ──────────────────────────────────────────────────────

export function ImportLeadsModal({ isOpen, onClose, onImported }: ImportLeadsModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMapping, setIsMapping] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [mergedLeads, setMergedLeads] = useState<MergedLead[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep(1);
    setFile(null);
    setColumns([]);
    setRawRows([]);
    setMappings([]);
    setMergedLeads([]);
    setReport(null);
    setIsMapping(false);
    setIsImporting(false);
  }, []);

  const handleClose = () => {
    if (step === 2 || step === 3) {
      if (!confirm('Tem certeza? O progresso do mapeamento será perdido.')) return;
    }
    reset();
    onClose();
  };

  const handleFile = async (f: File) => {
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`Arquivo muito grande (máx. ${MAX_FILE_MB}MB)`);
      return;
    }
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!SUPPORTED_EXTS.includes(`.${ext}`)) {
      toast.error(`Formato .${ext} não suportado`, { description: `Aceito: ${SUPPORTED_EXTS.join(', ')}` });
      return;
    }
    setFile(f);
    setReport(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const goToMapping = async () => {
    if (!file) return;
    setIsMapping(true);
    try {
      const parsed = await parseFile(file);
      let rows = parsed.rows;

      if (rows.length > MAX_LEADS) {
        toast.warning(`Arquivo com ${rows.length} leads — apenas os primeiros ${MAX_LEADS} serão importados`);
        rows = rows.slice(0, MAX_LEADS);
      }

      setColumns(parsed.columns);
      setRawRows(rows);

      const sample = rows.slice(0, 5);

      let result;
      try {
        result = await mapColumnsViaApi({ columns: parsed.columns, sample });
      } catch {
        result = mapColumnsLocally(parsed.columns);
        toast.warning('Mapeamento automático por IA indisponível — use o fallback local');
      }

      // Mescla mapeamentos da IA com unmapped (marcados como ignore)
      const allMappings: ColumnMapping[] = [
        ...result.mappings,
        ...result.unmapped.map(col => ({ sourceColumn: col, targetField: 'ignore' as const, confidence: 0 })),
      ];
      setMappings(allMappings);
      setStep(2);
    } catch (err) {
      toast.error('Erro ao ler o arquivo', { description: String(err) });
    } finally {
      setIsMapping(false);
    }
  };

  const goToPreview = () => {
    const rawMapped = applyMappings(rawRows, mappings.filter(m => m.targetField !== 'ignore'));
    const normalized = rawMapped.map(r => normalizeLeadRow(r));
    const deduplicated = deduplicateLeads(normalized);
    setMergedLeads(deduplicated);
    setStep(3);
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      // Aplica resoluções de conflitos
      const resolved = mergedLeads.map(ml => {
        const lead = { ...ml.normalized };
        for (const conflict of ml.conflicts) {
          if (conflict.resolution === 'a') {
            (lead as Record<string, unknown>)[conflict.field] = conflict.valueA;
          } else if (conflict.resolution === 'b') {
            (lead as Record<string, unknown>)[conflict.field] = conflict.valueB;
          } else if (conflict.resolution === 'custom') {
            (lead as Record<string, unknown>)[conflict.field] = conflict.customValue ?? conflict.valueA;
          } else if (conflict.resolution === 'both') {
            (lead as Record<string, unknown>)[conflict.field] = `${conflict.valueA}; ${conflict.valueB}`;
          }
        }
        return lead;
      });

      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: resolved, options: { defaultOrigem: 'importação' } }),
      });
      const json: ImportReport & { error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`);

      setReport(json);
      setStep(4);
      if (json.created + json.updated > 0) {
        onImported?.(json.created + json.updated);
      }
    } catch (err) {
      toast.error('Erro na importação', { description: String(err) });
    } finally {
      setIsImporting(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;
    const csv = generateReportCSV(report);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-importacao-${report.importId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Verifica se todos os conflitos foram resolvidos
  const allConflictsResolved = mergedLeads.every(ml => ml.conflicts.every(c => c.resolution));
  const invalidLeads = mergedLeads.filter(ml => Object.keys(ml.normalized.errors).length > 0);
  const readyLeads = mergedLeads.filter(ml =>
    Object.keys(ml.normalized.errors).length === 0 && ml.conflicts.every(c => c.resolution)
  );
  const conflictLeads = mergedLeads.filter(ml => ml.conflicts.some(c => !c.resolution));

  const requiredMapped = REQUIRED_FIELDS.every(f =>
    mappings.some(m => m.targetField === f)
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-primary" />
            Importar Leads
            <span className="ml-auto text-xs text-muted-foreground font-normal">
              Etapa {step} de 4
            </span>
          </DialogTitle>
          <Progress value={step * 25} className="h-1 mt-2" />
        </DialogHeader>

        {/* ── Etapa 1: Upload ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer
                ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60'}
                ${file ? 'bg-primary/5 border-primary/40' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef} type="file" className="hidden"
                accept={SUPPORTED_EXTS.join(',')}
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              {file ? (
                <div className="space-y-2">
                  <FileText className="h-10 w-10 text-primary mx-auto" />
                  <p className="font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  <p className="text-xs text-primary">Clique para trocar</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <UploadCloud className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="font-medium">Arraste ou clique para selecionar</p>
                  <p className="text-xs text-muted-foreground">CSV · XLSX · VCF · TXT · máx. {MAX_FILE_MB}MB · até {MAX_LEADS} leads</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Etapa 2: Mapeamento ── */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A IA mapeou as colunas automaticamente. Revise e corrija se necessário.
            </p>
            {!requiredMapped && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Campos obrigatórios sem mapeamento: {REQUIRED_FIELDS.filter(f => !mappings.some(m => m.targetField === f)).join(', ')}
              </div>
            )}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Coluna na planilha</th>
                    <th className="text-left p-3 font-medium">Campo no sistema</th>
                    <th className="text-left p-3 font-medium w-24">Confiança</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m, i) => (
                    <tr key={i} className={`border-t ${m.confidence < 0.8 && m.targetField !== 'ignore' ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}`}>
                      <td className="p-3 font-mono text-xs">{m.sourceColumn}</td>
                      <td className="p-3">
                        <Select
                          value={m.targetField}
                          onValueChange={val => setMappings(prev => prev.map((pm, pi) =>
                            pi === i ? { ...pm, targetField: val as LeadField | 'ignore' } : pm
                          ))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ignore">— Ignorar coluna —</SelectItem>
                            {LEAD_FIELDS.map(f => (
                              <SelectItem key={f} value={f}>{f}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3">
                        {m.targetField === 'ignore' ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <span className={`text-xs font-medium ${m.confidence >= 0.8 ? 'text-green-600' : 'text-yellow-600'}`}>
                            {Math.round(m.confidence * 100)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Etapa 3: Preview + Conflitos ── */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="flex gap-3 text-sm">
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-4 w-4" /> {readyLeads.length} prontos
              </span>
              <span className="flex items-center gap-1 text-yellow-600">
                <AlertTriangle className="h-4 w-4" /> {conflictLeads.length} conflitos
              </span>
              <span className="flex items-center gap-1 text-destructive">
                <X className="h-4 w-4" /> {invalidLeads.length} inválidos
              </span>
            </div>

            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">Todos ({mergedLeads.length})</TabsTrigger>
                <TabsTrigger value="ready">Prontos ({readyLeads.length})</TabsTrigger>
                <TabsTrigger value="conflicts">Conflitos ({conflictLeads.length})</TabsTrigger>
                <TabsTrigger value="invalid">Inválidos ({invalidLeads.length})</TabsTrigger>
              </TabsList>

              {(['all', 'ready', 'conflicts', 'invalid'] as const).map(tab => {
                const list = tab === 'all' ? mergedLeads
                  : tab === 'ready' ? mergedLeads.filter(ml => !invalidLeads.includes(ml) && !conflictLeads.includes(ml))
                  : tab === 'conflicts' ? conflictLeads
                  : invalidLeads;

                return (
                  <TabsContent key={tab} value={tab} className="space-y-2 mt-2">
                    {list.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhum lead nesta categoria</p>
                    )}
                    {list.map((ml, i) => (
                      <div key={i} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{ml.normalized.empresa}</span>
                          <div className="flex gap-1">
                            {ml.normalized.whatsapp && (
                              <Badge variant="outline" className="text-xs">{ml.normalized.whatsapp}</Badge>
                            )}
                            {ml.existsInDb && <Badge variant="secondary" className="text-xs">Vai mesclar (DB)</Badge>}
                            {Object.keys(ml.normalized.errors).length > 0 && (
                              <Badge variant="destructive" className="text-xs">Inválido</Badge>
                            )}
                          </div>
                        </div>

                        {/* Erros */}
                        {Object.entries(ml.normalized.errors).map(([field, err]) => (
                          <p key={field} className="text-xs text-destructive">❌ {field}: {err}</p>
                        ))}

                        {/* Warnings */}
                        {Object.entries(ml.normalized.warnings).map(([field, warn]) => (
                          <p key={field} className="text-xs text-yellow-600">⚠ {field}: {warn}</p>
                        ))}

                        {/* Conflitos */}
                        {ml.conflicts.map((conflict, ci) => (
                          <div key={ci} className="bg-yellow-50 dark:bg-yellow-900/10 rounded-lg p-2 space-y-2">
                            <p className="text-xs font-medium">Conflito no campo: <code>{conflict.field}</code></p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-white dark:bg-background rounded p-1 border">
                                <p className="text-muted-foreground">Opção A</p>
                                <p className="font-mono">{conflict.valueA}</p>
                              </div>
                              <div className="bg-white dark:bg-background rounded p-1 border">
                                <p className="text-muted-foreground">Opção B</p>
                                <p className="font-mono">{conflict.valueB}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {(['a', 'b', 'both'] as const).map(res => (
                                <Button
                                  key={res}
                                  size="sm"
                                  variant={conflict.resolution === res ? 'default' : 'outline'}
                                  className="text-xs h-6"
                                  onClick={() => {
                                    setMergedLeads(prev => prev.map((pml, pi) =>
                                      pi === i ? {
                                        ...pml,
                                        conflicts: pml.conflicts.map((pc, pci) =>
                                          pci === ci ? { ...pc, resolution: res } : pc
                                        ),
                                      } : pml
                                    ));
                                  }}
                                >
                                  {res === 'a' ? 'Usar A' : res === 'b' ? 'Usar B' : 'Manter ambos'}
                                </Button>
                              ))}
                            </div>
                            {conflict.resolution === 'custom' && (
                              <Input
                                className="h-7 text-xs"
                                placeholder="Digite o valor..."
                                value={conflict.customValue ?? ''}
                                onChange={e => {
                                  setMergedLeads(prev => prev.map((pml, pi) =>
                                    pi === i ? {
                                      ...pml,
                                      conflicts: pml.conflicts.map((pc, pci) =>
                                        pci === ci ? { ...pc, customValue: e.target.value } : pc
                                      ),
                                    } : pml
                                  ));
                                }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
        )}

        {/* ── Etapa 4: Resultado ── */}
        {step === 4 && report && (
          <div className="space-y-4">
            <div className="bg-muted rounded-xl p-6 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
              <p className="font-semibold text-lg">Importação concluída!</p>
            </div>
            <div className="grid grid-cols-4 gap-3 text-center text-sm">
              {[
                { label: 'Criados', value: report.created, color: 'text-green-600' },
                { label: 'Atualizados', value: report.updated, color: 'text-blue-600' },
                { label: 'Ignorados', value: report.skipped, color: 'text-yellow-600' },
                { label: 'Erros', value: report.errors, color: 'text-destructive' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-background border rounded-lg p-3">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p>Arquivo: {file?.name}</p>
              <p>Origem definida como: "importação" · Estágio inicial: "Novo"</p>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <div className="flex gap-2">
            {step > 1 && step < 4 && (
              <Button variant="ghost" onClick={() => setStep(s => (s - 1) as Step)}>
                ← Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 4 ? (
              <>
                <Button variant="outline" onClick={downloadReport} className="gap-2">
                  <Download className="h-4 w-4" /> Baixar relatório
                </Button>
                <Button onClick={() => { reset(); onClose(); }}>Fechar</Button>
              </>
            ) : step === 3 ? (
              <>
                <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
                <Button
                  onClick={handleImport}
                  disabled={isImporting || !allConflictsResolved || readyLeads.length === 0}
                >
                  {isImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Importar {readyLeads.length} leads
                </Button>
              </>
            ) : step === 2 ? (
              <>
                <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
                <Button onClick={goToPreview} disabled={!requiredMapped}>
                  Próximo →
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
                <Button onClick={goToMapping} disabled={!file || isMapping}>
                  {isMapping && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {isMapping ? 'Analisando...' : 'Próximo →'}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/leads/ImportLeadsModal.tsx
git commit -m "feat: ImportLeadsModal — modal 4 etapas com mapeamento IA, normalização e conflitos"
```

---

## Task 12: Teste manual e verificação final

- [ ] **Step 1: Rodar todos os testes unitários**

```bash
cd "C:\Projects\prospect-pulse-54"
npx vitest run
```

Esperado: todos passando.

- [ ] **Step 2: Rodar o build para checar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 3: Testar o fluxo completo manualmente**

1. Abrir `http://localhost:3000/leads`
2. Clicar em "Importar" — modal deve abrir na Etapa 1
3. Fazer upload de um CSV com colunas despadronizadas (ex: "Nome da Empresa", "Cel / WhatsApp")
4. Verificar Etapa 2: mapeamento IA deve sugerir `empresa` e `whatsapp`
5. Clicar "Próximo" → Etapa 3: verificar leads normalizados e conflitos
6. Resolver conflitos e clicar "Importar"
7. Verificar Etapa 4 com contadores corretos
8. Abrir `http://localhost:3000/leads` e verificar leads importados

- [ ] **Step 4: Testar criação manual**

1. Clicar em "Novo Lead" na página `/leads`
2. Preencher empresa e WhatsApp (obrigatórios)
3. Preencher linkedin e outros campos novos
4. Salvar e verificar o lead na tabela

- [ ] **Step 5: Testar edição com novos campos**

1. Abrir o modal de edição de um lead existente
2. Verificar que linkedin, telefone, bairro e observações aparecem no form
3. Preencher e salvar

- [ ] **Step 6: Commit final**

```bash
git add -A
git commit -m "chore: ajustes finais pós-teste — F16 importação de leads"
```

---

## Resumo de Dependências entre Tasks

```
Task 1 (setup/migration)
  └─ Task 2 (types)
       ├─ Task 3 (normalizer) ← requer types
       ├─ Task 4 (deduplicator) ← requer types + normalizer
       └─ Task 5 (column-mapper) ← requer types
            ├─ Task 6 (API map) ← requer column-mapper
            ├─ Task 7 (API import) ← requer normalizer
            ├─ Task 8 (API leads) ← requer normalizer
            ├─ Task 9 (LeadEditModal) ← independente do import
            ├─ Task 10 (leads/page.tsx) ← requer Task 9
            └─ Task 11 (ImportLeadsModal) ← requer Tasks 3,4,5,6,7
                 └─ Task 12 (testes finais)
```
