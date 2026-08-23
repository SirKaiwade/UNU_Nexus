import type {
  EventLevel,
  EventModality,
  EventType,
  IIGHEvent,
  Publication,
} from '../types';

/**
 * Shared spreadsheet → records logic for events / publications mastersheets.
 * Supports .xlsx via the browser xlsx reader — formats match the institutional
 * workbooks staff already maintain (2023–2025 publications, 2025 events matrix).
 */

export type Cell = string | number | boolean | Date | null | undefined;

export interface SheetTable {
  name: string;
  rows: Cell[][];
}

export interface ParseResult {
  events: IIGHEvent[];
  publications: Publication[];
  skippedSheets: string[];
}

const DEFAULT_YEAR = 2026;

// ---------- primitives ----------

function cellText(c: Cell): string | null {
  if (c == null) return null;
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  const s = String(c).replace(/\r\n/g, '\n').trim();
  return s.length ? s : null;
}

function cellNumber(c: Cell): number | null {
  if (typeof c === 'number' && Number.isFinite(c)) return c;
  const s = cellText(c);
  if (!s) return null;
  const n = parseFloat(s.replace(/[,%~]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function yesNo(c: Cell): boolean | null {
  const s = cellText(c);
  if (!s) return null;
  if (/^y/i.test(s)) return true;
  if (/^n/i.test(s)) return false;
  return null;
}

function percent(c: Cell): number | null {
  const n = cellNumber(c);
  if (n == null) return null;
  if (n <= 1) return Math.round(n * 100);
  if (n <= 100) return Math.round(n);
  return null;
}

function hashId(prefix: string, key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  }
  return `${prefix}-${(h >>> 0).toString(36)}`;
}

// ---------- dates ----------

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function excelSerialToISO(n: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Free-text / sheet dates: "20 January 2026", "22/2/2025", "20-01-2025",
 * "2023-12", "20-21-February-2025", Excel serials, Date objects.
 */
function parseTextDate(raw: string): string | null {
  const s = raw.trim();

  // yyyy-mm-dd or yyyy-mm (month-only → day 1)
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = m[3] ? parseInt(m[3], 10) : 1;
    if (mo >= 0 && mo <= 11 && d >= 1 && d <= 31) return toISO(y, mo, d);
  }

  // d/m/y or d-m-y (numeric)
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    if (mo >= 0 && mo <= 11 && d >= 1 && d <= 31) return toISO(y, mo, d);
  }
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    // Prefer d-m-y when day > 12; otherwise still treat as d-m-y (institutional sheets use DMY)
    if (mo >= 0 && mo <= 11 && d >= 1 && d <= 31) return toISO(y, mo, d);
  }

  // "20-21-February-2025" / "20 January 2026" / "27-29 January 2026"
  m = s.match(
    /(\d{1,2})(?:\s*[-–—]\s*\d{1,2})?[-\s]+([A-Za-z]{3,})[.\s,]*[-]?(\d{2,4})?/
  );
  if (m) {
    const day = parseInt(m[1], 10);
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (month != null && day >= 1 && day <= 31) {
      let year = m[3] ? parseInt(m[3], 10) : DEFAULT_YEAR;
      if (year < 100) year += 2000;
      return toISO(year, month, day);
    }
  }

  return null;
}

export function parseDateCell(c: Cell): { date: string | null; note: string | null } {
  if (c == null) return { date: null, note: null };
  if (c instanceof Date) {
    // Avoid timezone shift: use UTC date parts from the Date value Excel gave us
    const y = c.getFullYear();
    const mo = c.getMonth();
    const d = c.getDate();
    // If the Date was parsed as UTC midnight from ISO, getUTC* is safer
    if (
      c.getUTCHours() === 0 &&
      c.getUTCMinutes() === 0 &&
      c.getHours() !== 0
    ) {
      return {
        date: toISO(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()),
        note: null,
      };
    }
    return { date: toISO(y, mo, d), note: null };
  }
  if (typeof c === 'number') {
    if (c > 20000 && c < 60000) return { date: excelSerialToISO(c), note: null };
    return { date: null, note: String(c) };
  }
  const s = cellText(c);
  if (!s) return { date: null, note: null };
  const parsed = parseTextDate(s);
  const postponed = /postpon|tba|tbc/i.test(s);
  return {
    date: postponed ? null : parsed,
    note:
      parsed && !postponed && /^\d{4}-\d{2}-\d{2}$/.test(s)
        ? null
        : parsed && !postponed && /^\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*$/.test(s)
          ? null
          : parsed
            ? null
            : s,
  };
}

// ---------- normalizers ----------

export function normalizeEventType(c: Cell): EventType {
  const s = cellText(c)?.toLowerCase() ?? '';
  if (!s) return 'Other';
  if (s.includes('side')) return 'Side event';
  if (s.includes('conference') || s.includes('symposium')) return 'Conference / Symposium';
  if (s.includes('webinar') || s.includes('seminar')) return 'Webinar / Seminar';
  if (s.includes('workshop') || s.includes('capacity') || s.includes('training'))
    return 'Workshop / Capacity strengthening';
  if (
    s.includes('policy') ||
    s.includes('high-level') ||
    s.includes('dialogue') ||
    s.includes('panel')
  )
    return 'Policy dialogue / High-level dialogue';
  if (s.includes('consultation') || s.includes('roundtable'))
    return 'Consultation / Roundtable';
  if (
    s.includes('coordination') ||
    s.includes('partnership') ||
    s.includes('collaboration')
  )
    return 'Coordination / Partnership meeting';
  return 'Other';
}

export function normalizeModality(c: Cell): EventModality {
  const s = cellText(c)?.toLowerCase() ?? '';
  if (s.includes('hybrid')) return 'Hybrid';
  if (s.includes('virtual') || s.includes('online')) return 'Virtual';
  if (s.includes('person')) return 'In person';
  return 'Unspecified';
}

export function normalizeLevel(c: Cell): EventLevel {
  const s = cellText(c)?.toLowerCase() ?? '';
  if (s.includes('sub')) return 'Sub-national';
  if (s.includes('global') || s.includes('international')) return 'Global';
  if (s.includes('regional')) return 'Regional';
  if (s.includes('national')) return 'National';
  return 'Unspecified';
}

/** Map sheet labels onto the institutional publication type key. */
export function normalizePubType(c: Cell): string | null {
  const raw = cellText(c);
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim();

  const exact: Record<string, string> = {
    'journal article': 'Journal article',
    'articles - journal article': 'Journal article',
    'comment - journal article': 'Op-ed / Commentary',
    'policy brief': 'Policy brief',
    'policy briefs': 'Policy brief',
    'research report': 'Research report',
    'research reports': 'Research report',
    'briefing paper': 'Briefing paper',
    'briefing notes': 'Briefing paper',
    'briefing note': 'Briefing paper',
    'technical report': 'Technical report',
    'working paper': 'Working paper',
    'guidance note': 'Guidance note',
    'position paper': 'Position paper',
    'meeting report': 'Meeting report',
    'evidence synthesis / review': 'Evidence synthesis / Review',
    'case study': 'Case study',
    'op-ed': 'Op-ed / Commentary',
    'op-ed / commentary': 'Op-ed / Commentary',
    commentary: 'Op-ed / Commentary',
    'website article': 'Website article',
    'articles - website article': 'Website article',
    'book chapter': 'Book chapter',
    'edited volume': 'Edited volume',
    'toolkit / framework': 'Toolkit / Framework',
    'policy submission': 'Policy submission',
  };
  if (exact[s]) return exact[s];

  if (s.includes('journal')) return 'Journal article';
  if (s.includes('website')) return 'Website article';
  if (s.includes('policy brief')) return 'Policy brief';
  if (s.includes('research report')) return 'Research report';
  if (s.includes('briefing')) return 'Briefing paper';
  if (s.includes('meeting report')) return 'Meeting report';
  if (s.includes('op-ed') || s.includes('commentary') || s.includes('comment'))
    return 'Op-ed / Commentary';
  if (s.includes('book chapter')) return 'Book chapter';
  if (s.includes('case study')) return 'Case study';

  // Keep unknown labels so nothing is lost on import
  return raw.trim();
}

// ---------- header mapping ----------

function normHeader(c: Cell): string {
  return (cellText(c) ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function colIndex(headers: string[], ...needles: string[]): number {
  for (const needle of needles) {
    const i = headers.findIndex((h) => h.includes(needle));
    if (i !== -1) return i;
  }
  return -1;
}

/** Prefer exact header equality, then fall back to substring match. */
function colIndexPreferExact(headers: string[], ...needles: string[]): number {
  for (const needle of needles) {
    const i = headers.findIndex((h) => h === needle);
    if (i !== -1) return i;
  }
  return colIndex(headers, ...needles);
}

export function findHeaderRow(rows: Cell[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const headers = rows[i].map(normHeader);
    const nonEmpty = headers.filter(Boolean).length;
    if (nonEmpty < 3) continue;
    const looksLikeHeader =
      headers.some((h) =>
        [
          'title',
          'event name',
          'event title',
          'year-month-day',
          'first author',
          'publication type',
          'focal point',
        ].some((n) => h.includes(n))
      ) || nonEmpty >= 5;
    if (looksLikeHeader) return i;
  }
  return -1;
}

// ---------- events ----------

export function parseEventsSheet(rows: Cell[][], headerRow: number): IIGHEvent[] {
  const headers = rows[headerRow].map(normHeader);
  const col = {
    date: colIndex(headers, 'year-month-day', 'date'),
    title: colIndex(headers, 'event title', 'event name', 'title'),
    description: colIndex(headers, 'event description', 'description'),
    type: colIndex(headers, 'event type'),
    purpose: colIndex(headers, 'strategic purpose'),
    workPackage: colIndex(headers, 'work package', 'team'),
    owner: colIndex(headers, 'event owner', 'focal point', 'owner'),
    partners: colIndex(headers, 'organizer', 'partners', 'co-convenors'),
    funder: colIndex(headers, 'sponsor', 'funder', 'donor'),
    programme: colIndex(headers, 'under overall unu', 'programme', 'flagship'),
    location: colIndex(headers, 'city, country', 'city', 'location'),
    modality: colIndex(headers, 'in person/virtual/hybrid', 'modality'),
    level: colIndex(headers, 'event level', 'level'),
    total: colIndex(headers, 'total participants'),
    staff: colIndex(headers, 'number of iigh staff', 'number of staff'),
    countries: colIndex(headers, 'countries represented'),
    gsCount: colIndex(headers, 'number of participants from global south'),
    gsPct: colIndex(headers, '% participants from global south'),
    gsCollab: colIndex(headers, 'global south collaboration'),
    femaleCount: colIndex(headers, 'number of female participants'),
    femalePct: colIndex(headers, '% female participants'),
    youth: colIndex(headers, 'youth participants'),
    southSouth: colIndex(headers, 'south-south'),
    outputs: colIndex(headers, 'key outputs', 'impact of policy'),
    fileLink: colIndex(headers, 'internal file link'),
    crossWp: colIndex(headers, 'cross-wp'),
    website: colIndex(headers, 'website article'),
    media: colIndex(headers, 'media coverage'),
    social: colIndex(headers, 'social media'),
    highLevel: colIndex(headers, 'high-level participants'),
    status: colIndex(headers, 'status'),
  };

  const get = (row: Cell[], i: number): Cell => (i >= 0 ? row[i] : null);
  const events: IIGHEvent[] = [];

  for (const row of rows.slice(headerRow + 1)) {
    const title = cellText(get(row, col.title));
    if (!title) continue;
    const { date, note } = parseDateCell(get(row, col.date));
    const total = cellNumber(get(row, col.total));
    const southSouth =
      yesNo(get(row, col.southSouth)) ?? yesNo(get(row, col.gsCollab));

    events.push({
      id: hashId('ev', `${title.toLowerCase()}|${date ?? note ?? ''}`),
      title,
      description: cellText(get(row, col.description)),
      date,
      dateNote: note,
      type: normalizeEventType(get(row, col.type)),
      strategicPurpose: cellText(get(row, col.purpose)),
      workPackage: cellText(get(row, col.workPackage)),
      owner: cellText(get(row, col.owner)),
      partners: cellText(get(row, col.partners)),
      funder: cellText(get(row, col.funder)),
      programme: cellText(get(row, col.programme)),
      location: cellText(get(row, col.location)),
      modality: normalizeModality(get(row, col.modality)),
      level: normalizeLevel(get(row, col.level)),
      totalParticipants: total,
      countriesRepresented: cellText(get(row, col.countries)),
      globalSouthParticipants: cellNumber(get(row, col.gsCount)),
      globalSouthPct: percent(get(row, col.gsPct)),
      femaleParticipants: cellNumber(get(row, col.femaleCount)),
      femalePct: percent(get(row, col.femalePct)),
      youthParticipants: cellNumber(get(row, col.youth)),
      southSouthExchange: southSouth,
      keyOutputs: cellText(get(row, col.outputs)),
      internalFileLink: cellText(get(row, col.fileLink)),
      crossWpCollaboration: cellText(get(row, col.crossWp)),
      websiteArticle: cellText(get(row, col.website)),
      mediaCoverage: cellText(get(row, col.media)),
      socialMedia: cellText(get(row, col.social)),
      highLevelParticipants: cellText(get(row, col.highLevel)),
      status: cellText(get(row, col.status)),
      staffCount: cellNumber(get(row, col.staff)),
    });
  }
  return events;
}

// ---------- publications ----------

export function parsePublicationsSheet(rows: Cell[][], headerRow: number): Publication[] {
  const headers = rows[headerRow].map(normHeader);
  const col = {
    date: colIndex(headers, 'year-month-day', 'date'),
    title: colIndexPreferExact(headers, 'title'),
    firstAuthor: colIndex(headers, 'first author'),
    otherAuthors: colIndex(headers, 'other authors'),
    // Prefer the leftmost "publication type" (2023–24 has two)
    type: colIndex(headers, 'publication type', 'type'),
    outlet: colIndex(headers, 'publication name', 'outlet', 'publisher'),
    doi: colIndex(headers, 'full doi', 'doi'),
    collectionsLink: colIndex(headers, 'unu collections', 'collections link'),
    external: colIndex(headers, 'external link'),
    url: colIndexPreferExact(headers, 'url'),
    link: colIndexPreferExact(headers, 'link'),
    fullCitation: colIndex(headers, 'full citation'),
    comments: colIndex(headers, 'comments'),
    purpose: colIndexPreferExact(headers, 'purpose'),
    pelikan: colIndex(headers, 'pelikan'),
    // Exact "collections" — not "unu collections link"
    inCollections: headers.findIndex((h) => h === 'collections'),
    isbn: colIndex(headers, 'isbn'),
    files: colIndexPreferExact(headers, 'files'),
    workPackage: colIndex(headers, 'work package'),
    audience: colIndex(headers, 'target audience'),
    globalSouth: colIndex(headers, 'global south'),
  };

  const get = (row: Cell[], i: number): Cell => (i >= 0 ? row[i] : null);
  const pubs: Publication[] = [];

  for (const row of rows.slice(headerRow + 1)) {
    const title = cellText(get(row, col.title))?.replace(/\n+/g, ' ');
    if (!title) continue;
    // Skip accidental header repeats mid-sheet
    if (/^title$/i.test(title)) continue;

    const { date, note } = parseDateCell(get(row, col.date));
    const doi = cellText(get(row, col.doi));
    const collectionsLink = cellText(get(row, col.collectionsLink));
    const externalLink = cellText(get(row, col.external));
    const url = cellText(get(row, col.url));
    const link =
      doi ||
      externalLink ||
      url ||
      cellText(get(row, col.link)) ||
      collectionsLink;

    pubs.push({
      id: hashId('pub', `${title.toLowerCase()}|${date ?? note ?? ''}`),
      title,
      date,
      firstAuthor: cellText(get(row, col.firstAuthor))?.replace(/\n+/g, ', ') ?? null,
      otherAuthors: cellText(get(row, col.otherAuthors))?.replace(/\n+/g, ', ') ?? null,
      type: normalizePubType(get(row, col.type)),
      outlet: cellText(get(row, col.outlet)),
      link,
      doi,
      collectionsLink,
      externalLink,
      url,
      fullCitation: cellText(get(row, col.fullCitation)),
      pelikanProjectId: cellText(get(row, col.pelikan)),
      inCollections: yesNo(get(row, col.inCollections)),
      isbn: cellText(get(row, col.isbn)),
      files: cellText(get(row, col.files)),
      workPackage: cellText(get(row, col.workPackage)),
      targetAudience: cellText(get(row, col.audience)),
      globalSouth: yesNo(get(row, col.globalSouth)),
      purpose: cellText(get(row, col.purpose)) ?? cellText(get(row, col.comments)),
    });
  }
  return pubs;
}

// ---------- entry point ----------

function filledFieldCount(record: object): number {
  return Object.values(record).filter((v) => v != null && v !== '').length;
}

function dedupeById<T extends { id: string }>(records: T[]): T[] {
  const byId = new Map<string, T>();
  for (const r of records) {
    const existing = byId.get(r.id);
    if (!existing || filledFieldCount(r) > filledFieldCount(existing)) {
      byId.set(r.id, r);
    }
  }
  return [...byId.values()];
}

export function parseTables(tables: SheetTable[]): ParseResult {
  const result: ParseResult = { events: [], publications: [], skippedSheets: [] };

  for (const table of tables) {
    const headerRow = findHeaderRow(table.rows);
    if (headerRow === -1) {
      result.skippedSheets.push(table.name);
      continue;
    }
    const headers = table.rows[headerRow].map(normHeader);

    const isEvents =
      headers.some((h) => h.includes('event title') || h.includes('event name')) ||
      (headers.some((h) => h.includes('event type')) &&
        headers.some(
          (h) =>
            h.includes('year-month-day') ||
            h === 'date' ||
            h.includes('focal point')
        ));

    const isPubs =
      !isEvents &&
      headers.some((h) => h === 'title' || h.endsWith(' title') || h.includes('title')) &&
      (headers.some((h) => h.includes('publication type')) ||
        headers.some((h) => h.includes('first author')) ||
        headers.some((h) => h.includes('publication name')) ||
        headers.some((h) => h.includes('full doi')));

    if (isEvents) {
      result.events.push(...parseEventsSheet(table.rows, headerRow));
    } else if (isPubs) {
      result.publications.push(...parsePublicationsSheet(table.rows, headerRow));
    } else {
      result.skippedSheets.push(table.name);
    }
  }

  result.events = dedupeById(result.events);
  result.publications = dedupeById(result.publications);
  return result;
}
