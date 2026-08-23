import type { DirectoryContact, ContactCategory } from '../../types';
import { getSupabase, supabaseConfigured } from '../supabase';
import type { DirectoryContactRow } from './types';

function toRow(c: DirectoryContact): DirectoryContactRow {
  return {
    id: c.id,
    category: c.category,
    name: c.name,
    role: c.role || null,
    team: c.team || null,
    organization: c.organization,
    email: c.email || null,
    phone: c.phone || null,
    country: c.country || null,
    location: c.location || null,
    expertise: c.expertise ?? [],
    tags: c.tags ?? [],
    notes: c.notes || null,
    avatar_initials: c.avatarInitials || null,
    avatar_color: c.avatarColor || null,
  };
}

function fromRow(row: DirectoryContactRow): DirectoryContact {
  return {
    id: row.id,
    category: row.category as ContactCategory,
    name: row.name,
    role: row.role ?? '',
    team: row.team ?? '',
    organization: row.organization,
    email: row.email ?? '',
    phone: row.phone ?? undefined,
    country: row.country ?? undefined,
    location: row.location ?? '',
    expertise: row.expertise ?? [],
    tags: row.tags ?? [],
    notes: row.notes ?? undefined,
    avatarInitials: row.avatar_initials ?? '',
    avatarColor: row.avatar_color ?? '#006EB6',
    projectIds: [],
    documentIds: [],
    recentContributions: [],
  };
}

export async function loadDirectoryContacts(): Promise<DirectoryContact[] | null> {
  if (!supabaseConfigured()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('directory_contacts').select('*').order('name');
  if (error) {
    console.warn('[Nexus] Could not load directory from Supabase:', error.message);
    return null;
  }
  return (data ?? []).map(fromRow);
}

/** Full-snapshot sync: upsert everything in `contacts`, delete anything else. */
export async function syncDirectoryContacts(contacts: DirectoryContact[]): Promise<void> {
  if (!supabaseConfigured()) return;
  const sb = getSupabase();
  if (!sb) return;

  if (contacts.length > 0) {
    const { error } = await sb.from('directory_contacts').upsert(contacts.map(toRow));
    if (error) {
      console.warn('[Nexus] Could not sync directory to Supabase:', error.message);
      return;
    }
  }

  const { data: existing } = await sb.from('directory_contacts').select('id');
  const keepIds = new Set(contacts.map((c) => c.id));
  const staleIds = (existing ?? []).map((r) => r.id).filter((id) => !keepIds.has(id));
  if (staleIds.length > 0) {
    await sb.from('directory_contacts').delete().in('id', staleIds);
  }
}
