import { useSyncExternalStore } from 'react';

/**
 * Persistent store for spreadsheet-backed records (events, publications, directory).
 * Seeded from bundled data; edits persist to localStorage and optionally sync to
 * JSON files on disk via the dev-server local-data API.
 */

export interface ImportSummary {
  added: number;
  updated: number;
}

export interface RecordsStore<T extends { id: string }> {
  use: () => T[];
  get: () => T[];
  /** Replace the full dataset (e.g. when loading from disk). */
  hydrate: (records: T[]) => void;
  /** Merge imported records by id — imported rows win over existing ones. */
  merge: (incoming: T[]) => ImportSummary;
  add: (record: T) => void;
  update: (record: T) => void;
  remove: (id: string) => boolean;
  /** Drop overrides and return to the bundled seed data. */
  reset: () => void;
  /** True when the current data differs from the bundled seed. */
  hasImports: () => boolean;
  /** Register an async hook that runs after every mutation (debounced). */
  setSync: (fn: (records: T[]) => Promise<void>) => void;
}

export function createRecordsStore<T extends { id: string }>(
  storageKey: string,
  seed: T[]
): RecordsStore<T> {
  const listeners = new Set<() => void>();
  let syncFn: ((records: T[]) => Promise<void>) | null = null;
  let syncTimer: ReturnType<typeof setTimeout> | null = null;

  function load(): T[] {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return seed;
      const parsed = JSON.parse(raw) as T[];
      // Preserve intentional empty arrays (don't fall back to seed and lose state).
      if (Array.isArray(parsed)) return parsed;
      return seed;
    } catch {
      return seed;
    }
  }

  let snapshot: T[] = load();

  function notify() {
    listeners.forEach((l) => l());
  }

  function scheduleSync(records: T[]) {
    if (!syncFn) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncFn!(records).catch((err) =>
        console.warn('[Nexus] Local data sync failed:', err)
      );
    }, 300);
  }

  function persist(records: T[]) {
    snapshot = records;
    try {
      localStorage.setItem(storageKey, JSON.stringify(records));
    } catch {
      // Quota exceeded — keep the in-memory copy for this session.
    }
    notify();
    scheduleSync(records);
  }

  return {
    use: () =>
      useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => snapshot,
        () => snapshot
      ),
    get: () => snapshot,
    hydrate: (records) => {
      if (!Array.isArray(records)) return;
      persist(records);
    },
    merge: (incoming) => {
      const byId = new Map(snapshot.map((r) => [r.id, r]));
      let added = 0;
      let updated = 0;
      for (const record of incoming) {
        if (byId.has(record.id)) updated += 1;
        else added += 1;
        byId.set(record.id, record);
      }
      persist([...byId.values()]);
      return { added, updated };
    },
    add: (record) => {
      persist([record, ...snapshot]);
    },
    update: (record) => {
      const idx = snapshot.findIndex((r) => r.id === record.id);
      if (idx === -1) {
        persist([record, ...snapshot]);
        return;
      }
      const next = [...snapshot];
      next[idx] = record;
      persist(next);
    },
    remove: (id) => {
      const next = snapshot.filter((r) => r.id !== id);
      if (next.length === snapshot.length) return false;
      persist(next);
      return true;
    },
    reset: () => {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
      snapshot = seed;
      notify();
      scheduleSync(seed);
    },
    hasImports: () => JSON.stringify(snapshot) !== JSON.stringify(seed),
    setSync: (fn) => {
      syncFn = fn;
    },
  };
}
