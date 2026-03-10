import type { WorldState, LocationId, LocationState, ObjectState } from '../types.js';

function obj(name: string, description: string, takeable: boolean, states: Record<string, string> = {}): ObjectState {
  return { name, description, takeable, states };
}

const LOCATIONS: Record<LocationId, Omit<LocationState, 'id'>> = {
  main_hall: {
    name: 'Main Hall',
    description: 'A warm tavern hall with a crackling fireplace, wooden tables, and a few patrons nursing their drinks.',
    objects: {
      fireplace: obj('Fireplace', 'A large stone fireplace. Currently cold and dark.', false, { lit: 'no' }),
      tables: obj('Wooden Tables', 'Sturdy oak tables scarred by years of use.', false),
      patron: obj('Patron', 'A weary traveler sitting at the bar, looking hungry.', false),
    },
    npcs: ['patron'],
  },
  kitchen: {
    name: 'Kitchen',
    description: 'A busy kitchen with a cast-iron stove, a stone sink, and shelves lined with ingredients and cooking tools.',
    objects: {
      stove: obj('Stove', 'A large cast-iron stove. Ready to cook.', false, { hot: 'no' }),
      ingredients: obj('Ingredients', 'Fresh vegetables, meat, and spices on the counter.', true),
      sink: obj('Sink', 'A stone sink with running water.', false),
      matches: obj('Matches', 'A box of long wooden matches.', true),
      water: obj('Water Jug', 'A jug of clean water.', true),
      candle: obj('Candle', 'A beeswax candle, unlit.', true),
    },
    npcs: [],
  },
  cellar: {
    name: 'Cellar',
    description: 'A dim cellar lined with barrels of ale, wine crates, and dusty shelves. A locked wooden chest sits in the corner.',
    objects: {
      barrels: obj('Barrels', 'Heavy oak barrels filled with ale.', false),
      chest: obj('Wooden Chest', 'A sturdy wooden chest with a heavy iron lock.', false, { locked: 'yes', open: 'no' }),
      wine_crates: obj('Wine Crates', 'Stacked crates of imported wine.', false),
      firewood: obj('Firewood', 'A bundle of dry firewood stacked against the wall.', true),
      clean_linens: obj('Clean Linens', 'Freshly laundered bed linens, folded neatly.', true),
    },
    npcs: [],
  },
  courtyard: {
    name: 'Courtyard',
    description: 'An open courtyard with a stone well, a small herb garden, and a horse post.',
    objects: {
      well: obj('Stone Well', 'A deep stone well with a wooden bucket and rope.', false),
      herbs: obj('Herbs', 'Fresh herbs growing in a small garden patch — rosemary, mint, chamomile.', true),
      horse_post: obj('Horse Post', 'A wooden post for tying horses. Currently empty.', false),
      garden: obj('Herb Garden', 'A well-tended garden with medicinal herbs.', false),
    },
    npcs: [],
  },
  upstairs_room: {
    name: 'Upstairs Room',
    description: 'A modest guest room with a bed, wardrobe, writing desk, and a window overlooking the courtyard.',
    objects: {
      bed: obj('Bed', 'A wooden bed frame with a thin mattress. The sheets look old.', false, { made: 'no' }),
      wardrobe: obj('Wardrobe', 'A tall oak wardrobe, slightly ajar.', false),
      desk: obj('Writing Desk', 'A small desk with drawers. Something glints inside.', false),
      key: obj('Iron Key', 'A heavy iron key found in the desk drawer.', true),
      window: obj('Window', 'A window overlooking the courtyard below.', false),
    },
    npcs: [],
  },
  shop_front: {
    name: 'Shop Front',
    description: 'The tavern\'s front counter with a glass display case, a locked coin box, and a leather-bound ledger.',
    objects: {
      counter: obj('Counter', 'A long wooden counter polished smooth by years of use.', false),
      display_case: obj('Display Case', 'A glass case showing various trinkets and potions for sale.', false),
      coin_box: obj('Coin Box', 'A small locked metal box for coins.', false, { locked: 'yes' }),
      ledger: obj('Ledger', 'A leather-bound ledger tracking tavern business.', true),
    },
    npcs: [],
  },
};

export const INITIAL_WORLD_STATE: WorldState = {
  locations: Object.fromEntries(
    Object.entries(LOCATIONS).map(([id, loc]) => [id, { id: id as LocationId, ...loc }])
  ) as Record<LocationId, LocationState>,
  agentLocation: 'main_hall',
  agentInventory: [],
  npcInventory: {},
  globalFlags: {},
};

export function cloneWorldState(ws: WorldState): WorldState {
  return JSON.parse(JSON.stringify(ws));
}

export const LOCATION_IDS: LocationId[] = [
  'main_hall', 'kitchen', 'cellar', 'courtyard', 'upstairs_room', 'shop_front',
];
