import type { UploadedDoc } from './uploads';
import { docBreadcrumbPath, docFullPath } from './libraryTree';

/** How much retrieved library text we allow in one Nexus prompt. */
export const RETRIEVAL_CHAR_BUDGET = 120_000;
/** Soft cap per retrieved doc inside the prompt (full text stays stored). */
export const RETRIEVAL_PER_DOC_CHARS = 28_000;
export const RETRIEVAL_MAX_DOCS = 14;

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is',
  'are', 'was', 'were', 'be', 'been', 'as', 'by', 'with', 'from', 'that', 'this',
  'it', 'its', 'do', 'does', 'did', 'what', 'where', 'which', 'who', 'how', 'when',
  'find', 'show', 'tell', 'about', 'please', 'can', 'you', 'me', 'my', 'our',
]);

export interface LibraryCatalogEntry {
  id: string;
  filename: string;
  path: string;
  breadcrumb: string;
  pageCount?: number;
  charCount: number;
}

export interface RetrievalResult {
  /** Docs (possibly text-truncated) to include as full corpus members. */
  retrieved: UploadedDoc[];
  /** Lightweight index of the entire library so the model knows what exists. */
  catalog: LibraryCatalogEntry[];
  totalLibraryDocs: number;
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9_\u00c0-\u024f]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

function scoreDoc(doc: UploadedDoc, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const name = doc.filename.toLowerCase();
  const path = docFullPath(doc).toLowerCase();
  const crumb = docBreadcrumbPath(doc).toLowerCase();
  const text = doc.text.toLowerCase();

  let score = 0;
  for (const t of tokens) {
    if (name.includes(t)) score += 12;
    if (path.includes(t)) score += 6;
    if (crumb.includes(t)) score += 4;
    // Count limited occurrences in body — cheap proxy for BM25-ish relevance.
    let from = 0;
    let hits = 0;
    while (hits < 8) {
      const idx = text.indexOf(t, from);
      if (idx < 0) break;
      hits += 1;
      from = idx + t.length;
    }
    score += hits * 2;
  }
  return score;
}

function truncateForPrompt(doc: UploadedDoc, maxChars: number): UploadedDoc {
  if (doc.text.length <= maxChars) return doc;
  return {
    ...doc,
    text:
      doc.text.slice(0, maxChars) +
      '\n\n[…truncated for this answer — full file remains in the library]',
    charCount: maxChars,
  };
}

/**
 * Copilot-style retrieval: keep a full catalog of every file, but only pull the
 * most relevant documents' text into the model context for this question.
 * Chat-attached docs (`pinnedDocIds`) are always included first.
 */
export function retrieveLibraryDocs(
  question: string,
  allDocs: UploadedDoc[],
  options?: {
    budget?: number;
    maxDocs?: number;
    perDocChars?: number;
    pinnedDocIds?: string[];
  }
): RetrievalResult {
  const budget = options?.budget ?? RETRIEVAL_CHAR_BUDGET;
  const maxDocs = options?.maxDocs ?? RETRIEVAL_MAX_DOCS;
  const perDocChars = options?.perDocChars ?? RETRIEVAL_PER_DOC_CHARS;
  const pinned = new Set(options?.pinnedDocIds ?? []);

  const catalog: LibraryCatalogEntry[] = allDocs.map((d) => ({
    id: d.id,
    filename: d.filename,
    path: docFullPath(d),
    breadcrumb: docBreadcrumbPath(d),
    pageCount: d.pageCount,
    charCount: d.charCount,
  }));

  if (allDocs.length === 0) {
    return { retrieved: [], catalog, totalLibraryDocs: 0 };
  }

  const byId = new Map(allDocs.map((d) => [d.id, d]));
  const retrieved: UploadedDoc[] = [];
  let used = 0;
  const seen = new Set<string>();

  // Explicit chat attachments always go in first (within budget).
  for (const id of options?.pinnedDocIds ?? []) {
    if (retrieved.length >= maxDocs) break;
    const doc = byId.get(id);
    if (!doc || seen.has(id)) continue;
    const slice = truncateForPrompt(doc, perDocChars);
    if (used + slice.text.length > budget && retrieved.length > 0) break;
    retrieved.push(slice);
    used += slice.text.length;
    seen.add(id);
  }

  const tokens = tokenize(question);
  const ranked = [...allDocs]
    .filter((doc) => !seen.has(doc.id))
    .map((doc) => ({ doc, score: scoreDoc(doc, tokens) }))
    .sort((a, b) => b.score - a.score || b.doc.uploadedAt.localeCompare(a.doc.uploadedAt));

  // Prefer scored hits; if the question is vague, fall back to newest docs.
  const pool =
    tokens.length === 0 || ranked.every((r) => r.score === 0)
      ? ranked
      : ranked.filter((r) => r.score > 0);

  for (const { doc } of pool) {
    if (retrieved.length >= maxDocs) break;
    if (pinned.has(doc.id)) continue;
    const slice = truncateForPrompt(doc, perDocChars);
    if (used + slice.text.length > budget && retrieved.length > 0) break;
    retrieved.push(slice);
    used += slice.text.length;
    seen.add(doc.id);
  }

  // Always retrieve at least one doc when the library isn't empty.
  if (retrieved.length === 0 && ranked[0]) {
    retrieved.push(truncateForPrompt(ranked[0].doc, Math.min(perDocChars, budget)));
  }

  return { retrieved, catalog, totalLibraryDocs: allDocs.length };
}
