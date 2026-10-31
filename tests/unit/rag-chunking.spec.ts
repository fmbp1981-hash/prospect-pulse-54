/**
 * chunkText (RAG): o laço não avançava no fim do texto (start += 0 quando
 * sobravam até 200 caracteres) → loop infinito/OOM em toda ingestão.
 * Os testes rodam o chunker em um processo filho com timeout, para que a
 * versão com defeito falhe por tempo em vez de travar o vitest.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const CHUNK_SIZE = 1000;
const OVERLAP = 200;

type Range = [number, number];

function runRanges(text: string): { ranges: Range[] | null; timedOut: boolean } {
  const script = `
    import { chunkRanges } from './src/lib/ai/rag/chunking';
    const text = process.env.TEXTO ?? '';
    process.stdout.write(JSON.stringify(chunkRanges(text)));
  `;
  const r = spawnSync('npx', ['tsx', '-e', script], {
    cwd: ROOT,
    env: { ...process.env, TEXTO: text },
    encoding: 'utf8',
    timeout: 15000,
  });
  if (r.error || r.signal) return { ranges: null, timedOut: true };
  return { ranges: JSON.parse(r.stdout) as Range[], timedOut: false };
}

function makeText(n: number): string {
  const base = 'Frase de exemplo para a base de conhecimento. Outra frase aqui! E mais uma? ';
  return base.repeat(Math.ceil(n / base.length) + 1).slice(0, n);
}

describe('chunkRanges', () => {
  it.each([0, 1, 199, 200, 201, 5000])('texto de %i caracteres: termina, cobre o texto e respeita o overlap', (n) => {
    const text = makeText(n);
    const { ranges, timedOut } = runRanges(text);
    expect(timedOut).toBe(false);
    const rs = ranges as Range[];

    if (n === 0) {
      expect(rs).toEqual([]);
      return;
    }
    // cobre o texto do início ao fim, sem buracos
    expect(rs[0][0]).toBe(0);
    expect(rs[rs.length - 1][1]).toBe(n);
    for (let i = 1; i < rs.length; i++) {
      const [prevStart, prevEnd] = rs[i - 1];
      const [start, end] = rs[i];
      expect(start).toBeLessThan(prevEnd); // sem buraco
      expect(prevEnd - start).toBe(OVERLAP); // overlap exato
      expect(start).toBeGreaterThan(prevStart); // sempre avança
      expect(end - start).toBeLessThanOrEqual(CHUNK_SIZE);
    }
  }, 30000);
});
