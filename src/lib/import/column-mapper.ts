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

export const FIELD_DESCRIPTIONS: Record<LeadField, string> = {
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
      .normalize('NFD').replace(/\p{M}/gu, '')
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

export { LEAD_FIELDS };
