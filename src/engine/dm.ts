import type {
  LLMClient, WorldState, TaskContract, DMTaskGeneration,
  DMTickResponse, ScratchEntry, AgentAction, LocationId,
} from '../types.js';
import { INITIAL_WORLD_STATE, cloneWorldState, LOCATION_IDS } from './world.js';

/** Strip markdown code fences and extract the JSON object from an LLM response. */
function extractJSON(raw: string): string {
  // Try to find ```json ... ``` or ``` ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // Try to find first { ... } block
  const braceStart = raw.indexOf('{');
  const braceEnd = raw.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    return raw.slice(braceStart, braceEnd + 1);
  }
  return raw;
}

/** Attempt JSON.parse with light repair for common LLM mistakes. */
function safeParseJSON(raw: string): any {
  const json = extractJSON(raw);
  try {
    return JSON.parse(json);
  } catch {
    // Try common fixes: trailing commas, unescaped newlines in strings
    let fixed = json
      .replace(/,\s*([\]}])/g, '$1')                // trailing commas
      .replace(/([^\\])\\n/g, '$1\\\\n')             // unescaped \n in strings
      .replace(/\n\s*\n/g, '\n');                    // blank lines inside JSON
    try {
      return JSON.parse(fixed);
    } catch (e2) {
      throw new Error(`Failed to parse LLM JSON response: ${(e2 as Error).message}\n\nRaw (first 500 chars):\n${raw.slice(0, 500)}`);
    }
  }
}

const WORLD_DESCRIPTION = `## Locations
- main_hall: A warm tavern hall with a fireplace, wooden tables, and a few patrons.
- kitchen: A busy kitchen with a stove, sink, shelves of ingredients, and cooking tools.
- cellar: A dim cellar with barrels of ale, wine crates, a locked wooden chest, and shelves.
- courtyard: An open courtyard with a stone well, herb garden, and a horse post.
- upstairs_room: A guest room with a bed, wardrobe, desk, and a window overlooking the courtyard.
- shop_front: The tavern's front counter with a display case, coin box, and ledger.

## Available Agent Actions
- go_to(location) — move to a location
- examine(object) — inspect something closely
- take(object) — pick up an object
- use(object) — use an object or apply it
- combine(object1, object2) — combine two items
- give(object, target) — give or place an item`;

const TASK_GEN_SYSTEM = `You are the Dungeon Master for a fantasy tavern text adventure.

${WORLD_DESCRIPTION}

## Rules
- Tasks should require 4-6 steps to complete.
- Tasks must be achievable using only the available agent actions.
- Tasks should involve moving between locations, interacting with objects, and possibly combining items.
- Each task needs clear, unambiguous success conditions.
- Define world axioms: the rules of cause-and-effect that govern this task.
- Also provide initial scratch notes with your assessment of likely agent behavior.

## Response Format (strict JSON)
{
  "task": {
    "id": "unique_task_id",
    "description": "Human-readable task description",
    "solutionSteps": ["go_to(kitchen)", "take(ingredients)", ...],
    "successConditions": ["patron has cooked_meal"],
    "worldAxioms": ["ingredients are in the kitchen", ...]
  },
  "initialWorldState": <full world state JSON>,
  "initialScratchNotes": "Your initial assessment and what to watch for."
}`;

function buildTickSystem(task: TaskContract, worldState: WorldState, scratchBuffer: ScratchEntry[]): string {
  const scratchText = scratchBuffer.length > 0
    ? scratchBuffer.map(s => `[${s.index}] ${s.text}`).join('\n')
    : '(empty)';

  return `You are the Dungeon Master. Process the agent's action.

## Your Task Contract (LOCKED — do not change these rules)
Description: ${task.description}
Required steps: ${task.solutionSteps.join(' → ')}
Success conditions: ${task.successConditions.join('; ')}
World axioms:
${task.worldAxioms.map(a => `- ${a}`).join('\n')}

## Current World State
Agent location: ${worldState.agentLocation}
Inventory: ${worldState.agentInventory.length > 0 ? worldState.agentInventory.join(', ') : '(empty)'}
NPC inventory: ${Object.entries(worldState.npcInventory).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join('; ') || '(none)'}
Global flags: ${Object.entries(worldState.globalFlags).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}

Objects at ${worldState.agentLocation}:
${Object.entries(worldState.locations[worldState.agentLocation].objects).map(([id, o]) => {
    const st = Object.entries(o.states).map(([k, v]) => `${k}=${v}`).join(', ');
    return `- ${id}: ${o.name}${st ? ` [${st}]` : ''}${o.takeable ? ' [takeable]' : ''}`;
  }).join('\n')}

## Your Scratch Notes (your private memory — update these)
${scratchText}

## Instructions
Process this in two passes:

PASS 1 — INTERNAL (update your understanding):
- How does this action interact with the current world state?
- Does this advance or hinder the task?
- Are any axioms relevant? Apply them faithfully.
- Update your scratch notes with observations.

PASS 2 — RESPONSE:
- Generate a brief narrative (2-3 sentences) of what happens.
- Describe ONLY what changed in the world (do NOT echo the full world state).
- Determine status: "continue" | "success" | "failure"
- Return "success" ONLY when ALL success conditions are satisfied.
- Return "failure" ONLY if the task has become impossible.
- Be consistent: same action in same state = same result.

Return strict JSON:
{
  "narrative": "What happens...",
  "changes": {
    "agentLocation": "new_location_id (only if moved, otherwise omit)",
    "addToInventory": ["item1"],
    "removeFromInventory": ["item1"],
    "objectStateChanges": { "location_id.object_id.property": "new_value" },
    "addNpcInventory": { "npc_name": ["item"] },
    "setGlobalFlags": { "flag_name": true }
  },
  "status": "continue",
  "scratchUpdate": "append: observation text"
}

Only include fields in "changes" that actually changed. Omit unchanged fields.

scratchUpdate format (can chain with newlines):
- "append: <text>" adds a new note
- "edit[N]: <text>" replaces note at index N
- "delete[N]" removes note at index N`;
}

export class DungeonMaster {
  private scratchBuffer: ScratchEntry[] = [];
  private currentTask: TaskContract | null = null;

  constructor(private llm: LLMClient) {}

  getScratchBuffer(): ScratchEntry[] {
    return [...this.scratchBuffer];
  }

  getCurrentTask(): TaskContract | null {
    return this.currentTask;
  }

  async generateTask(suggestion?: string): Promise<DMTaskGeneration> {
    const userMsg = suggestion
      ? `Generate a task for the adventurer. The user suggests: "${suggestion}". Adapt this into a proper task with full contract.`
      : 'Generate a new task for the adventurer. Make it interesting and require 4-6 steps.';

    const response = await this.llm.chat(
      [
        { role: 'system', content: TASK_GEN_SYSTEM },
        { role: 'user', content: userMsg },
      ],
      { temperature: 0, maxTokens: 2000 },
    );

    const parsed = safeParseJSON(response.content) as DMTaskGeneration;

    this.currentTask = parsed.task;
    this.scratchBuffer = [{
      index: 0,
      text: parsed.initialScratchNotes,
    }];

    // Ensure world state has initial state if not provided
    if (!parsed.initialWorldState) {
      parsed.initialWorldState = cloneWorldState(INITIAL_WORLD_STATE);
    }

    return parsed;
  }

  async tick(action: AgentAction, worldState: WorldState): Promise<DMTickResponse> {
    if (!this.currentTask) {
      throw new Error('No active task. Call generateTask() first.');
    }

    const actionStr = formatAction(action);
    const systemPrompt = buildTickSystem(this.currentTask, worldState, this.scratchBuffer);

    const response = await this.llm.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Agent's Action: ${actionStr}` },
      ],
      { temperature: 0, maxTokens: 1000 },
    );

    const parsed = safeParseJSON(response.content);

    // Apply delta changes to produce the new world state
    const newWorldState = applyChanges(worldState, parsed.changes ?? {});

    // Apply scratch updates
    this.applyScratchUpdate(parsed.scratchUpdate);

    return {
      narrative: parsed.narrative ?? '',
      worldState: newWorldState,
      status: parsed.status ?? 'continue',
      scratchUpdate: parsed.scratchUpdate ?? '',
    };
  }

  private applyScratchUpdate(update: string): void {
    if (!update) return;

    const lines = update.split('\n').filter(Boolean);
    for (const line of lines) {
      const trimmed = line.trim();

      const appendMatch = trimmed.match(/^append:\s*(.+)$/i);
      if (appendMatch) {
        const newIndex = this.scratchBuffer.length > 0
          ? Math.max(...this.scratchBuffer.map(s => s.index)) + 1
          : 0;
        this.scratchBuffer.push({ index: newIndex, text: appendMatch[1] });
        continue;
      }

      const editMatch = trimmed.match(/^edit\[(\d+)\]:\s*(.+)$/i);
      if (editMatch) {
        const idx = parseInt(editMatch[1]);
        const entry = this.scratchBuffer.find(s => s.index === idx);
        if (entry) entry.text = editMatch[2];
        continue;
      }

      const deleteMatch = trimmed.match(/^delete\[(\d+)\]$/i);
      if (deleteMatch) {
        const idx = parseInt(deleteMatch[1]);
        this.scratchBuffer = this.scratchBuffer.filter(s => s.index !== idx);
        continue;
      }
    }
  }

  reset(): void {
    this.scratchBuffer = [];
    this.currentTask = null;
  }
}

/**
 * Apply a delta-changes object from the DM to produce a new world state.
 * This avoids the LLM needing to echo back the entire world state JSON.
 */
function applyChanges(ws: WorldState, changes: Record<string, any>): WorldState {
  const next = cloneWorldState(ws);

  if (changes.agentLocation && typeof changes.agentLocation === 'string') {
    next.agentLocation = changes.agentLocation as LocationId;
  }

  if (Array.isArray(changes.addToInventory)) {
    for (const item of changes.addToInventory) {
      if (!next.agentInventory.includes(item)) {
        next.agentInventory.push(item);
      }
    }
  }

  if (Array.isArray(changes.removeFromInventory)) {
    next.agentInventory = next.agentInventory.filter(
      (i: string) => !changes.removeFromInventory.includes(i),
    );
  }

  if (changes.objectStateChanges && typeof changes.objectStateChanges === 'object') {
    for (const [path, value] of Object.entries(changes.objectStateChanges)) {
      // path format: "location_id.object_id.property"
      const parts = path.split('.');
      if (parts.length === 3) {
        const [locId, objId, prop] = parts;
        const loc = next.locations[locId as LocationId];
        if (loc?.objects[objId]) {
          loc.objects[objId].states[prop] = String(value);
        }
      }
    }
  }

  if (changes.addNpcInventory && typeof changes.addNpcInventory === 'object') {
    for (const [npc, items] of Object.entries(changes.addNpcInventory)) {
      if (!next.npcInventory[npc]) next.npcInventory[npc] = [];
      for (const item of items as string[]) {
        next.npcInventory[npc].push(item);
      }
    }
  }

  if (changes.setGlobalFlags && typeof changes.setGlobalFlags === 'object') {
    for (const [flag, val] of Object.entries(changes.setGlobalFlags)) {
      next.globalFlags[flag] = Boolean(val);
    }
  }

  return next;
}

export function formatAction(action: AgentAction): string {
  if (action.secondTarget) {
    return `${action.type}(${action.target}, ${action.secondTarget})`;
  }
  return `${action.type}(${action.target})`;
}

export function parseAction(raw: string): AgentAction | null {
  // Match patterns like: go_to(kitchen), combine(herbs, water), give(meal, patron)
  const match = raw.match(/(\w+)\(([^)]*)\)/);
  if (!match) return null;

  const type = match[1] as AgentAction['type'];
  const validTypes = ['go_to', 'examine', 'take', 'use', 'combine', 'give'];
  if (!validTypes.includes(type)) return null;

  const args = match[2].split(',').map(s => s.trim().replace(/['"]/g, ''));

  return {
    type,
    target: args[0] ?? '',
    secondTarget: args[1] ?? undefined,
  };
}
