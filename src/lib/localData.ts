export type LocalCollection = 'events' | 'publications' | 'directory';

export interface LocalDataStatus {
  available: boolean;
  path?: string;
}

export async function fetchLocalDataStatus(): Promise<LocalDataStatus> {
  try {
    const res = await fetch('/api/local-data/status');
    if (!res.ok) return { available: false };
    return (await res.json()) as LocalDataStatus;
  } catch {
    return { available: false };
  }
}

export async function fetchLocalCollection<T>(
  collection: LocalCollection
): Promise<T[] | null> {
  try {
    const res = await fetch(`/api/local-data/${collection}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as T[];
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export async function saveLocalCollection<T>(
  collection: LocalCollection,
  records: T[]
): Promise<boolean> {
  try {
    const res = await fetch(`/api/local-data/${collection}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(records),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function shortDataPath(fullPath: string): string {
  const home = fullPath.includes('/Users/')
    ? fullPath.replace(/^\/Users\/[^/]+/, '~')
    : fullPath;
  const parts = home.split('/');
  if (parts.length <= 3) return home;
  return `…/${parts.slice(-2).join('/')}`;
}
