import type { EventType, IIGHEvent } from '../types';
import { createRecordsStore } from '../lib/recordsStore';

/** Events start empty — staff upload or import the matrix in-app. Synced via Supabase. */
export const eventsSeed: IIGHEvent[] = [];

export const eventsStore = createRecordsStore<IIGHEvent>('nexus:events-v2', eventsSeed);

export const EVENT_TYPES: EventType[] = [
  'Conference / Symposium',
  'Webinar / Seminar',
  'Workshop / Capacity strengthening',
  'Policy dialogue / High-level dialogue',
  'Consultation / Roundtable',
  'Coordination / Partnership meeting',
  'Side event',
  'Other',
];

export const EVENT_TYPE_DEFINITIONS: Record<EventType, string> = {
  'Conference / Symposium':
    'Large-scale, multi-session convenings bringing together broad stakeholders to present, exchange, and debate research, policy, or practice across a theme.',
  'Webinar / Seminar':
    'Structured knowledge-sharing events focused on a specific topic, featuring curated presentations and discussion.',
  'Workshop / Capacity strengthening':
    'Activities designed to strengthen skills or competencies through structured learning objectives and exercises. Includes MOOCs, trainings, short courses, bootcamps, and masterclasses.',
  'Policy dialogue / High-level dialogue':
    'Structured discussions aimed at informing, shaping, or advancing policy or strategic direction, often involving decision-makers. Includes policy dialogues, high-level dialogues, and ministerial roundtables.',
  'Consultation / Roundtable':
    'Targeted, interactive discussions to solicit input, advice, or validation from experts or stakeholders. Includes stakeholder consultations, expert consultations, and roundtables.',
  'Coordination / Partnership meeting':
    'Closed or semi-closed meetings focused on coordination, governance, planning, or management of collaborations or projects. Includes collaboration, partner, and steering committee meetings.',
  'Side event':
    'Events organised alongside major conferences or intergovernmental processes to highlight specific issues or initiatives. Includes UNGA, WHA, WHS, and COP side events.',
  Other: 'Events that do not fit the standard categories.',
};

export function getEvent(id: string): IIGHEvent | undefined {
  return eventsStore.get().find((e) => e.id === id);
}

/** Sortable key: parsed date first, otherwise push to the end. */
export function eventSortKey(e: IIGHEvent): string {
  return e.date ?? '9999-12-31';
}
