import type { LLMClient, AgentDecision, AgentAction, WorldState, TaskContract, CandidateResult } from '../types.js';
import { parseAction } from './dm.js';

const AGENT_SYSTEM = `You are an adventurer completing tasks in a fantasy tavern. You have these tools:

- go_to(location) — move to a location (main_hall, kitchen, cellar, courtyard, upstairs_room, shop_front)
- examine(object) — inspect something closely
- take(object) — pick up an object
- use(object) — use an object or apply it
- combine(object1, object2) — combine two items
- give(object, target) — give or place an item

Respond with your thinking, then your action.

Format:
Thinking: [your reasoning about what to do next]
Action: [exactly one tool call, e.g. go_to(kitchen)]

You may have archived memories from similar past tasks. Use them as guidance but adapt to the current situation. Choose exactly ONE action per turn.`;

export class Agent {
  constructor(private llm: LLMClient) {}

  async decideAction(
    task: TaskContract,
    worldState: WorldState,
    memories: CandidateResult[],
    previousSteps: string[],
  ): Promise<AgentDecision> {
    const userPrompt = buildAgentPrompt(task, worldState, memories, previousSteps);

    const response = await this.llm.chat(
      [
        { role: 'system', content: AGENT_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0, maxTokens: 500 },
    );

    const rawOutput = response.content;
    const action = extractAction(rawOutput);

    const thinkingMatch = rawOutput.match(/Thinking:\s*([\s\S]*?)(?=\nAction:|$)/i);
    const thinking = thinkingMatch?.[1]?.trim() ?? '';

    return { thinking, action, rawOutput };
  }
}

function buildAgentPrompt(
  task: TaskContract,
  worldState: WorldState,
  memories: CandidateResult[],
  previousSteps: string[],
): string {
  const parts: string[] = [];

  parts.push(`## Current Task\n${task.description}`);

  if (memories.length > 0) {
    parts.push('## Relevant Memories from Past Tasks');
    for (const m of memories) {
      parts.push(`- [Q=${m.memory.trustScore.toFixed(2)}, similarity=${m.similarity.toFixed(2)}] Task: "${m.memory.intentText}"\n  Strategy: ${m.memory.experienceText}`);
    }
  }

  const loc = worldState.locations[worldState.agentLocation];
  parts.push(`## Current Location: ${loc.name} (${worldState.agentLocation})`);
  parts.push(loc.description);

  const objects = Object.entries(loc.objects);
  if (objects.length > 0) {
    parts.push('## Objects Here');
    for (const [id, obj] of objects) {
      const stateStr = Object.entries(obj.states).map(([k, v]) => `${k}=${v}`).join(', ');
      parts.push(`- ${obj.name} (${id})${stateStr ? ` [${stateStr}]` : ''}${obj.takeable ? ' [can take]' : ''}`);
    }
  }

  if (worldState.agentInventory.length > 0) {
    parts.push(`## Inventory: ${worldState.agentInventory.join(', ')}`);
  } else {
    parts.push('## Inventory: (empty)');
  }

  if (previousSteps.length > 0) {
    parts.push(`## Previous Actions This Task\n${previousSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
  }

  parts.push('\nWhat do you do next?');

  return parts.join('\n\n');
}

function extractAction(rawOutput: string): AgentAction {
  // Try to find "Action: ..." line
  const actionMatch = rawOutput.match(/Action:\s*(.+)/i);
  if (actionMatch) {
    const parsed = parseAction(actionMatch[1].trim());
    if (parsed) return parsed;
  }

  // Fallback: find any tool call pattern in the output
  const toolMatch = rawOutput.match(/\b(go_to|examine|take|use|combine|give)\([^)]+\)/);
  if (toolMatch) {
    const parsed = parseAction(toolMatch[0]);
    if (parsed) return parsed;
  }

  // Last resort: examine surroundings
  return { type: 'examine', target: 'surroundings' };
}

/**
 * Build the full prompt string that would be sent to the agent.
 * Used for the "Injected Context Preview" in the UI.
 */
export function buildAgentPromptPreview(
  task: TaskContract,
  worldState: WorldState,
  memories: CandidateResult[],
  previousSteps: string[],
): string {
  const system = AGENT_SYSTEM;
  const user = buildAgentPrompt(task, worldState, memories, previousSteps);
  return `[SYSTEM]\n${system}\n\n[USER]\n${user}`;
}
