import type { AppState, MemoryEntry, MemRLParams, APIConfig, SelectionMode } from '../types.js';
import { DEFAULT_PARAMS } from '../types.js';

const PREFIX = 'memrl-demo:';

function getItem<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function setItem(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to persist ${key}:`, err);
  }
}

export function loadPersistedState(): Partial<AppState> {
  return {
    apiConfig: getItem<APIConfig>('apiConfig', { baseUrl: '', apiKey: '', model: '' }),
    params: getItem<MemRLParams>('params', { ...DEFAULT_PARAMS }),
    selectionMode: getItem<SelectionMode>('selectionMode', 'paper'),
    memoryBank: getItem<MemoryEntry[]>('memoryBank', []),
    demoMode: getItem<boolean>('demoMode', false),
  };
}

/** Persist specific keys to localStorage. Call after state changes. */
export function persistState(state: AppState): void {
  setItem('apiConfig', state.apiConfig);
  setItem('params', state.params);
  setItem('selectionMode', state.selectionMode);
  setItem('memoryBank', state.memoryBank);
  setItem('demoMode', state.demoMode);
}

export function clearPersistedState(): void {
  const keys = ['apiConfig', 'params', 'selectionMode', 'memoryBank', 'demoMode'];
  for (const key of keys) {
    localStorage.removeItem(PREFIX + key);
  }
}

/** Debounced version of persistState. */
export function createDebouncedPersist(delayMs = 500): (state: AppState) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (state: AppState) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => persistState(state), delayMs);
  };
}
