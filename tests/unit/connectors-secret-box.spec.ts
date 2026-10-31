/**
 * Cofre de segredos dos conectores (AES-256-GCM via Web Crypto).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  encryptJson,
  decryptJson,
  MasterKeyMissingError,
  type EncryptedSecret,
} from '@/lib/connectors/crypto/secret-box';

function keyB64(fill: number, size = 32): string {
  return btoa(String.fromCharCode(...new Uint8Array(size).fill(fill)));
}

const ENV_NAMES = ['CONNECTORS_MASTER_KEY_V1', 'CONNECTORS_MASTER_KEY_V2', 'CONNECTORS_ACTIVE_KEY_VERSION'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const n of ENV_NAMES) saved[n] = process.env[n];
  process.env.CONNECTORS_MASTER_KEY_V1 = keyB64(1);
  delete process.env.CONNECTORS_MASTER_KEY_V2;
  process.env.CONNECTORS_ACTIVE_KEY_VERSION = 'v1';
});

afterEach(() => {
  for (const n of ENV_NAMES) {
    if (saved[n] === undefined) delete process.env[n];
    else process.env[n] = saved[n];
  }
});

describe('secret-box', () => {
  it('roundtrip devolve o texto original', async () => {
    const enc = await encryptSecret('segredo-ç-ã-😀');
    expect(enc.v).toBe('v1');
    expect(await decryptSecret(enc)).toBe('segredo-ç-ã-😀');
  });

  it('roundtrip de JSON devolve o objeto original', async () => {
    const value = { apiKey: 'abc', n: 3 };
    expect(await decryptJson<typeof value>(await encryptJson(value))).toEqual(value);
  });

  it('duas cifras do mesmo texto têm iv e ct diferentes', async () => {
    const a = await encryptSecret('mesmo');
    const b = await encryptSecret('mesmo');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('ct adulterado lança erro', async () => {
    const enc = await encryptSecret('intacto');
    const bytes = Uint8Array.from(atob(enc.ct), (c) => c.charCodeAt(0));
    bytes[0] ^= 0xff;
    const tampered: EncryptedSecret = { ...enc, ct: btoa(String.fromCharCode(...bytes)) };
    await expect(decryptSecret(tampered)).rejects.toThrow();
  });

  it('sem CONNECTORS_MASTER_KEY_V1 lança MasterKeyMissingError', async () => {
    delete process.env.CONNECTORS_MASTER_KEY_V1;
    await expect(encryptSecret('x')).rejects.toBeInstanceOf(MasterKeyMissingError);
  });

  it('segredo v1 decifra com ativa=v2 desde que V1 exista', async () => {
    const old = await encryptSecret('antigo');
    process.env.CONNECTORS_MASTER_KEY_V2 = keyB64(2);
    process.env.CONNECTORS_ACTIVE_KEY_VERSION = 'v2';
    expect(await decryptSecret(old)).toBe('antigo');
    expect((await encryptSecret('novo')).v).toBe('v2');
  });

  it('segredo v1 não decifra se V1 foi removida', async () => {
    const old = await encryptSecret('antigo');
    process.env.CONNECTORS_MASTER_KEY_V2 = keyB64(2);
    process.env.CONNECTORS_ACTIVE_KEY_VERSION = 'v2';
    delete process.env.CONNECTORS_MASTER_KEY_V1;
    await expect(decryptSecret(old)).rejects.toBeInstanceOf(MasterKeyMissingError);
  });

  it('chave com tamanho != 32 bytes lança erro', async () => {
    process.env.CONNECTORS_MASTER_KEY_V1 = keyB64(1, 16);
    await expect(encryptSecret('x')).rejects.toThrow(/32 bytes/);
  });
});
