export type DocumentType =
  | 'Report'
  | 'Concept note'
  | 'Policy brief'
  | 'Meeting notes'
  | 'Working paper'
  | 'Dataset'
  | 'Presentation'
  | 'Evaluation'
  | 'Guidance'
  | 'Email thread';

export type DocStatus = 'draft' | 'active' | 'archived';

export type Freshness = 'Current' | 'Possibly outdated' | 'Archived';

export type Region =
  | 'Global'
  | 'Southeast Asia'
  | 'Western Pacific'
  | 'Africa'
  | 'Americas'
  | 'Eastern Mediterranean'
  | 'Europe';

export type ProjectStatus = 'Active' | 'Completed' | 'Paused' | 'Scoping';

export interface KnowledgeDocument {
  id: string;
  title: string;
  type: DocumentType;
  topics: string[];
  region: Region;
  team: string;
  ownerId: string;
  createdAt: string; // ISO date
  updatedAt: string;
  status: DocStatus;
  freshness: Freshness;
  summary: string;
  takeaways: string[];
  relatedProjectIds: string[];
  relatedDocIds: string[];
  relatedPeopleIds: string[];
  relevantQuestions: string[];
  notes?: string;
  excerpt?: string;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  team: string;
  expertise: string[];
  projectIds: string[];
  documentIds: string[];
  recentContributions: { title: string; date: string }[];
  email: string;
  location: string;
  avatarInitials: string;
  avatarColor: string;
}

export type ContactCategory = 'unu' | 'government' | 'ngo' | 'partner' | 'other';

export interface DirectoryContact extends Person {
  category: ContactCategory;
  organization: string;
  country?: string;
  phone?: string;
  tags?: string[];
  notes?: string;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  overview: string;
  region: Region;
  startDate: string;
  endDate?: string;
  leadId: string;
  teamMemberIds: string[];
  documentIds: string[];
  decisions: { title: string; date: string; note: string }[];
  openQuestions: string[];
  lessonsLearned: string[];
  risks: { label: string; severity: 'low' | 'medium' | 'high' }[];
  outputs: { title: string; type: string; date: string }[];
  relatedProjectIds: string[];
  reusableMaterial: string[];
}

export type EventType =
  | 'Conference / Symposium'
  | 'Webinar / Seminar'
  | 'Workshop / Capacity strengthening'
  | 'Policy dialogue / High-level dialogue'
  | 'Consultation / Roundtable'
  | 'Coordination / Partnership meeting'
  | 'Side event'
  | 'Other';

export type EventModality = 'In person' | 'Virtual' | 'Hybrid' | 'Unspecified';

export type EventLevel =
  | 'Global'
  | 'Regional'
  | 'National'
  | 'Sub-national'
  | 'Unspecified';

export interface IIGHEvent {
  id: string;
  title: string;
  description: string | null;
  /** ISO date (yyyy-mm-dd) when the sheet had a parseable date. */
  date: string | null;
  /** Original date text when it couldn't be parsed (e.g. "5-7 May (postponed-TBA)"). */
  dateNote: string | null;
  type: EventType;
  strategicPurpose: string | null;
  workPackage: string | null;
  owner: string | null;
  partners: string | null;
  funder: string | null;
  programme: string | null;
  location: string | null;
  modality: EventModality;
  level: EventLevel;
  totalParticipants: number | null;
  countriesRepresented: string | null;
  globalSouthParticipants: number | null;
  /** 0–100 */
  globalSouthPct: number | null;
  femaleParticipants: number | null;
  /** 0–100 */
  femalePct: number | null;
  youthParticipants: number | null;
  southSouthExchange: boolean | null;
  keyOutputs: string | null;
  internalFileLink: string | null;
  crossWpCollaboration: string | null;
  websiteArticle: string | null;
  mediaCoverage: string | null;
  socialMedia: string | null;
  highLevelParticipants: string | null;
  /** Matrix “Status” column. */
  status: string | null;
  /** Matrix “Number of IIGH Staff”. */
  staffCount: number | null;
}

export interface Publication {
  id: string;
  title: string;
  /** ISO date (yyyy-mm-dd) when known. */
  date: string | null;
  firstAuthor: string | null;
  otherAuthors: string | null;
  type: string | null;
  outlet: string | null;
  /** Best openable URL (DOI → external → URL → collections). */
  link: string | null;
  doi: string | null;
  collectionsLink: string | null;
  externalLink: string | null;
  url: string | null;
  fullCitation: string | null;
  pelikanProjectId: string | null;
  /** Sheet “Collections” YES/NO. */
  inCollections: boolean | null;
  isbn: string | null;
  files: string | null;
  workPackage: string | null;
  targetAudience: string | null;
  globalSouth: boolean | null;
  /** Purpose / Comments from the sheet. */
  purpose: string | null;
}

export interface SourceReference {
  documentId: string;
  /** Verbatim quote — may be empty until the user asks Nexus to produce it. */
  excerpt: string;
  relevanceReason: string;
}

