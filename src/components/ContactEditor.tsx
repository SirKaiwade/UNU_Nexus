import { useState } from 'react';
import type { ContactCategory, DirectoryContact } from '../types';
import { CATEGORY_LABELS } from '../data/directory';
import { initialsFromName, makeRecordId } from '../lib/recordId';
import { emptyContact } from '../lib/recordTemplates';
import RecordFormModal, {
  FormField,
  nullIfEmpty,
  selectInput,
  splitList,
  textArea,
  textInput,
} from './RecordFormModal';

const CATEGORIES: ContactCategory[] = ['unu', 'government', 'ngo', 'partner', 'other'];

interface Props {
  initial?: DirectoryContact;
  onClose: () => void;
  onSave: (record: DirectoryContact) => void;
}

export default function ContactEditor({ initial, onClose, onSave }: Props) {
  const isNew = !initial;
  const [draft, setDraft] = useState<DirectoryContact>(initial ?? emptyContact());
  const [expertiseText, setExpertiseText] = useState(
    (initial?.expertise ?? []).join(', ')
  );
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(', '));

  function set<K extends keyof DirectoryContact>(key: K, value: DirectoryContact[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function handleSave() {
    const name = draft.name.trim();
    if (!name) return;
    const id =
      draft.id ||
      makeRecordId('dir', `${draft.category}|${name.toLowerCase()}`);
    onSave({
      ...draft,
      id,
      name,
      role: draft.role.trim(),
      team: draft.team.trim(),
      organization: draft.organization.trim(),
      email: draft.email.trim(),
      location: draft.location.trim(),
      country: nullIfEmpty(draft.country ?? '') ?? undefined,
      phone: nullIfEmpty(draft.phone ?? '') ?? undefined,
      notes: nullIfEmpty(draft.notes ?? '') ?? undefined,
      expertise: splitList(expertiseText),
      tags: splitList(tagsText),
      avatarInitials: initialsFromName(name),
    });
    onClose();
  }

  return (
    <RecordFormModal
      title={isNew ? 'Add contact' : 'Edit contact'}
      submitLabel={isNew ? 'Add' : 'Save'}
      onClose={onClose}
      onSubmit={handleSave}
      wide
    >
      <FormField label="Name" required>
        <input
          className={textInput()}
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          required
        />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Role" required>
          <input
            className={textInput()}
            value={draft.role}
            onChange={(e) => set('role', e.target.value)}
            required
          />
        </FormField>
        <FormField label="Category">
          <select
            className={selectInput()}
            value={draft.category}
            onChange={(e) => set('category', e.target.value as ContactCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <FormField label="Organization" required>
        <input
          className={textInput()}
          value={draft.organization}
          onChange={(e) => set('organization', e.target.value)}
          required
        />
      </FormField>
      <FormField label="Team">
        <input
          className={textInput()}
          value={draft.team}
          onChange={(e) => set('team', e.target.value)}
        />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Email">
          <input
            type="email"
            className={textInput()}
            value={draft.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </FormField>
        <FormField label="Phone">
          <input
            className={textInput()}
            value={draft.phone ?? ''}
            onChange={(e) => set('phone', e.target.value)}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Location">
          <input
            className={textInput()}
            value={draft.location}
            onChange={(e) => set('location', e.target.value)}
          />
        </FormField>
        <FormField label="Country">
          <input
            className={textInput()}
            value={draft.country ?? ''}
            onChange={(e) => set('country', e.target.value)}
          />
        </FormField>
      </div>
      <FormField label="Expertise (comma-separated)">
        <input
          className={textInput()}
          value={expertiseText}
          onChange={(e) => setExpertiseText(e.target.value)}
        />
      </FormField>
      <FormField label="Tags (comma-separated)">
        <input
          className={textInput()}
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
        />
      </FormField>
      <FormField label="Notes">
        <textarea
          className={textArea()}
          value={draft.notes ?? ''}
          onChange={(e) => set('notes', e.target.value)}
        />
      </FormField>
    </RecordFormModal>
  );
}
