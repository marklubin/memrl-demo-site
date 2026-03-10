import { describe, it, expect } from 'vitest';
import { MemoryBank, createMemoryEntry, updateTrustScore } from '../../src/core/memory-bank.js';

function makeEntry(intentText: string, trustScore = 0, id?: string) {
  const entry = createMemoryEntry(intentText, 'test experience', [0.1, 0.2], trustScore, 0);
  if (id) entry.id = id;
  return entry;
}

describe('MemoryBank', () => {
  it('starts empty', () => {
    const bank = new MemoryBank();
    expect(bank.size()).toBe(0);
    expect(bank.getAll()).toEqual([]);
  });

  it('adds and retrieves entries', () => {
    const bank = new MemoryBank();
    const entry = makeEntry('cook a meal');
    bank.add(entry);
    expect(bank.size()).toBe(1);
    expect(bank.getById(entry.id)).toBe(entry);
  });

  it('removes entries', () => {
    const bank = new MemoryBank();
    const entry = makeEntry('cook a meal');
    bank.add(entry);
    expect(bank.remove(entry.id)).toBe(true);
    expect(bank.size()).toBe(0);
    expect(bank.remove('nonexistent')).toBe(false);
  });

  it('clears all entries', () => {
    const bank = new MemoryBank();
    bank.add(makeEntry('a'));
    bank.add(makeEntry('b'));
    bank.clear();
    expect(bank.size()).toBe(0);
  });

  it('loads entries from array', () => {
    const bank = new MemoryBank();
    const entries = [makeEntry('a'), makeEntry('b')];
    bank.load(entries);
    expect(bank.size()).toBe(2);
  });

  it('serializes to JSON', () => {
    const bank = new MemoryBank();
    const entry = makeEntry('test');
    bank.add(entry);
    const json = bank.toJSON();
    expect(json).toHaveLength(1);
    expect(json[0].intentText).toBe('test');
  });
});

describe('updateTrustScore', () => {
  it('increases Q on positive reward', () => {
    const entry = makeEntry('test', 0.0);
    const update = updateTrustScore(entry, 1.0, 0.1, 1, 'task1');

    expect(update.predictionError).toBeCloseTo(1.0);  // 1.0 - 0.0
    expect(update.newScore).toBeCloseTo(0.1);          // 0.0 + 0.1 * 1.0
    expect(entry.trustScore).toBeCloseTo(0.1);
    expect(entry.timesUsed).toBe(1);
    expect(entry.timesSucceeded).toBe(1);
    expect(entry.history).toHaveLength(1);
  });

  it('decreases Q on negative reward', () => {
    const entry = makeEntry('test', 0.5);
    const update = updateTrustScore(entry, -1.0, 0.1, 1, 'task1');

    expect(update.predictionError).toBeCloseTo(-1.5);  // -1.0 - 0.5
    expect(update.newScore).toBeCloseTo(0.35);          // 0.5 + 0.1 * (-1.5)
    expect(entry.trustScore).toBeCloseTo(0.35);
    expect(entry.timesSucceeded).toBe(0);
  });

  it('converges toward true success rate', () => {
    const entry = makeEntry('test', 0.0);
    // Simulate 100 updates with 70% success rate
    for (let i = 0; i < 100; i++) {
      const reward = i % 10 < 7 ? 1.0 : -1.0; // 70% success
      updateTrustScore(entry, reward, 0.1, i, `task_${i}`);
    }
    // Q should be close to 0.7 * 1.0 + 0.3 * (-1.0) = 0.4
    expect(entry.trustScore).toBeCloseTo(0.4, 0);
  });

  it('with high learning rate, Q oscillates more', () => {
    const entryLow = makeEntry('test-low', 0.5);
    const entryHigh = makeEntry('test-high', 0.5);

    // Same sequence of rewards
    const rewards = [1, -1, 1, -1, 1, -1];
    const historyLow: number[] = [];
    const historyHigh: number[] = [];

    for (const r of rewards) {
      updateTrustScore(entryLow, r, 0.05, 0, 't');
      updateTrustScore(entryHigh, r, 0.5, 0, 't');
      historyLow.push(entryLow.trustScore);
      historyHigh.push(entryHigh.trustScore);
    }

    // High learning rate should have larger variance
    const varianceLow = variance(historyLow);
    const varianceHigh = variance(historyHigh);
    expect(varianceHigh).toBeGreaterThan(varianceLow);
  });

  it('preserves full audit trail', () => {
    const entry = makeEntry('test', 0.0);
    updateTrustScore(entry, 1.0, 0.1, 0, 'task_0');
    updateTrustScore(entry, -1.0, 0.1, 1, 'task_1');

    expect(entry.history).toHaveLength(2);
    expect(entry.history[0].epoch).toBe(0);
    expect(entry.history[0].reward).toBe(1.0);
    expect(entry.history[1].epoch).toBe(1);
    expect(entry.history[1].reward).toBe(-1.0);
  });
});

function variance(arr: number[]): number {
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}
