import type { UploadedDoc } from './uploads';
import { canonicalizeLibraryPath } from './libraryPath';

/** Normalize separators and strip empty segments. Rejects `.` / `..`. */
export function normalizeLibraryPath(path: string): string {
  return canonicalizeLibraryPath(path) ?? '';
}

/** Join folder + filename into a normalized relative path. */
export function joinLibraryPath(folder: string, filename: string): string {
  const base = normalizeLibraryPath(folder);
  const name = filename.replace(/^\/+|\/+$/g, '');
  return base ? `${base}/${name}` : name;
}

/**
 * Human pin-point path: "Finance > 2024 > Q1 > budget.xlsx"
 * Root-level files: "Library > budget.xlsx"
 */
export function formatBreadcrumbPath(path: string, options?: { rootLabel?: string }): string {
  const parts = normalizeLibraryPath(path).split('/').filter(Boolean);
  if (parts.length === 0) return options?.rootLabel ?? 'Library';
  if (parts.length === 1) {
    return `${options?.rootLabel ?? 'Library'} > ${parts[0]}`;
  }
  return parts.join(' > ');
}

/** Folder path of a doc, or '' for root-level files. */
export function docFolderPath(doc: UploadedDoc): string {
  const full = normalizeLibraryPath(doc.localRelativePath || doc.filename);
  const parts = full.split('/');
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

/** Basename used for display / matching. */
export function docDisplayName(doc: UploadedDoc): string {
  const full = normalizeLibraryPath(doc.localRelativePath || doc.filename);
  const parts = full.split('/');
  return parts[parts.length - 1] || doc.filename;
}

/** Full slash path (storage / URLs). */
export function docFullPath(doc: UploadedDoc): string {
  return normalizeLibraryPath(doc.localRelativePath || doc.filename);
}

/** Pin-point breadcrumb for UI + Nexus answers. */
export function docBreadcrumbPath(doc: UploadedDoc): string {
  return formatBreadcrumbPath(docFullPath(doc));
}

/** Folder-only breadcrumb, e.g. "Finance > 2024". */
export function folderBreadcrumbPath(folderPath: string): string {
  const norm = normalizeLibraryPath(folderPath);
  if (!norm) return 'Library';
  return norm.split('/').join(' > ');
}

export function libraryFileHref(doc: UploadedDoc): string {
  const folder = docFolderPath(doc);
  const params = new URLSearchParams();
  if (folder) params.set('path', folder);
  params.set('file', doc.id);
  return `/library?${params.toString()}`;
}

export function libraryFolderHref(folderPath: string): string {
  const path = normalizeLibraryPath(folderPath);
  if (!path) return '/library';
  return `/library?path=${encodeURIComponent(path)}`;
}

export interface TreeFolder {
  name: string;
  path: string;
  folders: TreeFolder[];
  files: UploadedDoc[];
}

export interface LibraryTree {
  root: TreeFolder;
  /** All folder paths that contain at least one file (direct or nested). */
  folderPaths: string[];
}

function emptyFolder(name: string, path: string): TreeFolder {
  return { name, path, folders: [], files: [] };
}

/**
 * Build a folder tree from docs that carry relative paths (or sit at root).
 * `extraFolders` keeps empty folders visible (e.g. after "New folder").
 */
export function buildLibraryTree(
  docs: UploadedDoc[],
  extraFolders: string[] = []
): LibraryTree {
  const root = emptyFolder('', '');
  const byPath = new Map<string, TreeFolder>([['', root]]);

  function ensureFolder(folderPath: string): TreeFolder {
    const norm = normalizeLibraryPath(folderPath);
    const existing = byPath.get(norm);
    if (existing) return existing;

    const parts = norm.split('/');
    let parent = root;
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      let node = byPath.get(acc);
      if (!node) {
        node = emptyFolder(part, acc);
        byPath.set(acc, node);
        parent.folders.push(node);
        parent.folders.sort((a, b) => a.name.localeCompare(b.name));
      }
      parent = node;
    }
    return parent;
  }

  for (const extra of extraFolders) {
    const norm = normalizeLibraryPath(extra);
    if (norm) ensureFolder(norm);
  }

  const sorted = [...docs].sort((a, b) =>
    docFullPath(a).localeCompare(docFullPath(b))
  );

  for (const doc of sorted) {
    const folder = ensureFolder(docFolderPath(doc));
    folder.files.push(doc);
  }

  for (const folder of byPath.values()) {
    folder.files.sort((a, b) => docDisplayName(a).localeCompare(docDisplayName(b)));
  }

  const folderPaths = [...byPath.keys()]
    .filter((p) => p !== '')
    .sort((a, b) => a.localeCompare(b));

  return { root, folderPaths };
}

/** Resolve a folder path; synthesizes an empty folder if it isn't in the tree yet. */
export function getFolderAtPath(tree: LibraryTree, path: string): TreeFolder {
  const norm = normalizeLibraryPath(path);
  if (!norm) return tree.root;
  let node: TreeFolder = tree.root;
  let acc = '';
  for (const part of norm.split('/')) {
    acc = acc ? `${acc}/${part}` : part;
    const next = node.folders.find((f) => f.name === part);
    if (!next) {
      // Synthesize remaining chain so "New folder" navigation works before files exist.
      return emptyFolder(norm.split('/').pop() || part, norm);
    }
    node = next;
  }
  return node;
}

/** Immediate children counts for a folder (direct only). */
export function folderStats(folder: TreeFolder): { folders: number; files: number } {
  return { folders: folder.folders.length, files: folder.files.length };
}

/** Recursive file count under a folder. */
export function countFilesRecursive(folder: TreeFolder): number {
  return (
    folder.files.length +
    folder.folders.reduce((sum, f) => sum + countFilesRecursive(f), 0)
  );
}

export type LibrarySearchMatchKind = 'filename' | 'path' | 'content';

export interface LibrarySearchHit {
  doc: UploadedDoc;
  kind: LibrarySearchMatchKind;
  /** Short snippet when match is in content. */
  snippet?: string;
  folderPath: string;
  fullPath: string;
  breadcrumb: string;
  href: string;
}

function contentSnippet(text: string, query: string, radius = 60): string | undefined {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return undefined;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  let snip = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) snip = `…${snip}`;
  if (end < text.length) snip = `${snip}…`;
  return snip;
}

/**
 * Ranked library search: filename → path → content.
 * Designed for "where do I find X?" — every hit deep-links to the file's folder.
 */
export function searchLibrary(docs: UploadedDoc[], query: string): LibrarySearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: LibrarySearchHit[] = [];

  for (const doc of docs) {
    const name = docDisplayName(doc).toLowerCase();
    const fullPath = docFullPath(doc);
    const pathLower = fullPath.toLowerCase();
    const breadcrumb = docBreadcrumbPath(doc);
    const folderPath = docFolderPath(doc);

    let kind: LibrarySearchMatchKind | null = null;
    let snippet: string | undefined;

    if (name.includes(q)) {
      kind = 'filename';
    } else if (pathLower.includes(q) || breadcrumb.toLowerCase().includes(q)) {
      kind = 'path';
    } else if (doc.text.toLowerCase().includes(q)) {
      kind = 'content';
      snippet = contentSnippet(doc.text, q);
    }

    if (!kind) continue;

    hits.push({
      doc,
      kind,
      snippet,
      folderPath,
      fullPath,
      breadcrumb,
      href: libraryFileHref(doc),
    });
  }

  const rank: Record<LibrarySearchMatchKind, number> = {
    filename: 0,
    path: 1,
    content: 2,
  };

  hits.sort((a, b) => {
    const r = rank[a.kind] - rank[b.kind];
    if (r !== 0) return r;
    return a.fullPath.localeCompare(b.fullPath);
  });

  return hits;
}

/** True when the browser File already carries a nested folder path. */
export function fileHasFolderPath(file: File): boolean {
  const webkit = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return Boolean(webkit && webkit.includes('/'));
}
