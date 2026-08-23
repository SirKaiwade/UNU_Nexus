import { useEffect, useState, useSyncExternalStore } from 'react';
import { isSpreadsheetFile, readSpreadsheet, sheetsToText } from './spreadsheet';
import { canonicalizeLibraryPath } from './libraryPath';
import {
  idbClearAll,
  idbDeleteDoc,
  idbGetBlob,
  idbLoadAllDocs,
  idbPutBlob,
  idbPutDoc,
  idbPutDocs,
} from './libraryIdb';

export type DocSource = 'upload' | 'local' | 'sharepoint';

export interface UploadedDoc {
  id: string;
  filename: string;
  bytes: number;
  uploadedAt: string;
  /** Extracted searchable text — stored behind the original file. */
  text: string;
  pageCount?: number;
  charCount: number;
  /** Ephemeral thumbnail / object URL — not durable. */
  previewUrl?: string;
  mimeType?: string;
  /** True when the original file bytes are in IndexedDB. */
  hasOriginalFile?: boolean;
  source?: DocSource;
  /** Stable key for docs synced from a local folder (path + modified time). */
  localFileKey?: string;
  /** Path within the library folder tree, e.g. "reports/q1.pdf". */
  localRelativePath?: string;
  /** True once this doc is saved to the shared Supabase library. */
  shared?: boolean;
}

/** Soft per-file size limit for uploads (original binary). */
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 1_500_000;

const LEGACY_STORAGE_KEY = 'nexus:library-docs';

let store: UploadedDoc[] = [];
let ready = false;
const listeners = new Set<() => void>();
const objectUrls = new Map<string, string>();

function notify() {
  listeners.forEach((l) => l());
}

function emitSnapshot(): UploadedDoc[] {
  return store;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function revokePreview(id: string) {
  const url = objectUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(id);
  }
}

function withoutPreview(doc: UploadedDoc): Omit<UploadedDoc, 'previewUrl'> {
  const copy = { ...doc };
  delete copy.previewUrl;
  return copy;
}

function persistDocAsync(doc: UploadedDoc): void {
  void idbPutDoc(withoutPreview(doc)).catch((err) =>
    console.warn('[Nexus] IndexedDB save failed:', err)
  );
}

function persistAllAsync(): void {
  void idbPutDocs(store.map(withoutPreview)).catch((err) =>
    console.warn('[Nexus] IndexedDB bulk save failed:', err)
  );
}

function normalizeDoc(d: UploadedDoc): UploadedDoc {
  return {
    ...d,
    bytes: typeof d.bytes === 'number' ? d.bytes : d.text.length,
    charCount: typeof d.charCount === 'number' ? d.charCount : d.text.length,
    uploadedAt: d.uploadedAt || new Date().toISOString(),
    localRelativePath:
      typeof d.localRelativePath === 'string' && d.localRelativePath.trim()
        ? d.localRelativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
        : d.filename,
    previewUrl: undefined,
  };
}

function loadLegacyLocalStorage(): UploadedDoc[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (d): d is UploadedDoc =>
          !!d &&
          typeof d === 'object' &&
          typeof (d as UploadedDoc).id === 'string' &&
          typeof (d as UploadedDoc).filename === 'string' &&
          typeof (d as UploadedDoc).text === 'string'
      )
      .map(normalizeDoc);
  } catch {
    return [];
  }
}

/**
 * Load library from IndexedDB (and migrate legacy localStorage once).
 * Call once on app boot — e.g. from AppShell.
 */
export async function initLibraryStore(): Promise<void> {
  if (ready) return;
  try {
    let docs = (await idbLoadAllDocs<UploadedDoc>()).map(normalizeDoc);
    if (docs.length === 0) {
      const legacy = loadLegacyLocalStorage();
      if (legacy.length > 0) {
        docs = legacy;
        await idbPutDocs(legacy.map(withoutPreview));
        try {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    }
    store = docs.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  } catch (err) {
    console.warn('[Nexus] Library IndexedDB init failed, using memory only:', err);
    store = loadLegacyLocalStorage();
  }
  ready = true;
  notify();
}

export function useUploadedDocs(): UploadedDoc[] {
  return useSyncExternalStore(subscribe, emitSnapshot, emitSnapshot);
}

export function getUploadedDocs(): UploadedDoc[] {
  return store;
}

/** Drop docs the current user is not allowed to see (non-admins only). */
export function pruneLibraryByAccess(canRead: (doc: UploadedDoc) => boolean): void {
  const next = store.filter(canRead);
  if (next.length === store.length) return;
  store = next;
  persistAllAsync();
  notify();
}

/** @deprecated No longer used — library size is unbounded; Nexus retrieves per question. */
export function totalUploadedChars(): number {
  return store.reduce((sum, d) => sum + d.charCount, 0);
}

export function removeUploadedDoc(id: string): void {
  revokePreview(id);
  store = store.filter((d) => d.id !== id);
  notify();
  void idbDeleteDoc(id);
  void import('./db/library').then(({ removeDocumentFromLibrary }) =>
    removeDocumentFromLibrary(id)
  );
}

/** Remove every document in a folder (and nested subfolders). */
export function removeUploadedDocsInFolder(folderPath: string): number {
  const norm = folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!norm) return 0;
  const prefix = `${norm}/`;
  const removed = store.filter((d) => {
    const path = (d.localRelativePath || d.filename).replace(/\\/g, '/');
    return path === norm || path.startsWith(prefix);
  });
  if (removed.length === 0) return 0;
  for (const d of removed) revokePreview(d.id);
  const removeIds = new Set(removed.map((d) => d.id));
  store = store.filter((d) => !removeIds.has(d.id));
  notify();
  void Promise.all(removed.map((d) => idbDeleteDoc(d.id)));
  void import('./db/library').then(({ removeDocumentFromLibrary }) => {
    for (const d of removed) void removeDocumentFromLibrary(d.id);
  });
  return removed.length;
}

export function removeUploadedDocByLocalKey(localFileKey: string): void {
  const removed = store.filter((d) => d.localFileKey === localFileKey);
  for (const d of removed) revokePreview(d.id);
  store = store.filter((d) => d.localFileKey !== localFileKey);
  notify();
  if (removed.length === 0) return;
  void Promise.all(removed.map((d) => idbDeleteDoc(d.id)));
  void import('./db/library').then(({ removeDocumentFromLibrary }) => {
    for (const d of removed) void removeDocumentFromLibrary(d.id);
  });
}

export function getLocalSyncedDocs(): UploadedDoc[] {
  return store.filter((d) => d.source === 'local' && d.localFileKey);
}

export function clearUploadedDocs(): void {
  const ids = store.map((d) => d.id);
  for (const id of ids) revokePreview(id);
  store = [];
  notify();
  void idbClearAll();
  void import('./db/library').then(({ removeDocumentFromLibrary }) => {
    for (const id of ids) void removeDocumentFromLibrary(id);
  });
}

/** Merge documents loaded from the shared Supabase library into the durable store. */
export function hydrateSharedDocs(docs: UploadedDoc[]): void {
  if (docs.length === 0) return;
  const byId = new Map(store.map((d) => [d.id, d]));
  for (const incoming of docs) {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, {
        ...normalizeDoc(incoming),
        shared: true,
      });
      continue;
    }
    const text =
      (incoming.text?.length ?? 0) > (existing.text?.length ?? 0)
        ? incoming.text
        : existing.text;
    byId.set(incoming.id, {
      ...existing,
      ...normalizeDoc(incoming),
      text,
      charCount: text.length,
      shared: true,
      hasOriginalFile: existing.hasOriginalFile,
      mimeType: existing.mimeType ?? incoming.mimeType,
      previewUrl: existing.previewUrl ?? incoming.previewUrl,
    });
  }
  store = [...byId.values()].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  persistAllAsync();
  notify();
}

export function markDocShared(id: string): void {
  store = store.map((d) => (d.id === id ? { ...d, shared: true } : d));
  const doc = store.find((d) => d.id === id);
  if (doc) persistDocAsync(doc);
  notify();
}

export async function syncUnsharedDocsToCloud(
  uploaderEmail: string
): Promise<void> {
  const pending = store.filter((d) => !d.shared);
  if (pending.length === 0) return;
  for (const doc of pending) {
    await persistDocToCloud(doc, uploaderEmail);
  }
}

/** Object URL for the original file (PDF preview / download). Revoked on remove. */
export async function getDocFileUrl(id: string): Promise<string | null> {
  const existing = objectUrls.get(id);
  if (existing) return existing;
  const row = await idbGetBlob(id);
  if (!row?.blob) return null;
  const url = URL.createObjectURL(row.blob);
  objectUrls.set(id, url);
  return url;
}

export async function getDocFileBlob(id: string): Promise<Blob | null> {
  const row = await idbGetBlob(id);
  return row?.blob ?? null;
}

/** React helper: live object URL for a library file's original bytes. */
export function useDocFileUrl(id: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setUrl(null);
      return;
    }
    void getDocFileUrl(id).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
  return url;
}

function uid(): string {
  return `up-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36).slice(-4)}`;
}

let pdfjsWorkerConfigured = false;

async function ensurePdfjs() {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ]);
  if (!pdfjsWorkerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    pdfjsWorkerConfigured = true;
  }
  return pdfjs;
}

async function extractPdfTextAndPreview(
  file: File
): Promise<{ text: string; pageCount: number; previewUrl?: string }> {
  const pdfjs = await ensurePdfjs();

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) pages.push(`-- page ${i} --\n${text}`);
  }

  let previewUrl: string | undefined;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(220 / base.width, 2.4);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      await page.render({
        canvasContext: ctx,
        viewport,
        canvas,
      } as Parameters<typeof page.render>[0]).promise;
      previewUrl = canvas.toDataURL('image/jpeg', 0.78);
    }
  } catch {
    // Preview is optional — text extraction already succeeded.
  }

  return { text: pages.join('\n\n'), pageCount: pdf.numPages, previewUrl };
}

async function extractPlainText(file: File): Promise<string> {
  return file.text();
}

async function extractDocxText(file: File): Promise<string> {
  const { default: mammoth } = await import('mammoth/mammoth.browser');
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value;
}

function guessMime(file: File, isPdf: boolean, isDocx: boolean, isSheet: boolean): string {
  if (file.type) return file.type;
  if (isPdf) return 'application/pdf';
  if (isDocx) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (isSheet) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  return 'application/octet-stream';
}

export interface UploadResult {
  ok: boolean;
  doc?: UploadedDoc;
  error?: string;
}

export interface IngestMeta {
  source?: DocSource;
  localFileKey?: string;
  localRelativePath?: string;
}

function resolveRelativePath(
  file: File,
  meta?: IngestMeta,
  destinationFolder?: string
): string | null {
  let raw: string;
  if (meta?.localRelativePath) {
    raw = meta.localRelativePath;
  } else {
    const webkit = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    if (webkit && webkit.includes('/')) {
      raw = webkit;
    } else {
      const dest = destinationFolder ?? '';
      raw = dest ? `${dest}/${file.name}` : file.name;
    }
  }
  return canonicalizeLibraryPath(raw);
}

function headerMatches(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

async function sniffFile(
  file: File,
  kind: 'pdf' | 'docx' | 'xlsx' | 'text' | 'csv'
): Promise<string | null> {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (kind === 'pdf') {
    return headerMatches(bytes, [0x25, 0x50, 0x44, 0x46])
      ? null
      : 'File is not a valid PDF.';
  }
  if (kind === 'docx' || kind === 'xlsx') {
    return headerMatches(bytes, [0x50, 0x4b])
      ? null
      : 'File is not a valid Office Open XML document.';
  }
  if (kind === 'text' || kind === 'csv') {
    if (headerMatches(bytes, [0x25, 0x50, 0x44, 0x46]) || headerMatches(bytes, [0x50, 0x4b])) {
      return 'File content does not match a text/CSV type.';
    }
  }
  return null;
}

export async function ingestFile(
  file: File,
  meta?: IngestMeta,
  destinationFolder?: string
): Promise<UploadResult> {
  // Intentionally no total-library character cap. Original files + full extracted
  // text are stored in IndexedDB; Nexus retrieves only relevant docs per question.
  const name = file.name.toLowerCase();
  const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf';
  const isDocx =
    name.endsWith('.docx') ||
    file.type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isSheet = isSpreadsheetFile(file);
  const isText =
    !isSheet &&
    (name.endsWith('.txt') ||
      name.endsWith('.md') ||
      name.endsWith('.markdown') ||
      file.type.startsWith('text/'));

  if (name.endsWith('.xls') && !name.endsWith('.xlsx')) {
    return {
      ok: false,
      error: `Legacy .xls is not supported (${file.name}). Save as .xlsx or CSV.`,
    };
  }

  if (!isPdf && !isDocx && !isText && !isSheet) {
    return {
      ok: false,
      error: `Unsupported file type: ${file.name}. Try PDF, Word (.docx), Excel (.xlsx/.csv), or .txt/.md.`,
    };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `${file.name} is over ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB.`,
    };
  }

  const sniffKind = isPdf
    ? 'pdf'
    : isDocx
      ? 'docx'
      : isSheet && name.endsWith('.xlsx')
        ? 'xlsx'
        : name.endsWith('.csv')
          ? 'csv'
          : isText
            ? 'text'
            : null;
  if (sniffKind) {
    const sniffError = await sniffFile(file, sniffKind);
    if (sniffError) return { ok: false, error: `${file.name}: ${sniffError}` };
  }

  let text = '';
  let pageCount: number | undefined;
  let previewUrl: string | undefined;

  try {
    if (isPdf) {
      const extracted = await extractPdfTextAndPreview(file);
      text = extracted.text;
      pageCount = extracted.pageCount;
      previewUrl = extracted.previewUrl;
    } else if (isDocx) {
      text = await extractDocxText(file);
    } else if (isSheet) {
      text = sheetsToText(await readSpreadsheet(file));
    } else {
      text = await extractPlainText(file);
    }
  } catch (err) {
    return {
      ok: false,
      error: `Could not read ${file.name}: ${
        err instanceof Error ? err.message : 'unknown error'
      }`,
    };
  }

  text = text.replace(/\s+\n/g, '\n').trim();
  if (text.length > MAX_EXTRACTED_CHARS) {
    text = `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[Truncated: extracted text exceeded ${MAX_EXTRACTED_CHARS} characters.]`;
  }

  if (!text) {
    return {
      ok: false,
      error: `${file.name} appears to contain no extractable text. (Scanned PDFs need OCR — not in scope yet.)`,
    };
  }

  const localRelativePath = resolveRelativePath(file, meta, destinationFolder);
  if (localRelativePath === null) {
    return { ok: false, error: `${file.name} has an invalid path.` };
  }
  const mimeType = guessMime(file, isPdf, isDocx, isSheet);

  // Replace existing docs at the same path or local sync key.
  const removedIds: string[] = [];
  if (meta?.localFileKey) {
    for (const d of store.filter((x) => x.localFileKey === meta.localFileKey)) {
      removedIds.push(d.id);
    }
    store = store.filter((d) => d.localFileKey !== meta.localFileKey);
  } else if (localRelativePath) {
    for (const d of store.filter((x) => x.localRelativePath === localRelativePath)) {
      removedIds.push(d.id);
    }
    store = store.filter((d) => d.localRelativePath !== localRelativePath);
  }
  for (const id of removedIds) {
    revokePreview(id);
    void idbDeleteDoc(id);
  }

  const doc: UploadedDoc = {
    id: uid(),
    filename: file.name,
    bytes: file.size,
    uploadedAt: new Date().toISOString(),
    text,
    pageCount,
    charCount: text.length,
    previewUrl,
    mimeType,
    hasOriginalFile: true,
    source: meta?.source ?? 'upload',
    localFileKey: meta?.localFileKey,
    localRelativePath,
  };

  store = [...store, doc];
  notify();
  persistDocAsync(doc);
  void idbPutBlob(doc.id, file, mimeType, file.name).catch((err) =>
    console.warn('[Nexus] Could not store original file blob:', err)
  );

  return { ok: true, doc };
}

/**
 * Ingest many files (e.g. a whole folder). Skips unsupported types quietly when
 * `skipUnsupported` is true so folder uploads don't fail on .DS_Store etc.
 * Single files without their own nested path land in `destinationFolder`.
 */
export async function ingestFiles(
  files: File[],
  options?: {
    skipUnsupported?: boolean;
    destinationFolder?: string;
    onProgress?: (done: number, total: number, filename: string) => void;
  }
): Promise<{ docs: UploadedDoc[]; errors: string[] }> {
  const docs: UploadedDoc[] = [];
  const errors: string[] = [];
  const list = Array.from(files);
  let done = 0;
  for (const file of list) {
    options?.onProgress?.(done, list.length, file.name);
    const r = await ingestFile(file, undefined, options?.destinationFolder);
    done += 1;
    options?.onProgress?.(done, list.length, file.name);
    if (r.ok && r.doc) {
      docs.push(r.doc);
      continue;
    }
    if (
      options?.skipUnsupported &&
      r.error?.startsWith('Unsupported file type:')
    ) {
      continue;
    }
    if (r.error) {
      // Old cached bundles used to emit this — never surface it.
      if (/corpus limit/i.test(r.error)) continue;
      errors.push(r.error);
    }
  }
  return { docs, errors };
}

export async function persistDocToCloud(
  doc: UploadedDoc,
  uploaderEmail: string
): Promise<{ ok: boolean; error?: string }> {
  const { supabaseConfigured } = await import('./supabase');
  if (!supabaseConfigured()) return { ok: false, error: 'Supabase not configured' };
  const { saveDocumentToLibrary } = await import('./db/library');
  const result = await saveDocumentToLibrary(doc, uploaderEmail);
  if (result.ok) markDocShared(doc.id);
  return result;
}
