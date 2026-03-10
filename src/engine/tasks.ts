import type { TaskContract } from '../types.js';

export const PREDEFINED_TASKS: TaskContract[] = [
  {
    id: 'serve_hot_meal',
    description: 'Serve a hot meal to the patron in the main hall',
    solutionSteps: [
      'go_to(kitchen)',
      'take(ingredients)',
      'use(stove)',
      'go_to(main_hall)',
      'give(cooked_meal, patron)',
    ],
    successConditions: [
      'patron has cooked_meal',
    ],
    worldAxioms: [
      'ingredients are on the counter in the kitchen',
      'the stove in the kitchen cooks raw ingredients into a cooked_meal',
      'the agent must have ingredients in inventory to use the stove',
      'cooked_meal can be given to the patron in main_hall',
    ],
  },
  {
    id: 'retrieve_old_map',
    description: 'Retrieve the old map from the locked chest in the cellar',
    solutionSteps: [
      'go_to(upstairs_room)',
      'examine(desk)',
      'take(key)',
      'go_to(cellar)',
      'use(key)',
      'take(old_map)',
    ],
    successConditions: [
      'agent has old_map in inventory',
    ],
    worldAxioms: [
      'the chest in the cellar is locked',
      'the iron key is in the desk drawer in the upstairs room',
      'using the key on the chest unlocks it and reveals the old_map',
      'examine(desk) reveals the key',
    ],
  },
  {
    id: 'brew_healing_tea',
    description: 'Brew and serve a healing tea to the patron',
    solutionSteps: [
      'go_to(courtyard)',
      'take(herbs)',
      'go_to(kitchen)',
      'take(water)',
      'combine(herbs, water)',
      'use(stove)',
      'go_to(main_hall)',
      'give(healing_tea, patron)',
    ],
    successConditions: [
      'patron has healing_tea',
    ],
    worldAxioms: [
      'herbs grow in the courtyard garden',
      'water is available in the kitchen',
      'combining herbs and water creates herb_water',
      'heating herb_water on the stove creates healing_tea',
      'healing_tea can be given to the patron in main_hall',
    ],
  },
  {
    id: 'light_fireplace',
    description: 'Light the fireplace in the main hall',
    solutionSteps: [
      'go_to(kitchen)',
      'take(matches)',
      'go_to(cellar)',
      'take(firewood)',
      'go_to(main_hall)',
      'use(matches)',
    ],
    successConditions: [
      'fireplace in main_hall has lit=yes',
    ],
    worldAxioms: [
      'matches are in the kitchen',
      'firewood is in the cellar',
      'the agent needs both matches and firewood in inventory to light the fireplace',
      'using matches in main_hall with firewood in inventory lights the fireplace',
    ],
  },
  {
    id: 'examine_fireplace',
    description: 'Examine the fireplace in the main hall',
    solutionSteps: [
      'examine(fireplace)',
    ],
    successConditions: [
      'agent has examined the fireplace',
    ],
    worldAxioms: [
      'the fireplace is in the main hall where the agent starts',
      'examining the fireplace completes the task immediately',
    ],
  },
  {
    id: 'prepare_guest_room',
    description: 'Prepare the upstairs room for a guest',
    solutionSteps: [
      'go_to(cellar)',
      'take(clean_linens)',
      'go_to(upstairs_room)',
      'use(clean_linens)',
      'go_to(kitchen)',
      'take(candle)',
      'go_to(upstairs_room)',
      'use(candle)',
    ],
    successConditions: [
      'bed in upstairs_room has made=yes',
      'candle_holder in upstairs_room has lit=yes',
    ],
    worldAxioms: [
      'clean linens are in the cellar',
      'using clean_linens in the upstairs_room makes the bed',
      'a candle is in the kitchen',
      'using the candle in the upstairs_room lights and places it',
      'both bed made and candle lit are required for success',
    ],
  },
];
