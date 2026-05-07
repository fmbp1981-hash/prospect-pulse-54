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
