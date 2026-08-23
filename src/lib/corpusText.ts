import type { IIGHEvent, Publication } from '../types';
import { formatDate } from './format';

/**
 * Plain-text renderings of events and publications. The same text is fed to
 * the Nexus model as corpus entries and shown in the document viewer, so
 * verbatim excerpts cited by the model can always be located and highlighted.
 */

function line(label: string, value: string | number | boolean | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return `${label}: ${value ? 'Yes' : 'No'}`;
  return `${label}: ${value}`;
}

export function eventDateLabel(e: IIGHEvent): string {
  if (e.date) return formatDate(e.date);
  if (e.dateNote) return e.dateNote;
  return 'Date TBC';
}

export function eventToText(e: IIGHEvent): string {
  const parts = [
    `Event: ${e.title}`,
    line('Date', eventDateLabel(e)),
    line('Type', e.type),
    line('Work package', e.workPackage),
    line('Strategic purpose', e.strategicPurpose),
    line('Owner', e.owner),
    line('Location', e.location),
    line('Modality', e.modality === 'Unspecified' ? null : e.modality),
    line('Event level', e.level === 'Unspecified' ? null : e.level),
    line('Partners / co-convenors', e.partners),
    line('Funder / donor', e.funder),
    line('Programme / flagship', e.programme),
    line('Total participants', e.totalParticipants),
    line('Countries represented', e.countriesRepresented),
    line('Participants from the Global South', e.globalSouthParticipants),
    line('% Global South', e.globalSouthPct != null ? `${e.globalSouthPct}%` : null),
    line('Female participants', e.femaleParticipants),
    line('% female', e.femalePct != null ? `${e.femalePct}%` : null),
    line('Youth participants', e.youthParticipants),
    line('South-South exchange component', e.southSouthExchange),
    line('Cross-WP collaboration', e.crossWpCollaboration),
    line('High-level participants', e.highLevelParticipants),
    line('Website article', e.websiteArticle),
    line('Media coverage', e.mediaCoverage),
    line('Social media', e.socialMedia),
    line('Status', e.status),
    line('IIGH staff count', e.staffCount),
  ].filter(Boolean);

  if (e.description) parts.push(`\nDescription:\n${e.description}`);
  if (e.keyOutputs) parts.push(`\nKey outputs:\n${e.keyOutputs}`);
  return parts.join('\n');
}

export function publicationToText(p: Publication): string {
  const parts = [
    `Publication: ${p.title}`,
    line('Date', p.date ? formatDate(p.date) : null),
    line('First author', p.firstAuthor),
    line('Other authors', p.otherAuthors),
    line('Publication type', p.type),
    line('Outlet / publisher', p.outlet),
    line('Full citation', p.fullCitation),
    line('DOI', p.doi),
    line('UNU Collections link', p.collectionsLink),
    line('External link', p.externalLink),
    line('URL', p.url),
    line('Link', p.link),
    line('In UNU Collections', p.inCollections),
    line('ISBN', p.isbn),
    line('Files', p.files),
    line('Pelikan project ID', p.pelikanProjectId),
    line('Work package', p.workPackage),
    line('Target audience', p.targetAudience),
    line('Global South focus', p.globalSouth),
    line('Comments / purpose', p.purpose),
  ].filter(Boolean);
  return parts.join('\n');
}
