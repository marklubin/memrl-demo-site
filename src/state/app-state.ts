import type { AppState } from '../types.js';
import { createInitialAppState } from '../types.js';
import { Store } from './store.js';
import { loadPersistedState, createDebouncedPersist } from './persistence.js';
import { MemoryBank } from '../core/memory-bank.js';

/** Create the app store, hydrated from localStorage if available. */
export function createAppStore(): { store: Store<AppState>; memoryBank: MemoryBank } {
  const initial = createInitialAppState();
  const persisted = loadPersistedState();

  // Hydrate persisted values
  const state: AppState = {
    ...initial,
    ...persisted,
    memoryBank: persisted.memoryBank ?? [],
    game: initial.game,  // never persist game state mid-task
  };

  const store = new Store<AppState>(state);
  const memoryBank = new MemoryBank(state.memoryBank);

  // Auto-persist on changes (debounced)
  const debouncedPersist = createDebouncedPersist(500);
  store.subscribe((newState) => {
    debouncedPersist(newState);
  });

  return { store, memoryBank };
}
