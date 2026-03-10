import { describe, it, expect } from 'vitest';
import { cosineSimilarity, zScoreNormalize } from '../../src/core/similarity.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical normalized vectors', () => {
    const v = [0.6, 0.8];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it('computes correct similarity for arbitrary vectors', () => {
    // dot product of [1,2,3] and [4,5,6] = 4+10+18 = 32
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(cosineSimilarity(a, b)).toBeCloseTo(32, 5);
  });

  it('throws on length mismatch', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('Vector length mismatch');
  });
});

describe('zScoreNormalize', () => {
  it('returns empty for empty input', () => {
    expect(zScoreNormalize([])).toEqual([]);
  });

  it('returns [0] for single element', () => {
    expect(zScoreNormalize([42])).toEqual([0]);
  });

  it('normalizes to mean=0 and std=1', () => {
    const result = zScoreNormalize([10, 20, 30]);
    const mean = result.reduce((s, v) => s + v, 0) / result.length;
    const variance = result.reduce((s, v) => s + (v - mean) ** 2, 0) / result.length;
    expect(mean).toBeCloseTo(0, 5);
    expect(Math.sqrt(variance)).toBeCloseTo(1, 5);
  });

  it('returns all zeros when values are equal', () => {
    expect(zScoreNormalize([5, 5, 5])).toEqual([0, 0, 0]);
  });

  it('preserves relative ordering', () => {
    const result = zScoreNormalize([1, 3, 2]);
    expect(result[0]).toBeLessThan(result[2]);
    expect(result[2]).toBeLessThan(result[1]);
  });
});
