import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Users, X } from 'lucide-react';
import { classNames } from '../lib/format';
import {
  listFolderViewers,
  listProfiles,
  setFolderViewers,
  type ProfileRecord,
} from '../lib/db/admin';

interface Props {
  folderPath: string;
  folderName: string;
  onClose: () => void;
}

export default function FolderAccessModal({ folderPath, folderName, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [mode, setMode] = useState<'everyone' | 'selected'>('everyone');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [people, access] = await Promise.all([
          listProfiles(),
          listFolderViewers(folderPath),
        ]);
        if (cancelled) return;
        const eligible = people.filter(
          (p) => !p.disabled_at && (p.is_admin || p.library_role !== 'none')
        );
        setProfiles(eligible);
        if (access.openToEveryone) {
          setMode('everyone');
          setSelected(new Set());
        } else {
          setMode('selected');
          setSelected(new Set(access.viewers.map((v) => v.profile_id)));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load access settings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folderPath]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.email.includes(q) ||
        (p.display_name ?? '').toLowerCase().includes(q)
    );
  }, [profiles, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await setFolderViewers({
        folderPath,
        openToEveryone: mode === 'everyone',
        profileIds: mode === 'selected' ? [...selected] : [],
      });
      if (!res.ok) throw new Error(res.error);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-access-title"
        className="relative w-full max-w-lg max-h-[min(90vh,640px)] flex flex-col bg-surface border border-rule rounded-lg shadow-panel fade-in"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-rule">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
              Folder access
            </div>
            <h2
              id="folder-access-title"
              className="text-[17px] font-bold text-ink tracking-tight mt-0.5 truncate"
            >
              {folderName}
            </h2>
            <p className="text-[12px] text-gray-500 mt-1 font-mono truncate" title={folderPath}>
              {folderPath}
            </p>
          </div>
          <button
            type="button"
            className="p-1.5 rounded-md text-gray-400 hover:text-ink hover:bg-gray-100"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-[13px] text-gray-600 leading-relaxed m-0">
            Choose who can see this folder and everything inside it. People with{' '}
            <strong className="text-ink">No access</strong> never appear here — set that in
            the Administrator Dashboard.
          </p>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-[13px] text-gray-500 py-8 text-center">Loading…</div>
          ) : (
            <>
              <div className="space-y-2">
                <label
                  className={classNames(
                    'flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors',
                    mode === 'everyone'
                      ? 'border-un-blue bg-un-blue-bg/50'
                      : 'border-rule hover:bg-surface-subtle'
                  )}
                >
                  <input
                    type="radio"
                    name="folder-access-mode"
                    className="mt-1"
                    checked={mode === 'everyone'}
                    onChange={() => setMode('everyone')}
                  />
                  <span>
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                      <Users className="w-3.5 h-3.5 text-un-blue" strokeWidth={1.75} />
                      Everyone with library access
                    </span>
                    <span className="block text-[12px] text-gray-500 mt-0.5">
                      Anyone who isn’t set to No access can open this folder.
                    </span>
                  </span>
                </label>

                <label
                  className={classNames(
                    'flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors',
                    mode === 'selected'
                      ? 'border-un-blue bg-un-blue-bg/50'
                      : 'border-rule hover:bg-surface-subtle'
                  )}
                >
                  <input
                    type="radio"
                    name="folder-access-mode"
                    className="mt-1"
                    checked={mode === 'selected'}
                    onChange={() => setMode('selected')}
                  />
                  <span>
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                      <Lock className="w-3.5 h-3.5 text-un-blue" strokeWidth={1.75} />
                      Only selected people
                    </span>
                    <span className="block text-[12px] text-gray-500 mt-0.5">
                      Administrators can always see every folder.
                    </span>
                  </span>
                </label>
              </div>

              {mode === 'selected' && (
                <div className="space-y-2">
                  <input
                    className="input input-search"
                    type="search"
                    placeholder="Search people…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <ul className="max-h-56 overflow-y-auto rounded-md border border-rule divide-y divide-rule">
                    {filtered.map((p) => (
                      <li key={p.id}>
                        <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-subtle">
                          <input
                            type="checkbox"
                            checked={selected.has(p.id) || p.is_admin}
                            disabled={p.is_admin}
                            onChange={() => toggle(p.id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-ink truncate">
                              {p.display_name || p.email.split('@')[0]}
                              {p.is_admin && (
                                <span className="ml-2 text-[11px] text-un-blue font-semibold">
                                  Admin
                                </span>
                              )}
                            </span>
                            <span className="block text-[11px] text-gray-500 truncate">
                              {p.email}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                    {filtered.length === 0 && (
                      <li className="px-3 py-6 text-center text-[12px] text-gray-500">
                        No matching people.
                      </li>
                    )}
                  </ul>
                  {mode === 'selected' && selected.size === 0 && (
                    <p className="text-[12px] text-gray-500 m-0">
                      No one selected — only administrators will see this folder.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-rule bg-surface-subtle/80">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={loading || saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
