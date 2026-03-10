import type { MemoryEntry } from '../types.js';
import type { Embedder } from '../types.js';
import { MemoryBank, createMemoryEntry } from '../core/memory-bank.js';

/**
 * Hand-crafted seed memories that match the tavern world tasks.
 * These give the demo a realistic starting point where retrieval is
 * immediately visible. Q-values are pre-set to simulate prior learning.
 */
const SEED_ENTRIES: {
  intent: string;
  experience: string;
  trustScore: number;
  timesUsed: number;
  timesSucceeded: number;
}[] = [
  // Cooking task — good strategy, high Q
  {
    intent: 'Serve a hot meal to the patron in the main hall',
    experience:
      'Go directly to the kitchen first. The ingredients are on the shelf — take them, then use the stove to cook. ' +
      'The stove transforms raw ingredients into a cooked_meal automatically. ' +
      'Then return to main_hall and give the cooked_meal to the patron. Do NOT try to take the cooked_meal separately — ' +
      'it goes into your inventory when you use the stove.',
    trustScore: 0.62,
    timesUsed: 4,
    timesSucceeded: 3,
  },

  // Cooking task — mediocre strategy, low Q (went to wrong room first)
  {
    intent: 'Cook a meal and deliver it',
    experience:
      'I went to the cellar first looking for food but found only ale barrels. Wasted two steps. ' +
      'The ingredients are in the kitchen, not the cellar. After finding the kitchen, cooking was straightforward. ' +
      'Lesson: check the kitchen first for any cooking-related tasks.',
    trustScore: -0.15,
    timesUsed: 3,
    timesSucceeded: 1,
  },

  // Map retrieval — good strategy
  {
    intent: 'Find and retrieve the old map from the locked chest',
    experience:
      'The key is in the upstairs_room on the desk — go there first and take it. ' +
      'Then go to the cellar where the locked chest is. Use the key on the chest to unlock it. ' +
      'The old_map appears inside once the chest is open — take it. ' +
      'Critical: you need the key BEFORE going to the cellar.',
    trustScore: 0.48,
    timesUsed: 3,
    timesSucceeded: 2,
  },

  // Healing tea — good strategy
  {
    intent: 'Brew a healing tea and give it to the patron',
    experience:
      'Start in the courtyard to pick herbs from the garden. Then go to the kitchen for water. ' +
      'Combine herbs + water to make herb_water. Then use the stove to brew it into healing_tea. ' +
      'Finally deliver to the patron in main_hall. The combine step is easy to forget — ' +
      'you must combine BEFORE using the stove.',
    trustScore: 0.35,
    timesUsed: 2,
    timesSucceeded: 1,
  },

  // Fireplace — untested but plausible strategy
  {
    intent: 'Light the fireplace in the main hall',
    experience:
      'Gather matches from the kitchen and firewood from the cellar. Both are takeable items. ' +
      'Then go to main_hall and use the matches — this lights the fireplace if you have firewood in inventory. ' +
      'Both items are consumed. The order of gathering doesn\'t matter much, but you need both before going to main_hall.',
    trustScore: 0.10,
    timesUsed: 1,
    timesSucceeded: 0,
  },

  // Guest room — partial strategy (forgot candle)
  {
    intent: 'Prepare the upstairs guest room for a visitor',
    experience:
      'Get clean_linens from the cellar shelves, then go upstairs and use them on the bed. ' +
      'I forgot about the candle and ran out of steps. The room also needs a lit candle — ' +
      'get a candle from the kitchen before going upstairs. Make the bed first, then light the candle.',
    trustScore: -0.25,
    timesUsed: 2,
    timesSucceeded: 0,
  },

  // General navigation insight
  {
    intent: 'Complete a multi-step tavern task efficiently',
    experience:
      'Plan your route to minimize backtracking. The tavern layout: main_hall is central, ' +
      'kitchen and cellar are nearby, courtyard and upstairs_room are farther. ' +
      'Always gather ALL required items before starting the final delivery/assembly step. ' +
      'Check what objects are available at each location before deciding what to take.',
    trustScore: 0.28,
    timesUsed: 5,
    timesSucceeded: 3,
  },

  // Misleading strategy — negative Q (tried to buy items at shop)
  {
    intent: 'Get supplies from the shop front',
    experience:
      'I tried to buy ingredients at the shop_front but the display case items aren\'t useful for most tasks. ' +
      'The shop has a coin_box and ledger but you can\'t really purchase anything. ' +
      'Most task items are found in the kitchen, cellar, or courtyard. Don\'t waste steps at the shop.',
    trustScore: -0.40,
    timesUsed: 3,
    timesSucceeded: 0,
  },
];

/**
 * Load seed memories into the memory bank, computing embeddings for each.
 * Only loads if the bank is currently empty.
 */
export async function loadSeedMemories(
  embedder: Embedder,
  memoryBank: MemoryBank,
): Promise<number> {
  if (memoryBank.size() > 0) return 0;

  let loaded = 0;
  for (const seed of SEED_ENTRIES) {
    const embedding = await embedder.embed(seed.intent);
    const entry = createMemoryEntry(
      seed.intent,
      seed.experience,
      embedding,
      seed.trustScore,
      0,  // epoch 0 = seed data
    );
    entry.timesUsed = seed.timesUsed;
    entry.timesSucceeded = seed.timesSucceeded;

    // Add some fake history entries so convergence chart has data
    if (seed.timesUsed > 1) {
      const startQ = 0;
      let currentQ = startQ;
      for (let i = 0; i < seed.timesUsed; i++) {
        const reward = i < seed.timesSucceeded ? 1.0 : -1.0;
        const error = reward - currentQ;
        const newQ = currentQ + 0.1 * error;
        entry.history.push({
          epoch: i,
          taskId: `seed_task_${i}`,
          reward,
          oldScore: currentQ,
          newScore: newQ,
          predictionError: error,
        });
        currentQ = newQ;
      }
      entry.trustScore = currentQ;
    }

    memoryBank.add(entry);
    loaded++;
  }

  return loaded;
}
