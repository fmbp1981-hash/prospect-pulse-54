import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, KEY_PREFIX } from '../../src/lib/webhook-keys';

describe('generateApiKey', () => {
  it('retorna string com prefixo lpk_', () => {
    const key = generateApiKey();
    expect(key.startsWith(KEY_PREFIX)).toBe(true);
  });

  it('tem 68 caracteres no total (4 prefix + _ + 63 hex)', () => {
    const key = generateApiKey();
    expect(key).toHaveLength(68);
  });

  it('cada chamada gera chave única', () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });
});

describe('hashApiKey', () => {
  it('retorna string hex de 64 chars (SHA-256)', () => {
    const hash = hashApiKey('lpk_abc123');
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });

  it('mesma chave sempre gera mesmo hash', () => {
    const key = 'lpk_test_key_value';
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it('chaves diferentes geram hashes diferentes', () => {
    expect(hashApiKey('lpk_aaa')).not.toBe(hashApiKey('lpk_bbb'));
  });
});
