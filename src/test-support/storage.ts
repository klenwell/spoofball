import type { KeyValueStore } from '../storage/saved-team';

/** An in-memory stand-in for `localStorage`, with its contents open for checks. */
export function memoryStorage(initial: Record<string, string> = {}): KeyValueStore & {
  readonly items: Map<string, string>;
} {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

/** A storage that throws on every use, as a blocked `localStorage` does. */
export function blockedStorage(): KeyValueStore {
  const fail = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  return { getItem: fail, setItem: fail };
}

/** A storage that reads fine but is full: every write throws a quota error. */
export function fullStorage(initial: Record<string, string> = {}): KeyValueStore {
  const store = memoryStorage(initial);
  return {
    getItem: store.getItem,
    setItem: () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    },
  };
}
