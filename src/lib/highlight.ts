// Locate a near-verbatim excerpt inside a longer document text.
//
// The model is instructed to return verbatim quotes, but real-world matches
// trip on smart quotes, ellipses ("…"), em dashes, soft hyphens, line-break
// hyphenation, and run-together whitespace from PDF extraction. So we layer
// four strategies, returning the original-text byte range for the first hit:
//
//   1. Exact case-insensitive substring match.
//   2. Normalised match (collapse whitespace, drop punctuation/quotes/ellipses,
//      lowercase) with a position map back to the original string.
//   3. Shingle fallback: try the first ~60 normalised chars of the excerpt.
//   4. Paraphrase fallback: score sentence windows by significant-word overlap.
//
// Returns null when nothing plausible matches.

export type HighlightMatchKind = 'exact' | 'normalised' | 'partial' | 'paraphrase';

export interface HighlightResult {
  start: number;
  end: number;
  kind: HighlightMatchKind;
}

interface Normalised {
  text: string;
  map: number[]; // map[i] = original index of normalised char i
}

const PUNCT = /[—–\-‘’'"…“”„‚`´]/;

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'that',
  'this', 'these', 'those', 'it', 'its', 'they', 'their', 'them', 'we',
  'our', 'you', 'your', 'he', 'she', 'his', 'her', 'not', 'no', 'than',
  'then', 'also', 'into', 'over', 'such', 'other', 'which', 'who', 'whom',
]);

function normalise(s: string): Normalised {
  const out: string[] = [];
  const map: number[] = [];
  let lastSpace = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) {
      if (!lastSpace && out.length > 0) {
        out.push(' ');
        map.push(i);
        lastSpace = true;
      }
      continue;
    }
    if (PUNCT.test(c)) continue;
    out.push(c.toLowerCase());
    map.push(i);
    lastSpace = false;
  }
  while (out.length && out[out.length - 1] === ' ') {
    out.pop();
    map.pop();
  }
  return { text: out.join(''), map };
}

function trimEllipses(s: string): string {
  return s
    .replace(/^[\s….]+/, '')
    .replace(/[\s….]+$/, '')
    .trim();
}

function trimRange(text: string, range: { start: number; end: number }): HighlightResult {
  let { start, end } = range;
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return { start, end, kind: 'paraphrase' };
}

function extractWords(s: string): string[] {
  const matches = s.toLowerCase().match(/[a-z][a-z0-9]{2,}/g);
  return matches ? matches.filter((w) => !STOP_WORDS.has(w)) : [];
}

function scoreSpan(text: string, start: number, end: number, queryWords: string[]): number {
  const chunkWords = new Set(extractWords(text.slice(start, end)));
  if (chunkWords.size === 0) return 0;
  const hits = queryWords.filter((w) => chunkWords.has(w)).length;
  return hits / queryWords.length;
}

function sentenceSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const re = /[^.!?\n]+[.!?]?[\s\n]*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[0].trim().length >= 20) {
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  if (spans.length === 0 && text.trim().length > 0) {
    spans.push({ start: 0, end: text.length });
  }
  return spans;
}

function findParaphraseHighlight(text: string, query: string): HighlightResult | null {
  const queryWords = [...new Set(extractWords(query))];
  if (queryWords.length < 2) return null;

  const spans = sentenceSpans(text);
  let best: { start: number; end: number; score: number } | null = null;

  const candidates: Array<{ start: number; end: number }> = [...spans];
  for (let i = 0; i < spans.length - 1; i++) {
    candidates.push({ start: spans[i].start, end: spans[i + 1].end });
  }
  for (let i = 0; i < spans.length - 2; i++) {
    candidates.push({ start: spans[i].start, end: spans[i + 2].end });
  }

  for (const span of candidates) {
    const score = scoreSpan(text, span.start, span.end, queryWords);
    const threshold = queryWords.length <= 3 ? 0.5 : 0.4;
    if (score >= threshold && (!best || score > best.score)) {
      best = { ...span, score };
    }
  }

  if (!best) return null;
  return trimRange(text, best);
}

export function findHighlight(
  text: string,
  query: string | undefined | null
): HighlightResult | null {
  if (!text || !query) return null;
  const cleanQ = trimEllipses(query);
  if (cleanQ.length < 6) return null;

  const lowerText = text.toLowerCase();
  const lowerQ = cleanQ.toLowerCase();
  const direct = lowerText.indexOf(lowerQ);
  if (direct >= 0) {
    return { start: direct, end: direct + cleanQ.length, kind: 'exact' };
  }

  const T = normalise(text);
  const Q = normalise(cleanQ);
  if (Q.text.length < 6) return null;

  const idx = T.text.indexOf(Q.text);
  if (idx >= 0) {
    const start = T.map[idx];
    const end = T.map[idx + Q.text.length - 1] + 1;
    return { start, end, kind: 'normalised' };
  }

  // Shingle fallback: try the first ~60 normalised chars (or full query if shorter).
  const headLen = Math.min(Q.text.length, 60);
  if (headLen >= 12) {
    const head = Q.text.slice(0, headLen);
    const headIdx = T.text.indexOf(head);
    if (headIdx >= 0) {
      const start = T.map[headIdx];
      const headEndNormalised = headIdx + head.length;
      const stretch = Math.min(
        T.text.length - 1,
        headEndNormalised + (Q.text.length - head.length)
      );
      const end = T.map[stretch] + 1;
      return { start, end, kind: 'partial' };
    }
  }

  return findParaphraseHighlight(text, cleanQ);
}
