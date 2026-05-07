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
