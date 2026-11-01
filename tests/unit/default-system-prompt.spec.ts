import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SYSTEM_PROMPT,
  PROMPT_PLACEHOLDERS,
  renderSystemPrompt,
} from '@/lib/ai/prompts/default-system-prompt';

describe('renderSystemPrompt', () => {
  it('substitui o placeholder pelo nome da empresa', () => {
    const rendered = renderSystemPrompt(DEFAULT_SYSTEM_PROMPT, { companyName: 'Empresa Exemplo' });

    expect(rendered).toContain('Empresa que você representa: Empresa Exemplo.');
    expect(rendered).not.toContain(PROMPT_PLACEHOLDERS.companyName);
  });

  it.each([null, undefined, '', '   '])(
    'usa o texto de fallback quando o nome da empresa é %j',
    (companyName) => {
      const rendered = renderSystemPrompt(DEFAULT_SYSTEM_PROMPT, { companyName });

      expect(rendered).toContain('(nome não configurado');
      expect(rendered).not.toContain(PROMPT_PLACEHOLDERS.companyName);
    }
  );

  it('retorna inalterado um prompt personalizado sem placeholder', () => {
    const custom = 'Você é a assistente da Empresa Exemplo. Seja breve.';

    expect(renderSystemPrompt(custom, { companyName: 'Outra Empresa' })).toBe(custom);
  });
});
