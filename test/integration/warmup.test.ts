import { describe, it, expect } from 'vitest';
import { runWarmup, importManualSeed } from '../../src/warmup/warmup.js';
import { createTestFixtures } from '../mocks/fixtures.js';
import type { WarmupProgress } from '../../src/types.js';

describe('Warmup System', () => {
  it('populates memory bank with synthetic strategy', async () => {
    const { llm, embedder, memoryBank, params } = createTestFixtures();

    const progressUpdates: WarmupProgress[] = [];

    await runWarmup(
      { taskCount: 3, epochs: 1, strategy: 'synthetic' },
      llm,
      embedder,
      memoryBank,
      params,
      (p) => progressUpdates.push(p),
    );

    expect(memoryBank.size()).toBe(3);
    expect(progressUpdates.length).toBe(3);
    expect(progressUpdates[2].memoriesCreated).toBe(3);
    expect(progressUpdates[2].currentTask).toBe(3);
  });

  it('runs multiple epochs and updates Q-values', async () => {
    const { llm, embedder, memoryBank, params } = createTestFixtures({
      similarityThreshold: 0.0,
      contextSize: 2,
    });

    await runWarmup(
      { taskCount: 3, epochs: 2, strategy: 'synthetic' },
      llm,
      embedder,
      memoryBank,
      params,
    );

    // 3 tasks × 2 epochs = 6 memories
    expect(memoryBank.size()).toBe(6);

    // Some memories should have been retrieved and updated in epoch 2
    const memoriesWithHistory = memoryBank.getAll().filter(m => m.history.length > 0);
    expect(memoriesWithHistory.length).toBeGreaterThan(0);
  });

  it('reports progress correctly', async () => {
    const { llm, embedder, memoryBank, params } = createTestFixtures();

    let lastProgress: WarmupProgress | null = null;

    await runWarmup(
      { taskCount: 5, epochs: 1, strategy: 'synthetic' },
      llm,
      embedder,
      memoryBank,
      params,
      (p) => { lastProgress = p; },
    );

    expect(lastProgress).not.toBeNull();
    expect(lastProgress!.totalTasks).toBe(5);
    expect(lastProgress!.currentTask).toBe(5);
    expect(lastProgress!.successCount + lastProgress!.failureCount).toBe(5);
  });
});

describe('Manual Seed Import', () => {
  it('imports entries with computed embeddings', async () => {
    const { embedder, memoryBank } = createTestFixtures();

    await importManualSeed(
      [
        { intentText: 'cook a meal', experienceText: 'Go to kitchen, take ingredients, use stove.', trustScore: 0.6 },
        { intentText: 'find the key', experienceText: 'Check the desk upstairs.', trustScore: 0.8 },
      ],
      embedder,
      memoryBank,
    );

    expect(memoryBank.size()).toBe(2);
    const entries = memoryBank.getAll();
    expect(entries[0].intentEmbedding.length).toBe(384);
    expect(entries[0].trustScore).toBe(0.6);
    expect(entries[1].trustScore).toBe(0.8);
  });
});
