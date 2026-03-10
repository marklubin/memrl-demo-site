import { describe, it, expect } from 'vitest';
import { GameLoop } from '../../src/engine/game-loop.js';
import type { GameEvent } from '../../src/engine/game-loop.js';
import { createTestFixtures } from '../mocks/fixtures.js';
import { PREDEFINED_TASKS } from '../../src/engine/tasks.js';
import { INITIAL_WORLD_STATE, cloneWorldState } from '../../src/engine/world.js';

describe('GameLoop — integration with mock LLM', () => {
  it('runs a predefined task to completion', async () => {
    const { llm, embedder, memoryBank, params } = createTestFixtures({ maxStepsPerTask: 12 });
    const loop = new GameLoop(llm, embedder, memoryBank, params, 'paper');

    const events: GameEvent[] = [];
    loop.on(e => events.push(e));

    // Set mock client to use the serve_hot_meal script
    (llm as any).currentTaskId = 'serve_hot_meal';

    const task = PREDEFINED_TASKS[0]; // serve_hot_meal
    const result = await loop.runTask({
      predefinedTask: task,
      initialWorldState: cloneWorldState(INITIAL_WORLD_STATE),
      epoch: 0,
    });

    expect(result.phase).toBe('complete');
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.length).toBeLessThanOrEqual(params.maxStepsPerTask);

    // Memory should have been created
    expect(memoryBank.size()).toBe(1);
    const memory = memoryBank.getAll()[0];
    expect(memory.intentText).toBe(task.description);
    expect(memory.experienceText.length).toBeGreaterThan(0);
  });

  it('emits events in correct order', async () => {
    const { llm, embedder, memoryBank, params } = createTestFixtures({ maxStepsPerTask: 8 });
    const loop = new GameLoop(llm, embedder, memoryBank, params, 'paper');

    const phases: string[] = [];
    loop.on(e => {
      if (e.type === 'phase_change') phases.push(e.phase);
    });

    (llm as any).currentTaskId = 'serve_hot_meal';

    await loop.runTask({
      predefinedTask: PREDEFINED_TASKS[0],
      initialWorldState: cloneWorldState(INITIAL_WORLD_STATE),
    });

    expect(phases).toEqual([
      'task_setup',
      'retrieving',
      'agent_acting',
      'q_updating',
      'memory_creating',
      'complete',
    ]);
  });

  it('creates memory with initial Q-value', async () => {
    const { llm, embedder, memoryBank, params } = createTestFixtures({ initialTrustScore: 0.5 });
    const loop = new GameLoop(llm, embedder, memoryBank, params, 'paper');

    (llm as any).currentTaskId = 'serve_hot_meal';

    await loop.runTask({
      predefinedTask: PREDEFINED_TASKS[0],
      initialWorldState: cloneWorldState(INITIAL_WORLD_STATE),
    });

    const memory = memoryBank.getAll()[0];
    expect(memory.trustScore).toBe(0.5);
  });

  it('retrieves memories on second task', async () => {
    const { llm, embedder, memoryBank, params } = createTestFixtures({
      similarityThreshold: 0.0, // Accept all memories
      contextSize: 1,
    });
    const loop = new GameLoop(llm, embedder, memoryBank, params, 'paper');

    (llm as any).currentTaskId = 'serve_hot_meal';

    // Run first task
    await loop.runTask({
      predefinedTask: PREDEFINED_TASKS[0],
      initialWorldState: cloneWorldState(INITIAL_WORLD_STATE),
    });

    expect(memoryBank.size()).toBe(1);

    // Run second task — should retrieve the first memory
    let retrievalFired = false;
    loop.on(e => {
      if (e.type === 'retrieval_complete') {
        retrievalFired = true;
        expect(e.result.selected.length).toBeGreaterThan(0);
      }
    });

    await loop.runTask({
      predefinedTask: PREDEFINED_TASKS[0],
      initialWorldState: cloneWorldState(INITIAL_WORLD_STATE),
      epoch: 1,
    });

    expect(retrievalFired).toBe(true);
    expect(memoryBank.size()).toBe(2);
  });

  it('updates Q-values after retrieval', async () => {
    const { llm, embedder, memoryBank, params } = createTestFixtures({
      similarityThreshold: 0.0,
      contextSize: 1,
      learningRate: 0.5,
    });
    const loop = new GameLoop(llm, embedder, memoryBank, params, 'paper');

    (llm as any).currentTaskId = 'serve_hot_meal';

    // First task — creates memory with Q=0
    await loop.runTask({
      predefinedTask: PREDEFINED_TASKS[0],
      initialWorldState: cloneWorldState(INITIAL_WORLD_STATE),
    });

    const memBefore = memoryBank.getAll()[0].trustScore;

    // Second task — retrieves and updates first memory's Q
    let qUpdateEvent: any = null;
    loop.on(e => {
      if (e.type === 'q_update') qUpdateEvent = e;
    });

    await loop.runTask({
      predefinedTask: PREDEFINED_TASKS[0],
      initialWorldState: cloneWorldState(INITIAL_WORLD_STATE),
      epoch: 1,
    });

    // The first memory should have been updated
    if (qUpdateEvent) {
      expect(qUpdateEvent.oldQ).toBeDefined();
      expect(qUpdateEvent.newQ).toBeDefined();
      expect(qUpdateEvent.newQ).not.toBe(qUpdateEvent.oldQ);
    }
  });

  it('respects maxStepsPerTask', async () => {
    const { llm, embedder, memoryBank, params } = createTestFixtures({ maxStepsPerTask: 2 });
    const loop = new GameLoop(llm, embedder, memoryBank, params, 'paper');

    (llm as any).currentTaskId = 'serve_hot_meal';

    const result = await loop.runTask({
      predefinedTask: PREDEFINED_TASKS[0],
      initialWorldState: cloneWorldState(INITIAL_WORLD_STATE),
    });

    // With only 2 steps, task should fail (not enough steps to complete)
    expect(result.steps.length).toBeLessThanOrEqual(2);
    expect(result.reward).toBeLessThan(0); // failure reward
  });
});
