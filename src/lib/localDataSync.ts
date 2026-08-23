import { useSyncExternalStore } from 'react';
import { directorySeed, directoryStore } from '../data/directory';
import { eventsSeed, eventsStore } from '../data/events';
import { publicationsSeed, publicationsStore } from '../data/publications';
import {
  fetchLocalCollection,
  fetchLocalDataStatus,
  saveLocalCollection,
  shortDataPath,
  type LocalCollection,
} from './localData';
import { supabaseConfigured } from './supabase';
import { loadDirectoryContacts, syncDirectoryContacts } from './db/directory';
import { loadEvents, syncEvents } from './db/events';
import { loadPublications, syncPublications } from './db/publications';

type SyncableStore<T> = {
  hydrate: (records: T[]) => void;
  get: () => T[];
  setSync: (fn: (records: T[]) => Promise<void>) => void;
};

const COLLECTIONS: Record<
  LocalCollection,
  { store: SyncableStore<unknown>; seed: unknown[] }
> = {
  events: { store: eventsStore as SyncableStore<unknown>, seed: eventsSeed },
  publications: {
    store: publicationsStore as SyncableStore<unknown>,
    seed: publicationsSeed,
  },
  directory: { store: directoryStore as SyncableStore<unknown>, seed: directorySeed },
};

const SUPABASE_LOADERS: Record<LocalCollection, () => Promise<unknown[] | null>> = {
  events: loadEvents,
  publications: loadPublications,
  directory: loadDirectoryContacts,
};

const SUPABASE_SYNCERS: Record<LocalCollection, (records: unknown[]) => Promise<void>> = {
  events: syncEvents as (records: unknown[]) => Promise<void>,
  publications: syncPublications as (records: unknown[]) => Promise<void>,
  directory: syncDirectoryContacts as (records: unknown[]) => Promise<void>,
};

type Backend = 'supabase' | 'local' | 'none';

let backend: Backend = 'none';
let available = false;
let dataPath: string | undefined;
const listeners = new Set<() => void>();

/** Stable object for useSyncExternalStore — must not be recreated each getSnapshot call. */
let infoSnapshot: {
  available: boolean;
  path?: string;
  shortPath?: string;
  backend: Backend;
  label?: string;
} = { available: false, backend: 'none' };

function rebuildInfoSnapshot() {
  const shortPath = dataPath ? shortDataPath(dataPath) : undefined;
  const label =
    backend === 'supabase'
      ? 'synced to Supabase (shared)'
      : shortPath
        ? `saved to ${shortPath}`
        : undefined;
  if (
    infoSnapshot.available !== available ||
    infoSnapshot.path !== dataPath ||
    infoSnapshot.shortPath !== shortPath ||
    infoSnapshot.backend !== backend ||
    infoSnapshot.label !== label
  ) {
    infoSnapshot = { available, path: dataPath, shortPath, backend, label };
  }
}

function notifyListeners() {
  rebuildInfoSnapshot();
  listeners.forEach((l) => l());
}

export function getLocalDataInfo() {
  rebuildInfoSnapshot();
  return infoSnapshot;
}

export function useLocalDataInfo() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLocalDataInfo,
    getLocalDataInfo
  );
}

async function loadCollection<T>(name: LocalCollection): Promise<T[] | null> {
  return fetchLocalCollection<T>(name);
}

/**
 * Shared, cross-device sync for the events/publications/directory record
 * stores. Supabase is authoritative when configured (every staff member
 * reads/writes the same rows); otherwise this falls back to the dev-only
 * local-folder JSON sync (single laptop) exactly as before.
 */
export async function initLocalDataSync(): Promise<{ available: boolean; path?: string }> {
  if (supabaseConfigured()) {
    backend = 'supabase';
    for (const name of Object.keys(COLLECTIONS) as LocalCollection[]) {
      const { store } = COLLECTIONS[name];
      const fromRemote = await SUPABASE_LOADERS[name]();
      const local = store.get() as { id: string }[];

      if (fromRemote === null) {
        // Load failed — keep whatever is already in the browser store.
      } else if (fromRemote.length === 0 && local.length > 0) {
        // Remote empty but local has imports (often after a failed sync).
        // Never wipe local — push local up once sync is wired.
      } else if (fromRemote.length > 0) {
        // Remote wins on id conflicts; keep any local-only rows not yet synced.
        const byId = new Map(
          (fromRemote as { id: string }[]).map((r) => [r.id, r])
        );
        for (const row of local) {
          if (!byId.has(row.id)) byId.set(row.id, row);
        }
        store.hydrate([...byId.values()]);
      } else {
        store.hydrate([]);
      }

      store.setSync((records) => SUPABASE_SYNCERS[name](records));

      // If we kept local data over an empty remote, push it now.
      if (
        fromRemote !== null &&
        fromRemote.length === 0 &&
        store.get().length > 0
      ) {
        try {
          await SUPABASE_SYNCERS[name](store.get());
        } catch (err) {
          console.warn(
            `[Nexus] Could not push local ${name} to Supabase after refresh:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }
    available = true;
    dataPath = undefined;
    notifyListeners();
    return { available: true };
  }

  const status = await fetchLocalDataStatus();
  available = status.available;
  dataPath = status.path;
  backend = status.available ? 'local' : 'none';

  if (!status.available) {
    notifyListeners();
    return status;
  }

  for (const name of Object.keys(COLLECTIONS) as LocalCollection[]) {
    const { store, seed } = COLLECTIONS[name];
    const fromDisk = await loadCollection(name);

    if (fromDisk && fromDisk.length > 0) {
      store.hydrate(fromDisk);
    } else {
      const current = store.get();
      await saveLocalCollection(name, current.length > 0 ? current : seed);
    }

    store.setSync((records) => saveLocalCollection(name, records).then(() => undefined));
  }

  notifyListeners();
  return status;
}
