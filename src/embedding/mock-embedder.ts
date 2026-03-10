import type { Embedder } from '../types.js';

/**
 * Deterministic mock embedder for tests and demo mode.
 * Generates consistent 384-dim vectors from text using a simple hash.
 * Semantically similar strings produce similar vectors (via shared word overlap).
 */
export class MockEmbedder implements Embedder {
  ready = true;

  async embed(text: string): Promise<number[]> {
    return mockEmbed(text);
  }
}

const EMBED_DIM = 384;

/**
 * Produce a deterministic pseudo-embedding.
 * Words are individually hashed into small vectors, then summed and normalized.
 * This means texts sharing words have higher cosine similarity.
 */
export function mockEmbed(text: string): number[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const vec = new Float64Array(EMBED_DIM);

  for (const word of words) {
    const wordVec = hashToVector(word);
    for (let i = 0; i < EMBED_DIM; i++) {
      vec[i] += wordVec[i];
    }
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);

  if (norm === 0) {
    // Fallback: return a unit vector
    const result = new Array(EMBED_DIM).fill(0);
    result[0] = 1;
    return result;
  }

  return Array.from(vec.map(v => v / norm));
}

/** Simple deterministic hash of a string to a vector. */
function hashToVector(str: string): number[] {
  const vec = new Array(EMBED_DIM).fill(0);
  let seed = 0;
  for (let i = 0; i < str.length; i++) {
    seed = ((seed << 5) - seed + str.charCodeAt(i)) | 0;
  }

  // Use seed to deterministically fill vector
  let state = Math.abs(seed) || 1;
  for (let i = 0; i < EMBED_DIM; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    vec[i] = (state / 0x7fffffff) * 2 - 1; // range [-1, 1]
  }

  return vec;
}
