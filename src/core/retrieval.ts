import type { MemoryEntry, CandidateResult, RetrievalResult, MemRLParams, SelectionMode } from '../types.js';
import { cosineSimilarity, zScoreNormalize } from './similarity.js';

/**
 * Phase A: Candidate Retrieval (Eq. 5)
 *
 * 1. Compute cosine similarity for each memory against task embedding
 * 2. Filter by SimilarityThreshold(δ)
 * 3. Sort by similarity descending
 * 4. Take top CandidatePoolSize(k₁)
 */
export function phaseA(
  taskEmbedding: number[],
  memories: MemoryEntry[],
  similarityThreshold: number,
  candidatePoolSize: number,
): CandidateResult[] {
  const scored: CandidateResult[] = memories.map(memory => ({
    memory,
    similarity: cosineSimilarity(taskEmbedding, memory.intentEmbedding),
  }));

  const aboveThreshold = scored.filter(c => c.similarity >= similarityThreshold);
  aboveThreshold.sort((a, b) => b.similarity - a.similarity);
  return aboveThreshold.slice(0, candidatePoolSize);
}

/**
 * Phase B: Value-Aware Selection — Paper Mode (Eq. 6)
 *
 * For each candidate:
 *   norm_sim = z_score(similarity across pool)
 *   norm_q   = z_score(Q-value across pool)
 *   score    = (1 - ExploitWeight(λ)) * norm_sim + ExploitWeight(λ) * norm_q
 *
 * Take top ContextSize(k₂) by blended score.
 */
export function phaseBPaper(
  candidates: CandidateResult[],
  exploitWeight: number,
  contextSize: number,
): CandidateResult[] {
  if (candidates.length === 0) return [];

  const sims = candidates.map(c => c.similarity);
  const qs = candidates.map(c => c.memory.trustScore);

  const normSims = zScoreNormalize(sims);
  const normQs = zScoreNormalize(qs);

  const ranked = candidates.map((c, i) => ({
    ...c,
    normalizedSimilarity: normSims[i],
    normalizedQ: normQs[i],
    blendedScore: (1 - exploitWeight) * normSims[i] + exploitWeight * normQs[i],
    selected: false,
  }));

  ranked.sort((a, b) => b.blendedScore! - a.blendedScore!);

  const selected = ranked.slice(0, contextSize);
  for (const s of selected) s.selected = true;

  return ranked;
}

/**
 * Phase B: Value-Aware Selection — Epsilon-Greedy Mode (Code Mode)
 *
 * With probability ExplorationRate(ε): random selection from candidates
 * Otherwise: sort by Q-value descending, tiebreak by similarity
 * Take top ContextSize(k₂).
 */
export function phaseBEpsilonGreedy(
  candidates: CandidateResult[],
  explorationRate: number,
  contextSize: number,
): CandidateResult[] {
  if (candidates.length === 0) return [];

  const ranked = candidates.map(c => ({ ...c, selected: false }));

  if (Math.random() < explorationRate) {
    // Random selection
    const shuffled = [...ranked].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, contextSize);
    for (const s of selected) s.selected = true;
    // Mark in original ranked array
    for (const r of ranked) {
      r.selected = selected.some(s => s.memory.id === r.memory.id);
    }
  } else {
    // Exploit: sort by Q, tiebreak by similarity
    ranked.sort((a, b) => {
      const qDiff = b.memory.trustScore - a.memory.trustScore;
      if (Math.abs(qDiff) > 1e-9) return qDiff;
      return b.similarity - a.similarity;
    });
    const selected = ranked.slice(0, contextSize);
    for (const s of selected) s.selected = true;
  }

  return ranked;
}

/**
 * Full retrieval pipeline: Phase A → Phase B → selected context.
 */
export function retrieve(
  taskEmbedding: number[],
  memories: MemoryEntry[],
  params: MemRLParams,
  mode: SelectionMode,
): RetrievalResult {
  const phaseACandidates = phaseA(
    taskEmbedding,
    memories,
    params.similarityThreshold,
    params.candidatePoolSize,
  );

  let phaseBRanked: CandidateResult[];
  if (mode === 'paper') {
    phaseBRanked = phaseBPaper(phaseACandidates, params.exploitWeight, params.contextSize);
  } else {
    phaseBRanked = phaseBEpsilonGreedy(phaseACandidates, params.explorationRate, params.contextSize);
  }

  const selected = phaseBRanked.filter(c => c.selected);

  return { phaseACandidates, phaseBRanked, selected };
}
