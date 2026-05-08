import type { NormalizedLead, RawMappedLead } from './types';

type PhoneResult = { value: string | null; warning: string | null; error: null };
type TextFieldResult = { value: string | null; error: string | null };

const LOWERCASE_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'com', 'para', 'a', 'o', 'as', 'os']);

export function normalizeText(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\xC0-\xFF]/g, '')
    .split(' ')
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** Normaliza telefone brasileiro — nunca retorna erro, apenas warnings. Lead sempre passa. */
export function normalizePhone(raw: string): PhoneResult {
  if (!raw || !raw.trim()) return { value: null, warning: null, error: null };

  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);

  // Strip country code 55 if present
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  // Strip leading zero
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  // 0800 — não é WhatsApp, ignora silenciosamente
  if (digits.startsWith('800') || digits.startsWith('0800')) {
    return { value: null, warning: 'Número 0800 ignorado (não é WhatsApp)', error: null };
  }

  if (digits.length === 11) return { value: `+55${digits}`, warning: null, error: null };
  if (digits.length === 10) {
    return { value: `+55${digits}`, warning: 'Número fixo: verifique se é WhatsApp', error: null };
  }

  // Número fora do padrão — armazena null com aviso, não bloqueia o lead
  return { value: null, warning: `Número fora do padrão BR (${digits.length} dígitos)`, error: null };
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
  const match = handle.match(/instagram\.com\/([^/?#]+)/i);
  if (match) handle = match[1];
  handle = handle.replace(/^@/, '');
  if (!handle) return null;
  return `@${handle}`;
}

export function normalizeLinkedin(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().includes('linkedin')) return null;
  return trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
}

/** Normaliza uma linha mapeada — premissa B2B: empresa obrigatória, contato é a pessoa física */
export function normalizeLeadRow(raw: RawMappedLead): NormalizedLead {
  const warnings: NormalizedLead['warnings'] = {};
  const errors: NormalizedLead['errors'] = {};

  // Telefones: apenas warnings, nunca bloqueiam o lead
  const phone = normalizePhone(raw.whatsapp ?? '');
  if (phone.warning) warnings.whatsapp = phone.warning;

  const tel = normalizePhone(raw.telefone ?? '');
  if (tel.warning && raw.telefone) warnings.telefone = tel.warning;

  // Email: warning se inválido
  const email = normalizeEmail(raw.email ?? '');
  if (email.error) warnings.email = email.error;

  // CNPJ: warning se inválido (não bloqueia)
  const cnpj = normalizeCnpj(raw.cnpj ?? '');
  if (cnpj.error && raw.cnpj) warnings.cnpj = cnpj.error;

  const empresaNormalized = normalizeText(raw.empresa ?? '');
  if (!empresaNormalized) {
    errors.empresa = 'Nome da empresa é obrigatório';
  }

  return {
    empresa: empresaNormalized,
    contato: raw.contato ? normalizeText(raw.contato) : null,
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
