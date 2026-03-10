/**
 * Cosine similarity for normalized vectors (= dot product).
 * Vectors from MiniLM are already L2-normalized.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Z-score normalize an array of values.
 * Returns 0 for all if stddev is 0 (all values equal).
 */
export function zScoreNormalize(values: number[]): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [0];

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);

  if (std === 0) return values.map(() => 0);
  return values.map(v => (v - mean) / std);
}
