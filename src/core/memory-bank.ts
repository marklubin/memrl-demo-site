import type { MemoryEntry, TrustScoreUpdate } from '../types.js';

let idCounter = 0;

export function generateMemoryId(): string {
  return `mem_${Date.now()}_${idCounter++}`;
}

export function createMemoryEntry(
  intentText: string,
  experienceText: string,
  intentEmbedding: number[],
  initialTrustScore: number,
  epoch: number,
): MemoryEntry {
  return {
    id: generateMemoryId(),
    intentEmbedding,
    intentText,
    experienceText,
    trustScore: initialTrustScore,
    timesUsed: 0,
    timesSucceeded: 0,
    createdAtEpoch: epoch,
    lastUsedAtEpoch: epoch,
    history: [],
  };
}

/**
 * Q-value update (Eq. 8 from paper):
 *   prediction_error = reward - Q_old
 *   Q_new = Q_old + LearningRate(α) * prediction_error
 *
 * Returns the TrustScoreUpdate record for audit trail.
 */
export function updateTrustScore(
  entry: MemoryEntry,
  reward: number,
  learningRate: number,
  epoch: number,
  taskId: string,
): TrustScoreUpdate {
  const oldScore = entry.trustScore;
  const predictionError = reward - oldScore;
  const newScore = oldScore + learningRate * predictionError;

  const update: TrustScoreUpdate = {
    epoch,
    taskId,
    oldScore,
    newScore,
    reward,
    predictionError,
  };

  entry.trustScore = newScore;
  entry.timesUsed++;
  entry.lastUsedAtEpoch = epoch;
  if (reward > 0) entry.timesSucceeded++;
  entry.history.push(update);

  return update;
}

export class MemoryBank {
  private entries: MemoryEntry[] = [];

  constructor(initial?: MemoryEntry[]) {
    if (initial) this.entries = [...initial];
  }

  add(entry: MemoryEntry): void {
    this.entries.push(entry);
  }

  remove(id: string): boolean {
    const idx = this.entries.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    return true;
  }

  getAll(): MemoryEntry[] {
    return this.entries;
  }

  getById(id: string): MemoryEntry | undefined {
    return this.entries.find(e => e.id === id);
  }

  size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }

  /** Replace entire bank (used for hydration from storage) */
  load(entries: MemoryEntry[]): void {
    this.entries = [...entries];
  }

  /** Serialize for persistence */
  toJSON(): MemoryEntry[] {
    return this.entries;
  }
}
