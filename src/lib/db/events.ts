import type { IIGHEvent, EventType, EventModality, EventLevel } from '../../types';
import { getSupabase, supabaseConfigured } from '../supabase';
import type { EventRow } from './types';
import { upsertWithSchemaFallback } from './upsert';

function toRow(e: IIGHEvent): EventRow {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    date: e.date,
    date_note: e.dateNote,
    type: e.type,
    strategic_purpose: e.strategicPurpose,
    work_package: e.workPackage,
    owner: e.owner,
    partners: e.partners,
    funder: e.funder,
    programme: e.programme,
    location: e.location,
    modality: e.modality,
    level: e.level,
    total_participants: e.totalParticipants,
    countries_represented: e.countriesRepresented,
    global_south_participants: e.globalSouthParticipants,
    global_south_pct: e.globalSouthPct,
    female_participants: e.femaleParticipants,
    female_pct: e.femalePct,
    youth_participants: e.youthParticipants,
    south_south_exchange: e.southSouthExchange,
    key_outputs: e.keyOutputs,
    internal_file_link: e.internalFileLink,
    cross_wp_collaboration: e.crossWpCollaboration,
    website_article: e.websiteArticle,
    media_coverage: e.mediaCoverage,
    social_media: e.socialMedia,
    high_level_participants: e.highLevelParticipants,
    status: e.status,
    staff_count: e.staffCount,
  };
}

function fromRow(row: EventRow): IIGHEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    date: row.date,
    dateNote: row.date_note,
    type: row.type as EventType,
    strategicPurpose: row.strategic_purpose,
    workPackage: row.work_package,
    owner: row.owner,
    partners: row.partners,
    funder: row.funder,
    programme: row.programme,
    location: row.location,
    modality: row.modality as EventModality,
    level: row.level as EventLevel,
    totalParticipants: row.total_participants,
    countriesRepresented: row.countries_represented,
    globalSouthParticipants: row.global_south_participants,
    globalSouthPct: row.global_south_pct,
    femaleParticipants: row.female_participants,
    femalePct: row.female_pct,
    youthParticipants: row.youth_participants,
    southSouthExchange: row.south_south_exchange,
    keyOutputs: row.key_outputs,
    internalFileLink: row.internal_file_link,
    crossWpCollaboration: row.cross_wp_collaboration,
    websiteArticle: row.website_article,
    mediaCoverage: row.media_coverage,
    socialMedia: row.social_media,
    highLevelParticipants: row.high_level_participants,
    status: row.status ?? null,
    staffCount: row.staff_count ?? null,
  };
}

export async function loadEvents(): Promise<IIGHEvent[] | null> {
  if (!supabaseConfigured()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('events').select('*');
  if (error) {
    console.warn('[Nexus] Could not load events from Supabase:', error.message);
    return null;
  }
  return (data ?? []).map(fromRow);
}

/** Full-snapshot sync: upsert everything in `events`, delete anything else. */
export async function syncEvents(events: IIGHEvent[]): Promise<void> {
  if (!supabaseConfigured()) return;
  const sb = getSupabase();
  if (!sb) return;

  if (events.length > 0) {
    const result = await upsertWithSchemaFallback(
      sb,
      'events',
      events.map((e) => toRow(e) as unknown as Record<string, unknown>)
    );
    if (!result.ok) {
      console.warn('[Nexus] Could not sync events to Supabase:', result.error);
      throw new Error(result.error ?? 'events sync failed');
    }
  }

  const { data: existing } = await sb.from('events').select('id');
  const keepIds = new Set(events.map((e) => e.id));
  const staleIds = (existing ?? []).map((r) => r.id).filter((id) => !keepIds.has(id));
  if (staleIds.length > 0) {
    await sb.from('events').delete().in('id', staleIds);
  }
}
