// api/_lib/chunker.ts

export interface Chunk {
  content: string;
  index: number;
}

/**
 * Splits text into overlapping chunks for RAG / AI context.
 * @param text       - source text
 * @param chunkSize  - target chars per chunk (default 1200)
 * @param overlap    - chars of overlap between chunks (default 100)
 */
export function splitTextIntoChunks(
  text: string,
  chunkSize = 1200,
  overlap = 100,
): Chunk[] {
  if (!text || typeof text !== "string") return [];

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end     = Math.min(start + chunkSize, text.length);
    const content = text.slice(start, end).trim();

    if (content.length > 0) {
      chunks.push({ content, index });
      index++;
    }

    start += chunkSize - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}
