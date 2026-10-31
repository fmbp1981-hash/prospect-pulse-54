/**
 * Chunking de documentos do RAG.
 */

export const CHUNK_SIZE = 1000;    // caracteres por chunk
export const CHUNK_OVERLAP = 200;  // sobreposição entre chunks

/** Intervalos [início, fim) de cada chunk sobre o texto original. */
export function chunkRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    let chunkEnd = end;

    // Tenta quebrar em fronteira de parágrafo ou frase
    if (end < text.length) {
      const chunk = text.slice(start, end);
      const lastParagraph = chunk.lastIndexOf('\n\n');
      const lastSentence = Math.max(
        chunk.lastIndexOf('. '),
        chunk.lastIndexOf('! '),
        chunk.lastIndexOf('? ')
      );

      const breakPoint = lastParagraph > CHUNK_SIZE * 0.5
        ? lastParagraph
        : lastSentence > CHUNK_SIZE * 0.5
          ? lastSentence + 1
          : -1;

      if (breakPoint > 0) {
        chunkEnd = start + breakPoint + 1;
      }
    }

    ranges.push([start, chunkEnd]);
    // Último pedaço: encerra. Sem isso, com até CHUNK_OVERLAP caracteres
    // restantes o início não avançava (start += 0) e o laço nunca terminava.
    if (chunkEnd >= text.length) break;
    // Chunks intermediários têm > CHUNK_SIZE/2 caracteres, então sempre avança.
    start = chunkEnd - CHUNK_OVERLAP;
  }

  return ranges;
}

export function chunkText(text: string): string[] {
  return chunkRanges(text)
    .map(([s, e]) => text.slice(s, e).trim())
    .filter((c) => c.length > 50);
}
