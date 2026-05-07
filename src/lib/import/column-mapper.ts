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
  empresa: 'nome da empresa ou razão social (obrigatório)',
  contato: 'nome da pessoa física responsável pelo atendimento',
  whatsapp: 'número de WhatsApp ou celular',
  telefone: 'número de telefone fixo',
  email: 'endereço de email',
  cidade: 'cidade ou município',
  bairro: 'bairro ou região',
  categoria: 'categoria, nicho ou segmento de mercado',
  cnpj: 'CNPJ da empresa',
  website: 'site ou URL da empresa',
  instagram: 'perfil do Instagram',
  linkedin: 'perfil do LinkedIn (empresa ou pessoa)',
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

/** Fallback local — mapeia por aliases conhecidos */
export function mapColumnsLocally(columns: string[]): MapColumnsResult {
  const KNOWN_ALIASES: Record<string, LeadField> = {
    // Empresa
    'empresa': 'empresa', 'company': 'empresa', 'razao social': 'empresa',
    'razao_social': 'empresa', 'nome empresa': 'empresa', 'nome_empresa': 'empresa',
    'estabelecimento': 'empresa', 'negocio': 'empresa', 'negócio': 'empresa',
    // Apollo.io: Account Name = empresa
    'account name': 'empresa', 'organization': 'empresa', 'organization name': 'empresa',
    // Contato (pessoa física responsável)
    'contato': 'contato', 'nome': 'contato', 'name': 'contato',
    'responsavel': 'contato', 'responsável': 'contato', 'contact': 'contato',
    'lead': 'contato', 'pessoa': 'contato', 'full name': 'contato',
    'primeiro nome': 'contato', 'nome completo': 'contato',
    // Apollo.io: First Name + Last Name (ambos → contato, concatenados no applyMappings)
    'first name': 'contato', 'last name': 'contato',
    'firstname': 'contato', 'lastname': 'contato',
    // WhatsApp / Celular
    'whatsapp': 'whatsapp', 'celular': 'whatsapp', 'cel': 'whatsapp',
    'mobile': 'whatsapp', 'phone': 'whatsapp', 'telefone celular': 'whatsapp',
    'numero': 'whatsapp', 'número': 'whatsapp',
    // Apollo.io: Mobile Phone
    'mobile phone': 'whatsapp', 'cell phone': 'whatsapp', 'cellular': 'whatsapp',
    // Telefone fixo
    'telefone': 'telefone', 'tel': 'telefone', 'fone': 'telefone', 'fixo': 'telefone',
    'telefone fixo': 'telefone',
    // Apollo.io: Work Phone / Direct Phone
    'work phone': 'telefone', 'work direct phone': 'telefone', 'direct phone': 'telefone',
    'office phone': 'telefone', 'business phone': 'telefone',
    // Email
    'email': 'email', 'e-mail': 'email', 'mail': 'email', 'e mail': 'email',
    // Apollo.io: Email (às vezes aparece como "emails" no export)
    'emails': 'email', 'contact email': 'email', 'work email': 'email',
    // Localização
    'cidade': 'cidade', 'city': 'cidade', 'municipio': 'cidade', 'município': 'cidade',
    'bairro': 'bairro', 'regiao': 'bairro', 'região': 'bairro', 'district': 'bairro',
    // Negócio
    'categoria': 'categoria', 'nicho': 'categoria', 'segmento': 'categoria',
    'category': 'categoria', 'ramo': 'categoria', 'setor': 'categoria',
    // Apollo.io: Industry / Keywords
    'industry': 'categoria', 'keywords': 'categoria', 'sector': 'categoria',
    'cnpj': 'cnpj',
    // Web
    'website': 'website', 'site': 'website', 'url': 'website', 'web': 'website',
    'homepage': 'website', 'pagina': 'website', 'página': 'website',
    // Apollo.io: Website URL / Company Website
    'website url': 'website', 'company website': 'website', 'company domain': 'website',
    // Redes sociais
    'instagram': 'instagram', 'insta': 'instagram', 'ig': 'instagram',
    'linkedin': 'linkedin', 'linkedin url': 'linkedin', 'perfil linkedin': 'linkedin',
    // Apollo.io: Person LinkedIn URL / Company LinkedIn
    'person linkedin url': 'linkedin', 'company linkedin url': 'linkedin',
    'company linkedin': 'linkedin', 'linkedin profile': 'linkedin',
    // Observações
    'resumo': 'resumo_analitico', 'observacoes': 'resumo_analitico',
    'observações': 'resumo_analitico', 'descricao': 'resumo_analitico',
    'descrição': 'resumo_analitico', 'notes': 'resumo_analitico',
    'obs': 'resumo_analitico', 'about': 'resumo_analitico',
    // Apollo.io: Title (cargo) e SEO Description → resumo analítico
    'title': 'resumo_analitico', 'job title': 'resumo_analitico',
    'seo description': 'resumo_analitico', 'short description': 'resumo_analitico',
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

export { FIELD_DESCRIPTIONS as default, LEAD_FIELDS };
