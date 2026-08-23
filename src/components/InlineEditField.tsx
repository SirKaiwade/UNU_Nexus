import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Double-click to edit; blur/Enter commits (autosave via onSave).
 */
export default function InlineEditField({
  label,
  value,
  onSave,
  multiline = false,
  placeholder = '—',
  type = 'text',
}: {
  label?: string;
  value: string;
  onSave: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  type?: 'text' | 'date';
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    const prev = value.trim();
    if (next !== prev) onSave(next);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  const body: ReactNode = editing ? (
    multiline ? (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        className="inline-edit-input inline-edit-textarea"
        value={draft}
        rows={3}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
    ) : (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        type={type}
        className="inline-edit-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
      />
    )
  ) : (
    <button
      type="button"
      className="inline-edit-display"
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
    >
      {value.trim() ? value : <span className="text-gray-400">{placeholder}</span>}
    </button>
  );

  if (!label) return body;

  return (
    <div className="data-field">
      <div className="data-field-label">{label}</div>
      <div className="data-field-value">{body}</div>
    </div>
  );
}
