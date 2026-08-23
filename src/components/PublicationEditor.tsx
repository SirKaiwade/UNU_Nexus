import { useState } from 'react';
import type { Publication } from '../types';
import { PUBLICATION_TYPES } from '../data/publications';
import { makeRecordId } from '../lib/recordId';
import { emptyPublication } from '../lib/recordTemplates';
import RecordFormModal, {
  FormField,
  nullIfEmpty,
  selectInput,
  textArea,
  textInput,
} from './RecordFormModal';

interface Props {
  initial?: Publication;
  onClose: () => void;
  onSave: (record: Publication) => void;
}

export default function PublicationEditor({ initial, onClose, onSave }: Props) {
  const isNew = !initial;
  const [draft, setDraft] = useState<Publication>(initial ?? emptyPublication());

  function set<K extends keyof Publication>(key: K, value: Publication[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function handleSave() {
    const title = draft.title.trim();
    if (!title) return;
    const id =
      draft.id ||
      makeRecordId('pub', title.toLowerCase());
    onSave({
      ...draft,
      id,
      title,
      date: nullIfEmpty(draft.date ?? ''),
      firstAuthor: nullIfEmpty(draft.firstAuthor ?? ''),
      otherAuthors: nullIfEmpty(draft.otherAuthors ?? ''),
      type: nullIfEmpty(draft.type ?? ''),
      outlet: nullIfEmpty(draft.outlet ?? ''),
      link: nullIfEmpty(draft.link ?? ''),
      doi: nullIfEmpty(draft.doi ?? ''),
      collectionsLink: nullIfEmpty(draft.collectionsLink ?? ''),
      externalLink: nullIfEmpty(draft.externalLink ?? ''),
      url: nullIfEmpty(draft.url ?? ''),
      fullCitation: nullIfEmpty(draft.fullCitation ?? ''),
      pelikanProjectId: nullIfEmpty(draft.pelikanProjectId ?? ''),
      isbn: nullIfEmpty(draft.isbn ?? ''),
      files: nullIfEmpty(draft.files ?? ''),
      workPackage: nullIfEmpty(draft.workPackage ?? ''),
      targetAudience: nullIfEmpty(draft.targetAudience ?? ''),
      purpose: nullIfEmpty(draft.purpose ?? ''),
    });
    onClose();
  }

  const types = PUBLICATION_TYPES;

  return (
    <RecordFormModal
      title={isNew ? 'Add publication' : 'Edit publication'}
      submitLabel={isNew ? 'Add' : 'Save'}
      onClose={onClose}
      onSubmit={handleSave}
      wide
    >
      <FormField label="Title" required>
        <input
          className={textInput()}
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          required
        />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Date">
          <input
            type="date"
            className={textInput()}
            value={draft.date ?? ''}
            onChange={(e) => set('date', e.target.value || null)}
          />
        </FormField>
        <FormField label="Type">
          <select
            className={selectInput()}
            value={draft.type ?? ''}
            onChange={(e) => set('type', e.target.value || null)}
          >
            <option value="">—</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="First author">
          <input
            className={textInput()}
            value={draft.firstAuthor ?? ''}
            onChange={(e) => set('firstAuthor', e.target.value)}
          />
        </FormField>
        <FormField label="Other authors">
          <input
            className={textInput()}
            value={draft.otherAuthors ?? ''}
            onChange={(e) => set('otherAuthors', e.target.value)}
          />
        </FormField>
      </div>
      <FormField label="Outlet / publisher">
        <input
          className={textInput()}
          value={draft.outlet ?? ''}
          onChange={(e) => set('outlet', e.target.value)}
        />
      </FormField>
      <FormField label="Full citation">
        <textarea
          className={textArea()}
          value={draft.fullCitation ?? ''}
          onChange={(e) => set('fullCitation', e.target.value)}
        />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Full DOI">
          <input
            className={textInput()}
            value={draft.doi ?? ''}
            onChange={(e) => set('doi', e.target.value)}
          />
        </FormField>
        <FormField label="External link">
          <input
            type="url"
            className={textInput()}
            value={draft.externalLink ?? ''}
            onChange={(e) => set('externalLink', e.target.value)}
            placeholder="https://"
          />
        </FormField>
        <FormField label="UNU Collections link">
          <input
            type="url"
            className={textInput()}
            value={draft.collectionsLink ?? ''}
            onChange={(e) => set('collectionsLink', e.target.value)}
            placeholder="https://"
          />
        </FormField>
        <FormField label="URL">
          <input
            type="url"
            className={textInput()}
            value={draft.url ?? ''}
            onChange={(e) => set('url', e.target.value)}
            placeholder="https://"
          />
        </FormField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="ISBN">
          <input
            className={textInput()}
            value={draft.isbn ?? ''}
            onChange={(e) => set('isbn', e.target.value)}
          />
        </FormField>
        <FormField label="Pelikan project ID">
          <input
            className={textInput()}
            value={draft.pelikanProjectId ?? ''}
            onChange={(e) => set('pelikanProjectId', e.target.value)}
          />
        </FormField>
        <FormField label="Files">
          <input
            className={textInput()}
            value={draft.files ?? ''}
            onChange={(e) => set('files', e.target.value)}
          />
        </FormField>
        <FormField label="Work package">
          <input
            className={textInput()}
            value={draft.workPackage ?? ''}
            onChange={(e) => set('workPackage', e.target.value)}
          />
        </FormField>
      </div>
      <FormField label="Target audience">
        <input
          className={textInput()}
          value={draft.targetAudience ?? ''}
          onChange={(e) => set('targetAudience', e.target.value)}
        />
      </FormField>
      <FormField label="Comments / purpose">
        <textarea
          className={textArea()}
          value={draft.purpose ?? ''}
          onChange={(e) => set('purpose', e.target.value)}
        />
      </FormField>
    </RecordFormModal>
  );
}
