import type { Publication } from '../../types';
import { getSupabase, supabaseConfigured } from '../supabase';
import type { PublicationRow } from './types';
import { upsertWithSchemaFallback } from './upsert';

function toRow(p: Publication): PublicationRow {
  return {
    id: p.id,
    title: p.title,
    date: p.date,
    first_author: p.firstAuthor,
    other_authors: p.otherAuthors,
    type: p.type,
    outlet: p.outlet,
    link: p.link,
    doi: p.doi,
    collections_link: p.collectionsLink,
    external_link: p.externalLink,
    url: p.url,
    full_citation: p.fullCitation,
    pelikan_project_id: p.pelikanProjectId,
    in_collections: p.inCollections,
    isbn: p.isbn,
    files: p.files,
    work_package: p.workPackage,
    target_audience: p.targetAudience,
    global_south: p.globalSouth,
    purpose: p.purpose,
  };
}

function fromRow(row: PublicationRow): Publication {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    firstAuthor: row.first_author,
    otherAuthors: row.other_authors,
    type: row.type,
    outlet: row.outlet,
    link: row.link,
    doi: row.doi ?? null,
    collectionsLink: row.collections_link ?? null,
    externalLink: row.external_link ?? null,
    url: row.url ?? null,
    fullCitation: row.full_citation ?? null,
    pelikanProjectId: row.pelikan_project_id ?? null,
    inCollections: row.in_collections ?? null,
    isbn: row.isbn ?? null,
    files: row.files ?? null,
    workPackage: row.work_package,
    targetAudience: row.target_audience,
    globalSouth: row.global_south,
    purpose: row.purpose,
  };
}

export async function loadPublications(): Promise<Publication[] | null> {
  if (!supabaseConfigured()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('publications').select('*');
  if (error) {
    console.warn('[Nexus] Could not load publications from Supabase:', error.message);
    return null;
  }
  return (data ?? []).map(fromRow);
}

/** Full-snapshot sync: upsert everything in `publications`, delete anything else. */
export async function syncPublications(publications: Publication[]): Promise<void> {
  if (!supabaseConfigured()) return;
  const sb = getSupabase();
  if (!sb) return;

  if (publications.length > 0) {
    const result = await upsertWithSchemaFallback(
      sb,
      'publications',
      publications.map((p) => toRow(p) as unknown as Record<string, unknown>)
    );
    if (!result.ok) {
      console.warn('[Nexus] Could not sync publications to Supabase:', result.error);
      throw new Error(result.error ?? 'publications sync failed');
    }
  }

  const { data: existing } = await sb.from('publications').select('id');
  const keepIds = new Set(publications.map((p) => p.id));
  const staleIds = (existing ?? []).map((r) => r.id).filter((id) => !keepIds.has(id));
  if (staleIds.length > 0) {
    await sb.from('publications').delete().in('id', staleIds);
  }
}
