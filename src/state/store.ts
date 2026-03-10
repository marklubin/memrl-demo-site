export type Listener<T> = (state: T, prev: T) => void;
export type Selector<T, R> = (state: T) => R;

/**
 * Minimal reactive store with pub/sub.
 * Supports subscribing to the entire state or specific slices.
 */
export class Store<T extends object> {
  private state: T;
  private listeners = new Set<Listener<T>>();
  private sliceListeners = new Map<string, Set<(value: unknown, prev: unknown) => void>>();

  constructor(initial: T) {
    this.state = { ...initial };
  }

  getState(): T {
    return this.state;
  }

  setState(partial: Partial<T>): void {
    const prev = this.state;
    this.state = { ...prev, ...partial };

    // Notify global listeners
    for (const fn of this.listeners) fn(this.state, prev);

    // Notify slice listeners
    for (const key of Object.keys(partial as object)) {
      const fns = this.sliceListeners.get(key);
      if (fns) {
        const prevVal = (prev as any)[key];
        const newVal = (this.state as any)[key];
        if (prevVal !== newVal) {
          for (const fn of fns) fn(newVal, prevVal);
        }
      }
    }
  }

  /** Deep-merge a nested state update (one level deep). */
  merge<K extends keyof T>(key: K, partial: Partial<T[K] & Record<string, unknown>>): void {
    const current = this.state[key];
    if (typeof current === 'object' && current !== null) {
      this.setState({ [key]: { ...current, ...partial } } as Partial<T>);
    }
  }

  /** Subscribe to all state changes. Returns unsubscribe function. */
  subscribe(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Subscribe to changes on a specific top-level key. */
  on<K extends keyof T>(key: K, fn: (value: T[K], prev: T[K]) => void): () => void {
    const k = key as string;
    if (!this.sliceListeners.has(k)) {
      this.sliceListeners.set(k, new Set());
    }
    const wrapped = fn as (value: unknown, prev: unknown) => void;
    this.sliceListeners.get(k)!.add(wrapped);
    return () => this.sliceListeners.get(k)?.delete(wrapped);
  }
}
