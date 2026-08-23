import type { SourceReference } from '../types';

const SUPER_DIGITS: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};

/** Normalize unicode superscripts (¹ ² ¹⁸) into [n] markers. */
export function normalizeCitationMarkers(content: string): string {
  return content.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => {
    const digits = [...run].map((c) => SUPER_DIGITS[c] ?? '').join('');
    if (!digits) return run;
    const n = parseInt(digits, 10);
    if (!Number.isFinite(n) || n < 1) return run;
    return `[${n}]`;
  });
}

/** Extract 1-based citation numbers from an answer body. */
export function citationNumbersInText(content: string): number[] {
  const normalized = normalizeCitationMarkers(content);
  const found = new Set<number>();
  for (const m of normalized.matchAll(/\[(\d+)\](?!\()/g)) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Build a sources list for the UI from inline [n] markers + any structured
 * sources the model returned. Gaps become placeholder slots the user can resolve.
 */
export function buildCitationSlots(
  content: string,
  sources: SourceReference[] = []
): SourceReference[] {
  const nums = citationNumbersInText(content);
  const maxFromText = nums.length ? Math.max(...nums) : 0;
  const max = Math.max(maxFromText, sources.length);
  if (max === 0) return [];

  const slots: SourceReference[] = [];
  for (let i = 0; i < max; i++) {
    const existing = sources[i];
    slots.push({
      documentId: existing?.documentId ?? '',
      excerpt: existing?.excerpt ?? '',
      relevanceReason: existing?.relevanceReason ?? '',
    });
  }
  return slots;
}

/** Character offset of the Nth (0-based) occurrence of `[citationNumber]`. */
export function citationOffset(
  content: string,
  citationNumber: number,
  occurrence = 0
): number {
  const normalized = normalizeCitationMarkers(content);
  const marker = `[${citationNumber}]`;
  let from = 0;
  let idx = -1;
  for (let i = 0; i <= occurrence; i++) {
    idx = normalized.indexOf(marker, from);
    if (idx < 0) return -1;
    from = idx + marker.length;
  }
  return idx;
}

/**
 * Claim text for a specific occurrence of [n]: the 1–3 sentences immediately
 * preceding that marker (not the first [n] in the answer).
 */
export function claimContextAroundCitation(
  content: string,
  citationNumber: number,
  occurrence = 0
): string {
  const normalized = normalizeCitationMarkers(content);
  const marker = `[${citationNumber}]`;
  const idx = citationOffset(normalized, citationNumber, occurrence);
  if (idx < 0) {
    return normalized.slice(0, Math.min(normalized.length, 400));
  }

  const before = normalized.slice(0, idx).replace(/\s+/g, ' ').trim();
  if (!before) {
    const after = normalized
      .slice(idx + marker.length, idx + marker.length + 220)
      .replace(/\s+/g, ' ')
      .trim();
    return after;
  }

  // Prefer sentence boundaries; fall back to a trailing window.
  const parts = before.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const claim = (parts.length ? parts.slice(-3) : [before.slice(-280)])
    .join(' ')
    .trim();

  // Strip trailing citation markers left from earlier cites in the same sentence.
  return claim.replace(/\s*\[\d+\]\s*$/g, '').trim() || before.slice(-280);
}

export function occurrenceCacheKey(
  citationNumber: number,
  occurrence: number
): string {
  return `${citationNumber}:${occurrence}`;
}
