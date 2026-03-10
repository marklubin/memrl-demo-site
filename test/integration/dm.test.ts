import { describe, it, expect } from 'vitest';
import { DungeonMaster, parseAction, formatAction } from '../../src/engine/dm.js';
import { MockLLMClient } from '../../src/llm/mock-client.js';
import type { AgentAction } from '../../src/types.js';

describe('parseAction', () => {
  it('parses single-argument actions', () => {
    expect(parseAction('go_to(kitchen)')).toEqual({ type: 'go_to', target: 'kitchen', secondTarget: undefined });
    expect(parseAction('take(ingredients)')).toEqual({ type: 'take', target: 'ingredients', secondTarget: undefined });
    expect(parseAction('examine(desk)')).toEqual({ type: 'examine', target: 'desk', secondTarget: undefined });
    expect(parseAction('use(stove)')).toEqual({ type: 'use', target: 'stove', secondTarget: undefined });
  });

  it('parses two-argument actions', () => {
    expect(parseAction('combine(herbs, water)')).toEqual({ type: 'combine', target: 'herbs', secondTarget: 'water' });
    expect(parseAction('give(meal, patron)')).toEqual({ type: 'give', target: 'meal', secondTarget: 'patron' });
  });

  it('returns null for invalid actions', () => {
    expect(parseAction('invalid_action(x)')).toBeNull();
    expect(parseAction('no parens here')).toBeNull();
    expect(parseAction('')).toBeNull();
  });
});

describe('formatAction', () => {
  it('formats single-argument actions', () => {
    expect(formatAction({ type: 'go_to', target: 'kitchen' })).toBe('go_to(kitchen)');
  });

  it('formats two-argument actions', () => {
    expect(formatAction({ type: 'give', target: 'meal', secondTarget: 'patron' })).toBe('give(meal, patron)');
  });
});

describe('DungeonMaster with MockLLMClient', () => {
  it('generates a task', async () => {
    const llm = new MockLLMClient();
    const dm = new DungeonMaster(llm);

    const result = await dm.generateTask('serve a meal');
    expect(result.task.description).toBeTruthy();
    expect(result.task.solutionSteps.length).toBeGreaterThan(0);
    expect(result.task.successConditions.length).toBeGreaterThan(0);
    expect(result.task.worldAxioms.length).toBeGreaterThan(0);
    expect(result.initialWorldState).toBeTruthy();
  });

  it('maintains scratch buffer across ticks', async () => {
    const llm = new MockLLMClient();
    const dm = new DungeonMaster(llm);

    await dm.generateTask();
    expect(dm.getScratchBuffer().length).toBeGreaterThan(0);

    const action: AgentAction = { type: 'go_to', target: 'kitchen' };
    const response = await dm.tick(action, (await dm.generateTask()).initialWorldState);

    // Scratch buffer should have grown
    expect(dm.getScratchBuffer().length).toBeGreaterThanOrEqual(1);
    expect(response.narrative).toBeTruthy();
    expect(response.worldState).toBeTruthy();
    expect(['continue', 'success', 'failure']).toContain(response.status);
  });

  it('resets state', async () => {
    const llm = new MockLLMClient();
    const dm = new DungeonMaster(llm);

    await dm.generateTask();
    dm.reset();
    expect(dm.getScratchBuffer()).toEqual([]);
    expect(dm.getCurrentTask()).toBeNull();
  });
});
