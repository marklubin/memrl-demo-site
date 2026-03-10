import { describe, it, expect } from 'vitest';
import { phaseA, phaseBPaper, phaseBEpsilonGreedy, retrieve } from '../../src/core/retrieval.js';
import { createMemoryEntry } from '../../src/core/memory-bank.js';
import { DEFAULT_PARAMS } from '../../src/types.js';
import type { MemoryEntry, MemRLParams } from '../../src/types.js';

// Create memories with known embeddings for testing
function makeMemory(intentText: string, embedding: number[], trustScore: number): MemoryEntry {
  const entry = createMemoryEntry(intentText, 'exp', embedding, trustScore, 0);
  return entry;
}

// Simple 3D normalized vectors for testing
const TASK_VEC = normalize([1, 0, 0]);
const SIMILAR_VEC = normalize([0.9, 0.1, 0]);   // high similarity to task
const MEDIUM_VEC = normalize([0.5, 0.5, 0]);     // medium similarity
const LOW_VEC = normalize([0.1, 0.9, 0]);        // low similarity
const ORTHOGONAL_VEC = normalize([0, 1, 0]);      // orthogonal

function normalize(v: number[]): number[] {
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map(x => x / mag);
}

describe('phaseA — Candidate Retrieval', () => {
  const memories = [
    makeMemory('similar task', SIMILAR_VEC, 0.8),
    makeMemory('medium task', MEDIUM_VEC, 0.3),
    makeMemory('low task', LOW_VEC, -0.2),
    makeMemory('orthogonal task', ORTHOGONAL_VEC, 0.9),
  ];

  it('filters by similarity threshold', () => {
    const candidates = phaseA(TASK_VEC, memories, 0.6, 10);
    // Only SIMILAR_VEC should pass threshold of 0.6
    expect(candidates.length).toBe(2); // similar ≈ 0.99 and medium ≈ 0.71
    expect(candidates[0].memory.intentText).toBe('similar task');
  });

  it('respects candidate pool size', () => {
    const candidates = phaseA(TASK_VEC, memories, 0.0, 2);
    expect(candidates.length).toBe(2);
  });

  it('returns empty when nothing passes threshold', () => {
    const candidates = phaseA(TASK_VEC, memories, 0.999, 10);
    expect(candidates.length).toBe(0);
  });

  it('returns candidates sorted by similarity descending', () => {
    const candidates = phaseA(TASK_VEC, memories, 0.0, 10);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].similarity).toBeGreaterThanOrEqual(candidates[i].similarity);
    }
  });
});

describe('phaseBPaper — Value-Aware Selection', () => {
  it('returns empty for no candidates', () => {
    expect(phaseBPaper([], 0.5, 3)).toEqual([]);
  });

  it('with lambda=0, ranks purely by similarity', () => {
    const candidates = [
      { memory: makeMemory('high-sim', [1], 0.1), similarity: 0.9 },
      { memory: makeMemory('low-sim', [1], 0.9), similarity: 0.3 },
    ];
    const ranked = phaseBPaper(candidates, 0.0, 1);
    expect(ranked[0].memory.intentText).toBe('high-sim');
    expect(ranked[0].selected).toBe(true);
  });

  it('with lambda=1, ranks purely by Q-value', () => {
    const candidates = [
      { memory: makeMemory('low-q', [1], 0.1), similarity: 0.9 },
      { memory: makeMemory('high-q', [1], 0.9), similarity: 0.3 },
    ];
    const ranked = phaseBPaper(candidates, 1.0, 1);
    expect(ranked[0].memory.intentText).toBe('high-q');
    expect(ranked[0].selected).toBe(true);
  });

  it('selects top k2 by blended score', () => {
    const candidates = [
      { memory: makeMemory('a', [1], 0.5), similarity: 0.8 },
      { memory: makeMemory('b', [1], 0.3), similarity: 0.6 },
      { memory: makeMemory('c', [1], 0.9), similarity: 0.4 },
    ];
    const ranked = phaseBPaper(candidates, 0.5, 2);
    const selected = ranked.filter(c => c.selected);
    expect(selected.length).toBe(2);
  });

  it('computes blended scores correctly', () => {
    const candidates = [
      { memory: makeMemory('a', [1], 0.5), similarity: 0.8 },
      { memory: makeMemory('b', [1], 0.3), similarity: 0.6 },
    ];
    const ranked = phaseBPaper(candidates, 0.5, 2);
    for (const c of ranked) {
      expect(c.normalizedSimilarity).toBeDefined();
      expect(c.normalizedQ).toBeDefined();
      expect(c.blendedScore).toBeDefined();
    }
  });
});

describe('phaseBEpsilonGreedy', () => {
  it('with epsilon=0, always exploits (sorts by Q)', () => {
    const candidates = [
      { memory: makeMemory('low-q', [1], 0.1), similarity: 0.9 },
      { memory: makeMemory('high-q', [1], 0.9), similarity: 0.3 },
    ];
    // Run many times to verify determinism with epsilon=0
    for (let i = 0; i < 5; i++) {
      const ranked = phaseBEpsilonGreedy(candidates, 0, 1);
      const selected = ranked.filter(c => c.selected);
      expect(selected[0].memory.intentText).toBe('high-q');
    }
  });

  it('respects context size', () => {
    const candidates = [
      { memory: makeMemory('a', [1], 0.5), similarity: 0.8 },
      { memory: makeMemory('b', [1], 0.3), similarity: 0.6 },
      { memory: makeMemory('c', [1], 0.9), similarity: 0.4 },
    ];
    const ranked = phaseBEpsilonGreedy(candidates, 0, 2);
    const selected = ranked.filter(c => c.selected);
    expect(selected.length).toBe(2);
  });
});

describe('retrieve (full pipeline)', () => {
  it('returns empty results for empty memory bank', () => {
    const result = retrieve(TASK_VEC, [], DEFAULT_PARAMS, 'paper');
    expect(result.phaseACandidates).toEqual([]);
    expect(result.phaseBRanked).toEqual([]);
    expect(result.selected).toEqual([]);
  });

  it('runs full pipeline in paper mode', () => {
    const memories = [
      makeMemory('very similar', SIMILAR_VEC, 0.8),
      makeMemory('medium similar', MEDIUM_VEC, 0.5),
      makeMemory('orthogonal', ORTHOGONAL_VEC, 0.9),
    ];
    const params: MemRLParams = { ...DEFAULT_PARAMS, similarityThreshold: 0.5, contextSize: 1 };
    const result = retrieve(TASK_VEC, memories, params, 'paper');

    expect(result.phaseACandidates.length).toBeGreaterThan(0);
    expect(result.selected.length).toBe(1);
  });

  it('runs full pipeline in epsilon-greedy mode', () => {
    const memories = [
      makeMemory('a', SIMILAR_VEC, 0.2),
      makeMemory('b', MEDIUM_VEC, 0.8),
    ];
    const params: MemRLParams = { ...DEFAULT_PARAMS, similarityThreshold: 0.3, explorationRate: 0, contextSize: 1 };
    const result = retrieve(TASK_VEC, memories, params, 'epsilon_greedy');

    expect(result.selected.length).toBe(1);
    // With epsilon=0, should pick highest Q
    expect(result.selected[0].memory.intentText).toBe('b');
  });
});
