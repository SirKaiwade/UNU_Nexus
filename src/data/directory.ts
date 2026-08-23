import type { ContactCategory, DirectoryContact } from '../types';
import { createRecordsStore } from '../lib/recordsStore';

export const CATEGORY_LABELS: Record<ContactCategory, string> = {
  unu: 'UNU Directory',
  government: 'Government',
  ngo: 'NGO',
  partner: 'Partners',
  other: 'Other',
};

// No contacts ship by default — directory starts empty. Staff add contacts in
// the Directory page; rows sync to Supabase when configured.
export const directorySeed: DirectoryContact[] = [];

export const directoryStore = createRecordsStore<DirectoryContact>(
  'nexus:directory-v2',
  directorySeed
);

export function getContact(id: string): DirectoryContact | undefined {
  return directoryStore.get().find((c) => c.id === id);
}

export function getContactsByCategory(
  category: ContactCategory | 'all',
  contacts: DirectoryContact[] = directoryStore.get()
): DirectoryContact[] {
  if (category === 'all') return contacts;
  return contacts.filter((c) => c.category === category);
}

export function searchContacts(
  contacts: DirectoryContact[],
  query: string
): DirectoryContact[] {
  const q = query.trim().toLowerCase();
  if (!q) return contacts;
  return contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.organization.toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q) ||
      c.expertise.some((e) => e.toLowerCase().includes(q)) ||
      (c.country?.toLowerCase().includes(q) ?? false) ||
      (c.tags?.some((t) => t.toLowerCase().includes(q)) ?? false)
  );
}

export function countByCategory(
  contacts: DirectoryContact[] = directoryStore.get()
): Record<ContactCategory | 'all', number> {
  const counts: Record<ContactCategory | 'all', number> = {
    all: contacts.length,
    unu: 0,
    government: 0,
    ngo: 0,
    partner: 0,
    other: 0,
  };
  for (const c of contacts) {
    counts[c.category] += 1;
  }
  return counts;
}
