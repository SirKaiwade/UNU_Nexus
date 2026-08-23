/**
 * Durable browser storage for the knowledge library.
 * - `docs` holds metadata + extracted text (searchable corpus behind each file)
 * - `blobs` holds the original file bytes for real previews / open-as-file
 */

const DB_NAME = 'nexus-library';
const DB_VERSION = 1;
const DOCS_STORE = 'docs';
const BLOBS_STORE = 'blobs';

export interface StoredBlob {
  id: string;
  mimeType: string;
  filename: string;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DOCS_STORE)) {
        db.createObjectStore(DOCS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(BLOBS_STORE)) {
        db.createObjectStore(BLOBS_STORE, { keyPath: 'id' });
      }
    };
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export async function idbPutDoc(doc: unknown): Promise<void> {
  const db = await openDb();
  try {
    await idbReq(db.transaction(DOCS_STORE, 'readwrite').objectStore(DOCS_STORE).put(doc));
  } finally {
    db.close();
  }
}

export async function idbPutDocs(docs: unknown[]): Promise<void> {
  if (docs.length === 0) return;
  const db = await openDb();
  try {
    const tx = db.transaction(DOCS_STORE, 'readwrite');
    const store = tx.objectStore(DOCS_STORE);
    await Promise.all(docs.map((d) => idbReq(store.put(d))));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('idbPutDocs failed'));
    });
  } finally {
    db.close();
  }
}

export async function idbLoadAllDocs<T extends { id: string }>(): Promise<T[]> {
  const db = await openDb();
  try {
    const rows = await idbReq(
      db.transaction(DOCS_STORE, 'readonly').objectStore(DOCS_STORE).getAll()
    );
    return (rows ?? []) as T[];
  } finally {
    db.close();
  }
}

export async function idbDeleteDoc(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([DOCS_STORE, BLOBS_STORE], 'readwrite');
    tx.objectStore(DOCS_STORE).delete(id);
    tx.objectStore(BLOBS_STORE).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('idbDeleteDoc failed'));
    });
  } finally {
    db.close();
  }
}

export async function idbClearAll(): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([DOCS_STORE, BLOBS_STORE], 'readwrite');
    tx.objectStore(DOCS_STORE).clear();
    tx.objectStore(BLOBS_STORE).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('idbClearAll failed'));
    });
  } finally {
    db.close();
  }
}

export async function idbPutBlob(
  id: string,
  blob: Blob,
  mimeType: string,
  filename: string
): Promise<void> {
  const db = await openDb();
  try {
    const record: StoredBlob = { id, blob, mimeType, filename };
    await idbReq(
      db.transaction(BLOBS_STORE, 'readwrite').objectStore(BLOBS_STORE).put(record)
    );
  } finally {
    db.close();
  }
}

export async function idbGetBlob(id: string): Promise<StoredBlob | null> {
  const db = await openDb();
  try {
    const row = await idbReq(
      db.transaction(BLOBS_STORE, 'readonly').objectStore(BLOBS_STORE).get(id)
    );
    return (row as StoredBlob | undefined) ?? null;
  } finally {
    db.close();
  }
}

export async function idbHasBlob(id: string): Promise<boolean> {
  const row = await idbGetBlob(id);
  return Boolean(row?.blob);
}
