/**
 * Normaliza número de telefone brasileiro para o formato +55XXXXXXXXXXX.
 * Aceita qualquer variação: (11) 99999-9999, 011999999999, +5511999999999, etc.
 * Retorna null se não for possível extrair um número válido.
 */
export function normalizeBRPhone(raw: string): string | null {
  if (!raw) return null;

  // Remove tudo que não for dígito ou "+"
  let digits = raw.replace(/[^\d+]/g, '');

  // Remove o "+" inicial se houver
  if (digits.startsWith('+')) digits = digits.slice(1);

  // Já tem código do país 55
  if (digits.startsWith('55')) {
    const rest = digits.slice(2);
    // DDD (2 dígitos) + número (8 ou 9 dígitos) = 10 ou 11 dígitos
    if (rest.length >= 10 && rest.length <= 11) {
      return `+55${rest}`;
    }
  }

  // Sem código do país — tenta com DDD
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  // Remove zero à esquerda (ex: 011999999999 → 11999999999)
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    const withoutZero = digits.slice(1);
    if (withoutZero.length === 10 || withoutZero.length === 11) {
      return `+55${withoutZero}`;
    }
  }

  return null;
}
