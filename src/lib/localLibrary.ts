import {
  getLocalSyncedDocs,
  ingestFile,
  removeUploadedDocByLocalKey,
  type UploadedDoc,
} from './uploads';

export interface LocalLibraryFile {
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
}

export interface LocalLibraryInfo {
  path: string;
  files: LocalLibraryFile[];
}

export interface LocalLibrarySyncResult {
  available: boolean;
  path?: string;
  added: number;
  updated: number;
  removed: number;
  errors: string[];
}

const dismissedKeys = new Set<string>();

export function localFileKey(file: LocalLibraryFile): string {
  return `${file.relativePath}:${file.modifiedAt}`;
}

export async function fetchLocalLibraryInfo(): Promise<LocalLibraryInfo | null> {
  try {
    const res = await fetch('/api/local-library/list');
    if (!res.ok) return null;
    return (await res.json()) as LocalLibraryInfo;
  } catch {
    return null;
  }
}

export function dismissLocalDoc(localFileKey: string): void {
  dismissedKeys.add(localFileKey);
  removeUploadedDocByLocalKey(localFileKey);
}

export async function syncLocalLibrary(): Promise<LocalLibrarySyncResult> {
  const info = await fetchLocalLibraryInfo();
  if (!info) {
    return { available: false, added: 0, updated: 0, removed: 0, errors: [] };
  }

  const result: LocalLibrarySyncResult = {
    available: true,
    path: info.path,
    added: 0,
    updated: 0,
    removed: 0,
    errors: [],
  };

  const remotePaths = new Set(info.files.map((f) => f.relativePath));
  const syncedByPath = new Map(
    getLocalSyncedDocs()
      .filter((d) => d.localRelativePath)
      .map((d) => [d.localRelativePath!, d])
  );

  for (const file of info.files) {
    const key = localFileKey(file);
    const existing = syncedByPath.get(file.relativePath);

    if (existing?.localFileKey === key) continue;
    if (!existing && dismissedKeys.has(key)) continue;

    if (existing) {
      removeUploadedDocByLocalKey(existing.localFileKey!);
      dismissedKeys.delete(existing.localFileKey!);
    }

    try {
      const res = await fetch(
        `/api/local-library/file?path=${encodeURIComponent(file.relativePath)}`
      );
      if (!res.ok) {
        result.errors.push(`Could not read ${file.name} (${res.status}).`);
        continue;
      }
      const blob = await res.blob();
      const uploaded = new File([blob], file.name, {
        type: blob.type || guessMime(file.name),
      });
      const ingest = await ingestFile(uploaded, {
        source: 'local',
        localFileKey: key,
        localRelativePath: file.relativePath,
      });
      if (!ingest.ok) {
        result.errors.push(ingest.error ?? `Could not ingest ${file.name}.`);
        continue;
      }
      if (existing) result.updated += 1;
      else result.added += 1;
    } catch (err) {
      result.errors.push(
        `Could not sync ${file.name}: ${err instanceof Error ? err.message : 'unknown error'}`
      );
    }
  }

  for (const doc of getLocalSyncedDocs()) {
    if (!doc.localRelativePath || !doc.localFileKey) continue;
    if (!remotePaths.has(doc.localRelativePath)) {
      removeUploadedDocByLocalKey(doc.localFileKey);
      dismissedKeys.delete(doc.localFileKey);
      result.removed += 1;
    }
  }

  return result;
}

function guessMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown';
  return 'text/plain';
}

export function isLocalDoc(doc: UploadedDoc): boolean {
  return doc.source === 'local' && Boolean(doc.localFileKey);
}

export function shortFolderPath(fullPath: string): string {
  const home = fullPath.includes('/Users/')
    ? fullPath.replace(/^\/Users\/[^/]+/, '~')
    : fullPath;
  const parts = home.split('/');
  if (parts.length <= 3) return home;
  return `…/${parts.slice(-2).join('/')}`;
}
