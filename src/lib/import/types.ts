/** Campos importáveis da planilha — `lead` é gerado automaticamente, nunca importado */
export const LEAD_FIELDS = [
  'empresa', 'contato', 'whatsapp', 'telefone', 'email',
  'cidade', 'bairro', 'categoria', 'cnpj', 'website',
  'instagram', 'linkedin', 'resumo_analitico',
] as const;

export type LeadField = typeof LEAD_FIELDS[number];

/** Um lead após parse e normalização — premissa B2B: empresa é o lead, contato é a pessoa */
export interface NormalizedLead {
  empresa: string;
  /** Nome da pessoa física responsável (contato de atendimento) */
  contato: string | null;
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
  warnings: Partial<Record<LeadField, string>>;
  errors: Partial<Record<LeadField, string>>;
}

/** Um lead antes de normalização (dados brutos mapeados) */
export type RawMappedLead = Partial<Record<LeadField, string>>;

/** Mapeamento de coluna da planilha → campo do sistema */
export interface ColumnMapping {
  sourceColumn: string;
  targetField: LeadField | 'ignore';
  confidence: number;
}

/** Conflito entre dois valores para o mesmo campo */
export interface FieldConflict {
  field: LeadField;
  valueA: string;
  valueB: string;
  resolution?: 'a' | 'b' | 'both' | 'custom';
  customValue?: string;
}

/** Lead após deduplicação intra-arquivo */
export interface MergedLead {
  normalized: NormalizedLead;
  conflicts: FieldConflict[];
  existsInDb?: boolean;
  dbLeadId?: string;
}

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
