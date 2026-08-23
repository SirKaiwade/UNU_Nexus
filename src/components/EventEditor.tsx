import { useState } from 'react';
import type { EventLevel, EventModality, EventType, IIGHEvent } from '../types';
import { EVENT_TYPES } from '../data/events';
import { makeRecordId } from '../lib/recordId';
import { emptyEvent } from '../lib/recordTemplates';
import RecordFormModal, {
  FormField,
  nullIfEmpty,
  selectInput,
  textArea,
  textInput,
} from './RecordFormModal';

const MODALITIES: EventModality[] = ['In person', 'Virtual', 'Hybrid', 'Unspecified'];
const LEVELS: EventLevel[] = [
  'Global',
  'Regional',
  'National',
  'Sub-national',
  'Unspecified',
];

interface Props {
  initial?: IIGHEvent;
  onClose: () => void;
  onSave: (record: IIGHEvent) => void;
}

export default function EventEditor({ initial, onClose, onSave }: Props) {
  const isNew = !initial;
  const [draft, setDraft] = useState<IIGHEvent>(initial ?? emptyEvent());

  function set<K extends keyof IIGHEvent>(key: K, value: IIGHEvent[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function handleSave() {
    const title = draft.title.trim();
    if (!title) return;
    const id =
      draft.id ||
      makeRecordId('ev', `${title.toLowerCase()}|${draft.date ?? draft.dateNote ?? ''}`);
    const participants = draft.totalParticipants;
    onSave({
      ...draft,
      id,
      title,
      description: nullIfEmpty(draft.description ?? ''),
      date: nullIfEmpty(draft.date ?? ''),
      dateNote: nullIfEmpty(draft.dateNote ?? ''),
      strategicPurpose: nullIfEmpty(draft.strategicPurpose ?? ''),
      workPackage: nullIfEmpty(draft.workPackage ?? ''),
      owner: nullIfEmpty(draft.owner ?? ''),
      partners: nullIfEmpty(draft.partners ?? ''),
      funder: nullIfEmpty(draft.funder ?? ''),
      programme: nullIfEmpty(draft.programme ?? ''),
      location: nullIfEmpty(draft.location ?? ''),
      totalParticipants:
        participants == null || Number.isNaN(Number(participants))
          ? null
          : Number(participants),
      keyOutputs: nullIfEmpty(draft.keyOutputs ?? ''),
    });
    onClose();
  }

  return (
    <RecordFormModal
      title={isNew ? 'Add event' : 'Edit event'}
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
        <FormField label="Date note (if TBC)">
          <input
            className={textInput()}
            value={draft.dateNote ?? ''}
            onChange={(e) => set('dateNote', e.target.value)}
            placeholder="e.g. postponed — TBA"
          />
        </FormField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label="Type">
          <select
            className={selectInput()}
            value={draft.type}
            onChange={(e) => set('type', e.target.value as EventType)}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Modality">
          <select
            className={selectInput()}
            value={draft.modality}
            onChange={(e) => set('modality', e.target.value as EventModality)}
          >
            {MODALITIES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Level">
          <select
            className={selectInput()}
            value={draft.level}
            onChange={(e) => set('level', e.target.value as EventLevel)}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Location">
          <input
            className={textInput()}
            value={draft.location ?? ''}
            onChange={(e) => set('location', e.target.value)}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Event owner">
          <input
            className={textInput()}
            value={draft.owner ?? ''}
            onChange={(e) => set('owner', e.target.value)}
          />
        </FormField>
        <FormField label="Total participants">
          <input
            type="number"
            min={0}
            className={textInput()}
            value={draft.totalParticipants ?? ''}
            onChange={(e) =>
              set('totalParticipants', e.target.value === '' ? null : Number(e.target.value))
            }
          />
        </FormField>
      </div>
      <FormField label="Partners / co-convenors">
        <input
          className={textInput()}
          value={draft.partners ?? ''}
          onChange={(e) => set('partners', e.target.value)}
        />
      </FormField>
      <FormField label="Strategic purpose">
        <input
          className={textInput()}
          value={draft.strategicPurpose ?? ''}
          onChange={(e) => set('strategicPurpose', e.target.value)}
        />
      </FormField>
      <FormField label="Description">
        <textarea
          className={textArea()}
          value={draft.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
        />
      </FormField>
      <FormField label="Key outputs">
        <textarea
          className={textArea()}
          value={draft.keyOutputs ?? ''}
          onChange={(e) => set('keyOutputs', e.target.value)}
        />
      </FormField>
    </RecordFormModal>
  );
}
