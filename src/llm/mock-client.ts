import type { LLMClient, ChatMessage, ChatOptions, ChatResponse, WorldState, TaskContract, DMTickResponse, LocationId } from '../types.js';
import { INITIAL_WORLD_STATE, cloneWorldState } from '../engine/world.js';
import { PREDEFINED_TASKS } from '../engine/tasks.js';

/**
 * Mock LLM client for testing and demo mode.
 * Uses a state machine for DM responses and scripted sequences for Agent.
 * Fully deterministic — no randomness.
 */
export class MockLLMClient implements LLMClient {
  private agentScripts: Map<string, string[]> = new Map();
  private agentStepIndex = 0;
  private currentTaskId: string | null = null;

  constructor() {
    this.loadDefaultScripts();
  }

  async chat(messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResponse> {
    const systemPrompt = messages.find(m => m.role === 'system')?.content ?? '';
    const lastUser = messages.filter(m => m.role === 'user').pop()?.content ?? '';

    console.log('%c[MockLLM] chat called', 'color: #92400e;', { systemPrompt: systemPrompt.slice(0, 100), lastUser: lastUser.slice(0, 100) });

    // Route to appropriate handler
    if (systemPrompt.includes('Dungeon Master') && (lastUser.includes('Generate a task') || lastUser.includes('Generate a new task') || systemPrompt.includes('Response Format'))) {
      return this.handleTaskGeneration(lastUser);
    }
    if (systemPrompt.includes('Dungeon Master') && lastUser.includes('Action')) {
      return this.handleDMTick(lastUser, systemPrompt);
    }
    if (systemPrompt.includes('adventurer completing tasks')) {
      return this.handleAgentAction(lastUser);
    }
    if (systemPrompt.includes('Summarize your experience') || lastUser.includes('strategy summary')) {
      return this.handleMemorySummary(lastUser);
    }
    if (systemPrompt.includes('Generate') && systemPrompt.includes('varied tasks')) {
      return this.handleSyntheticTasks(lastUser);
    }
    if (lastUser.includes('generate') && lastUser.includes('trajectory')) {
      return this.handleSyntheticTrajectory(lastUser);
    }

    console.warn('[MockLLM] Unrecognized prompt pattern', { systemPrompt: systemPrompt.slice(0, 200), lastUser: lastUser.slice(0, 200) });
    return { content: '{"error": "MockLLMClient: unrecognized prompt pattern"}' };
  }

  setCurrentTask(taskId: string): void {
    this.currentTaskId = taskId;
    this.agentStepIndex = 0;
  }

  private handleTaskGeneration(userMessage: string): ChatResponse {
    // Pick a task based on suggestion or default to first predefined
    const suggestion = userMessage.toLowerCase();
    let task = PREDEFINED_TASKS[0];

    for (const t of PREDEFINED_TASKS) {
      if (suggestion.includes(t.description.toLowerCase().split(' ').slice(0, 3).join(' '))) {
        task = t;
        break;
      }
    }

    const result = {
      task,
      initialWorldState: INITIAL_WORLD_STATE,
      initialScratchNotes: `Task: ${task.description}. Agent needs to follow these steps: ${task.solutionSteps.join(' → ')}. Watching for common mistakes.`,
    };

    return { content: JSON.stringify(result) };
  }

  private handleDMTick(userMessage: string, systemPrompt: string): ChatResponse {
    // Parse action from user message
    const actionMatch = userMessage.match(/Agent's Action[:\s]*(\w+)\(([^)]*)\)/i)
      ?? userMessage.match(/Action[:\s]*(\w+)\(([^)]*)\)/i)
      ?? userMessage.match(/"action"[:\s]*"(\w+)\(([^)]*)\)"/i);

    // Parse world state from system prompt (where buildTickSystem puts it)
    const worldStateMatch = systemPrompt.match(/## Current World State\s*\n([\s\S]*?)(?=\n## Your Scratch)/);

    let worldState: WorldState;
    try {
      const wsJson = worldStateMatch?.[1]?.trim();
      worldState = wsJson ? JSON.parse(wsJson) : cloneWorldState(INITIAL_WORLD_STATE);
    } catch {
      worldState = cloneWorldState(INITIAL_WORLD_STATE);
    }

    if (!actionMatch) {
      return {
        content: JSON.stringify({
          narrative: 'You stand there, unsure what to do.',
          worldState,
          status: 'continue',
          scratchUpdate: 'append: Agent action was unclear.',
        } satisfies DMTickResponse),
      };
    }

    const actionType = actionMatch[1];
    const args = actionMatch[2].split(',').map(s => s.trim().replace(/['"]/g, ''));
    const response = this.processMockAction(actionType, args, worldState);
    return { content: JSON.stringify(response) };
  }

  private processMockAction(actionType: string, args: string[], ws: WorldState): DMTickResponse {
    const newState = cloneWorldState(ws);
    let narrative = '';
    let status: 'continue' | 'success' | 'failure' = 'continue';
    let scratchUpdate = '';

    switch (actionType) {
      case 'go_to': {
        const loc = args[0] as LocationId;
        if (newState.locations[loc]) {
          newState.agentLocation = loc;
          const locName = newState.locations[loc].name;
          narrative = `You walk to the ${locName}. ${newState.locations[loc].description}`;
          scratchUpdate = `append: Agent moved to ${loc}.`;
        } else {
          narrative = `There's no such place as "${args[0]}".`;
          scratchUpdate = `append: Agent tried invalid location: ${args[0]}.`;
        }
        break;
      }
      case 'examine': {
        const loc = newState.locations[newState.agentLocation];
        const obj = loc.objects[args[0]];
        if (obj) {
          narrative = `You examine the ${obj.name}. ${obj.description}`;
          scratchUpdate = `append: Agent examined ${args[0]} in ${newState.agentLocation}.`;
        } else if (newState.agentInventory.includes(args[0])) {
          narrative = `You look at the ${args[0]} in your inventory.`;
          scratchUpdate = `append: Agent examined inventory item ${args[0]}.`;
        } else {
          narrative = `You don't see any "${args[0]}" here.`;
          scratchUpdate = `append: Agent tried to examine non-existent ${args[0]}.`;
        }
        break;
      }
      case 'take': {
        const loc = newState.locations[newState.agentLocation];
        const obj = loc.objects[args[0]];
        if (obj && obj.takeable) {
          newState.agentInventory.push(args[0]);
          delete loc.objects[args[0]];
          narrative = `You pick up the ${obj.name} and add it to your inventory.`;
          scratchUpdate = `append: Agent took ${args[0]}.`;
          status = this.checkMockSuccess(newState);
        } else if (obj && !obj.takeable) {
          narrative = `The ${obj.name} is too heavy or fixed in place.`;
          scratchUpdate = `append: Agent tried to take non-takeable ${args[0]}.`;
        } else {
          narrative = `There's no "${args[0]}" here to pick up.`;
          scratchUpdate = `append: Agent tried to take non-existent ${args[0]}.`;
        }
        break;
      }
      case 'use': {
        const item = args[0];
        const result = this.mockUseItem(item, newState);
        narrative = result.narrative;
        scratchUpdate = result.scratchUpdate;
        if (result.transformInventory) {
          newState.agentInventory = newState.agentInventory.filter(i => i !== result.transformInventory!.from);
          if (result.transformInventory.to) {
            newState.agentInventory.push(result.transformInventory.to);
          }
        }
        status = this.checkMockSuccess(newState);
        break;
      }
      case 'combine': {
        const [item1, item2] = args;
        const hasItem1 = newState.agentInventory.includes(item1);
        const hasItem2 = newState.agentInventory.includes(item2);
        if (hasItem1 && hasItem2) {
          const result = this.mockCombine(item1, item2, newState);
          narrative = result.narrative;
          scratchUpdate = result.scratchUpdate;
          if (result.resultItem) {
            newState.agentInventory = newState.agentInventory.filter(i => i !== item1 && i !== item2);
            newState.agentInventory.push(result.resultItem);
          }
        } else {
          const missing = !hasItem1 ? item1 : item2;
          narrative = `You don't have "${missing}" in your inventory.`;
          scratchUpdate = `append: Agent tried to combine without having ${missing}.`;
        }
        break;
      }
      case 'give': {
        const [item, target] = args;
        if (newState.agentInventory.includes(item)) {
          newState.agentInventory = newState.agentInventory.filter(i => i !== item);
          if (!newState.npcInventory[target]) newState.npcInventory[target] = [];
          newState.npcInventory[target].push(item);
          narrative = `You give the ${item} to ${target}.`;
          scratchUpdate = `append: Agent gave ${item} to ${target}.`;

          // Check common success conditions
          status = this.checkMockSuccess(newState);
        } else {
          narrative = `You don't have "${item}" to give.`;
          scratchUpdate = `append: Agent tried to give ${item} but doesn't have it.`;
        }
        break;
      }
      default:
        narrative = `Unknown action: ${actionType}`;
        scratchUpdate = `append: Agent used unknown action ${actionType}.`;
    }

    return { narrative, worldState: newState, status, scratchUpdate };
  }

  private mockUseItem(item: string, ws: WorldState): {
    narrative: string;
    scratchUpdate: string;
    transformInventory?: { from: string; to: string | null };
  } {
    const loc = ws.agentLocation;

    // Stove: cook ingredients
    if (item === 'stove' && loc === 'kitchen' && ws.agentInventory.includes('ingredients')) {
      return {
        narrative: 'You light the stove and cook the ingredients into a hot meal.',
        scratchUpdate: 'append: Agent cooked ingredients on stove → cooked_meal.',
        transformInventory: { from: 'ingredients', to: 'cooked_meal' },
      };
    }

    // Key on chest
    if (item === 'key' && loc === 'cellar' && ws.agentInventory.includes('key')) {
      if (ws.locations.cellar.objects['chest']?.states?.locked === 'yes') {
        ws.locations.cellar.objects['chest'].states.locked = 'no';
        ws.locations.cellar.objects['chest'].states.open = 'yes';
        // Reveal map inside chest
        ws.locations.cellar.objects['old_map'] = {
          name: 'Old Map',
          states: {},
          takeable: true,
          description: 'A faded map showing forgotten tunnels beneath the tavern.',
        };
        return {
          narrative: 'You insert the key into the chest lock and turn it. The chest clicks open, revealing an old map inside.',
          scratchUpdate: 'append: Agent unlocked chest with key. Map now available.',
        };
      }
    }

    // Matches on fireplace
    if (item === 'matches' && loc === 'main_hall' && ws.agentInventory.includes('matches') && ws.agentInventory.includes('firewood')) {
      ws.locations.main_hall.objects['fireplace'].states.lit = 'yes';
      // Also consume firewood
      ws.agentInventory = ws.agentInventory.filter(i => i !== 'firewood');
      return {
        narrative: 'You arrange the firewood in the fireplace and strike a match. The fire crackles to life, warming the hall.',
        scratchUpdate: 'append: Agent lit the fireplace with matches and firewood.',
        transformInventory: { from: 'matches', to: null },
      };
    }

    // Linens on bed
    if (item === 'clean_linens' && loc === 'upstairs_room' && ws.agentInventory.includes('clean_linens')) {
      ws.locations.upstairs_room.objects['bed'].states.made = 'yes';
      return {
        narrative: 'You carefully make the bed with fresh, clean linens.',
        scratchUpdate: 'append: Agent made the bed with clean linens.',
        transformInventory: { from: 'clean_linens', to: null },
      };
    }

    // Candle in upstairs room
    if (item === 'candle' && loc === 'upstairs_room' && ws.agentInventory.includes('candle')) {
      ws.locations.upstairs_room.objects['candle_holder'] = {
        name: 'Lit Candle',
        states: { lit: 'yes' },
        takeable: false,
        description: 'A warm candle illuminates the room.',
      };
      return {
        narrative: 'You place and light the candle, casting a warm glow around the room.',
        scratchUpdate: 'append: Agent lit candle in upstairs room.',
        transformInventory: { from: 'candle', to: null },
      };
    }

    // Stove with herb_water
    if (item === 'stove' && loc === 'kitchen' && ws.agentInventory.includes('herb_water')) {
      return {
        narrative: 'You heat the herb water on the stove, brewing a fragrant healing tea.',
        scratchUpdate: 'append: Agent brewed herb_water into healing_tea.',
        transformInventory: { from: 'herb_water', to: 'healing_tea' },
      };
    }

    // Generic use
    if (ws.agentInventory.includes(item)) {
      return {
        narrative: `You try to use the ${item}, but nothing happens.`,
        scratchUpdate: `append: Agent used ${item} with no effect.`,
      };
    }

    // Use object in location
    const locObj = ws.locations[loc].objects[item];
    if (locObj) {
      return {
        narrative: `You interact with the ${locObj.name}. ${locObj.description}`,
        scratchUpdate: `append: Agent interacted with ${item} in ${loc}.`,
      };
    }

    return {
      narrative: `You don't see any "${item}" to use.`,
      scratchUpdate: `append: Agent tried to use non-existent ${item}.`,
    };
  }

  private mockCombine(item1: string, item2: string, _ws: WorldState): {
    narrative: string;
    scratchUpdate: string;
    resultItem?: string;
  } {
    const combo = [item1, item2].sort().join('+');
    switch (combo) {
      case 'herbs+water':
        return {
          narrative: 'You steep the herbs in water, creating an herbal mixture.',
          scratchUpdate: 'append: Agent combined herbs + water → herb_water.',
          resultItem: 'herb_water',
        };
      default:
        return {
          narrative: `You try to combine ${item1} and ${item2}, but they don't go together.`,
          scratchUpdate: `append: Agent failed to combine ${item1} and ${item2}.`,
        };
    }
  }

  private checkMockSuccess(ws: WorldState): 'success' | 'continue' {
    // Check if patron has cooked_meal (serve_hot_meal)
    if (ws.npcInventory['patron']?.includes('cooked_meal')) return 'success';
    // Check if patron has healing_tea (brew_healing_tea)
    if (ws.npcInventory['patron']?.includes('healing_tea')) return 'success';
    // Check if fireplace is lit (light_fireplace)
    if (ws.locations?.main_hall?.objects?.['fireplace']?.states?.lit === 'yes') return 'success';
    // Check if bed is made and candle lit (prepare_guest_room)
    if (ws.locations?.upstairs_room?.objects?.['bed']?.states?.made === 'yes' &&
        ws.locations?.upstairs_room?.objects?.['candle_holder']?.states?.lit === 'yes') return 'success';
    // Check if agent has old_map (retrieve_old_map)
    if (ws.agentInventory.includes('old_map')) return 'success';
    return 'continue';
  }

  private handleAgentAction(userMessage: string): ChatResponse {
    // Detect task from prompt content
    let taskId = this.currentTaskId ?? 'serve_hot_meal';
    if (!this.currentTaskId) {
      const taskDetection: [string, string][] = [
        ['serve_hot_meal', 'hot meal'],
        ['serve_hot_meal', 'cooked meal'],
        ['retrieve_old_map', 'old map'],
        ['retrieve_old_map', 'retrieve the map'],
        ['brew_healing_tea', 'healing tea'],
        ['brew_healing_tea', 'brew.*tea'],
        ['light_fireplace', 'fireplace'],
        ['light_fireplace', 'light.*fire'],
        ['prepare_guest_room', 'guest room'],
        ['prepare_guest_room', 'prepare.*room'],
      ];
      const lower = userMessage.toLowerCase();
      for (const [id, pattern] of taskDetection) {
        if (lower.includes(pattern) || lower.match(new RegExp(pattern))) {
          taskId = id;
          if (this.currentTaskId !== id) {
            this.currentTaskId = id;
            this.agentStepIndex = 0;
          }
          break;
        }
      }
    }

    const script = this.agentScripts.get(taskId) ?? this.agentScripts.get('serve_hot_meal')!;
    const step = script[Math.min(this.agentStepIndex, script.length - 1)];
    this.agentStepIndex++;

    return {
      content: `Thinking: Based on the current situation and my task, I should ${step.replace(/\w+\(/, 'go ')}.\nAction: ${step}`,
    };
  }

  private handleMemorySummary(userMessage: string): ChatResponse {
    const success = userMessage.toLowerCase().includes('success');
    const summary = success
      ? 'Strategy: Navigate to the required locations in order. Pick up needed items before attempting to use or combine them. Always check the current location for available objects. The key to efficiency is minimizing unnecessary movement between locations.'
      : 'Strategy: The approach failed because I went to the wrong location first or tried to use items I didn\'t have. Next time, I should examine the task requirements more carefully and plan the route before acting. Picking up items in the right order matters.';
    return { content: summary };
  }

  private handleSyntheticTasks(_userMessage: string): ChatResponse {
    return {
      content: JSON.stringify(PREDEFINED_TASKS.map((t, i) => ({
        id: `synth_${i}`,
        description: t.description,
        category: 'fetch_process_deliver',
        difficulty: 'medium',
        expectedSteps: t.solutionSteps.length,
      }))),
    };
  }

  private handleSyntheticTrajectory(userMessage: string): ChatResponse {
    return {
      content: JSON.stringify({
        success_trajectory: {
          steps: ['go_to(kitchen)', 'take(ingredients)', 'use(stove)', 'go_to(main_hall)', 'give(cooked_meal, patron)'],
          narrative: 'Went to kitchen, cooked a meal, delivered it.',
          outcome: 'success',
        },
        failure_trajectory: {
          steps: ['go_to(cellar)', 'examine(barrels)', 'go_to(courtyard)', 'examine(well)'],
          narrative: 'Wandered to wrong locations and ran out of steps.',
          outcome: 'failure',
        },
      }),
    };
  }

  private loadDefaultScripts(): void {
    this.agentScripts.set('serve_hot_meal', [
      'go_to(kitchen)',
      'take(ingredients)',
      'use(stove)',
      'go_to(main_hall)',
      'give(cooked_meal, patron)',
    ]);

    this.agentScripts.set('retrieve_old_map', [
      'go_to(upstairs_room)',
      'examine(desk)',
      'take(key)',
      'go_to(cellar)',
      'use(key)',
      'take(old_map)',
    ]);

    this.agentScripts.set('brew_healing_tea', [
      'go_to(courtyard)',
      'take(herbs)',
      'go_to(kitchen)',
      'take(water)',
      'combine(herbs, water)',
      'use(stove)',
      'go_to(main_hall)',
      'give(healing_tea, patron)',
    ]);

    this.agentScripts.set('light_fireplace', [
      'go_to(kitchen)',
      'take(matches)',
      'go_to(cellar)',
      'take(firewood)',
      'go_to(main_hall)',
      'use(matches)',
    ]);

    this.agentScripts.set('prepare_guest_room', [
      'go_to(cellar)',
      'take(clean_linens)',
      'go_to(upstairs_room)',
      'use(clean_linens)',
      'go_to(kitchen)',
      'take(candle)',
      'go_to(upstairs_room)',
      'use(candle)',
    ]);
  }
}
