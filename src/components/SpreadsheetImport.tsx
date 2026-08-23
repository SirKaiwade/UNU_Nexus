import { useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, RotateCcw, Upload, X } from 'lucide-react';
import { parseTables, type ParseResult } from '../lib/recordsImport';
import { isSpreadsheetFile, readSpreadsheet } from '../lib/spreadsheet';
import { eventsStore } from '../data/events';
import { publicationsStore } from '../data/publications';

interface Props {
  /** Which record type this page is about — only affects copy. */
  kind: 'events' | 'publications';
}

interface PendingImport {
  filename: string;
  result: ParseResult;
  count: number;
}

/**
 * Import an .xlsx / .csv mastersheet. Events and publications start
 * empty — staff load their own files; nothing is hardcoded into the app.
 */
export default function SpreadsheetImport({ kind }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const label = kind === 'events' ? 'events matrix' : 'publication mastersheet';
  const existingCount =
    kind === 'events' ? eventsStore.get().filter((e) => e.title.trim()).length : publicationsStore.get().length;

  async function onFile(file: File | null) {
    if (!file) return;
    setError(null);
    setNote(null);
    if (!isSpreadsheetFile(file)) {
      setError(`${file.name} is not a spreadsheet. Use .xlsx or .csv.`);
      return;
    }
    setBusy(true);
    try {
      const tables = await readSpreadsheet(file);
      const result = parseTables(tables);
      const count =
        kind === 'events' ? result.events.length : result.publications.length;

      if (count === 0) {
        const hint =
          kind === 'events'
            ? 'Expected an events sheet with columns like "Event Name" / "Event title", date, and event type (.xlsx works).'
            : 'Expected a publications sheet with "Title", "Publication type", or "First author".';
        setError(`No ${kind} found in ${file.name}. ${hint}`);
      } else {
        setPending({ filename: file.name, result, count });
      }
    } catch (err) {
      setError(
        `Could not read ${file.name}: ${err instanceof Error ? err.message : 'unknown error'}`
      );
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function confirmImport() {
    if (!pending) return;
    if (kind === 'events') {
      // From-scratch load: replace the register with the file contents.
      // Re-import of an updated matrix also replaces so the sheet is source of truth.
      eventsStore.hydrate(pending.result.events);
      setNote(
        `Loaded ${pending.result.events.length} events from ${pending.filename}.`
      );
    } else {
      publicationsStore.hydrate(pending.result.publications);
      setNote(
        `Loaded ${pending.result.publications.length} publications from ${pending.filename}.`
      );
    }
    setPending(null);
  }

  function clearData() {
    if (
      !window.confirm(
        kind === 'events'
          ? 'Clear all events? You can re-import an .xlsx anytime.'
          : 'Clear all publications? You can re-import an .xlsx anytime.'
      )
    ) {
      return;
    }
    if (kind === 'events') eventsStore.reset();
    else publicationsStore.reset();
    setNote(kind === 'events' ? 'Cleared all events.' : 'Cleared all publications.');
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        title={`Import ${label} (.xlsx preferred)`}
        className="btn btn-secondary btn-sm"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Upload className="w-3.5 h-3.5" />
        )}
        Import .xlsx
      </button>
      {existingCount > 0 && (
        <button
          type="button"
          onClick={clearData}
          title="Clear all rows"
          className="btn btn-ghost btn-sm text-gray-500"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}

      {(note || error) && (
        <div
          className={
            error
              ? 'fixed bottom-4 right-4 z-50 max-w-sm rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-900 shadow-elevated fade-in'
              : 'fixed bottom-4 right-4 z-50 max-w-sm rounded-sm border border-un-blue-soft bg-un-blue-bg px-4 py-3 text-[13px] text-un-blue-dark shadow-elevated fade-in'
          }
        >
          <div className="flex items-start gap-2">
            <span className="flex-1">{error ?? note}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                setError(null);
                setNote(null);
              }}
              className="p-0.5 rounded-sm hover:bg-surface/60 text-current shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {pending && (
        <>
          <button
            type="button"
            aria-label="Cancel import"
            className="fixed inset-0 z-40 bg-ink/30"
            onClick={() => setPending(null)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-surface border border-rule rounded-sm shadow-elevated fade-in">
            <div className="px-5 py-4 border-b border-rule flex items-center gap-3">
              <div className="w-8 h-8 rounded-sm bg-un-blue-bg text-un-blue flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display font-semibold text-[15px]">Confirm import</div>
                <div className="text-[12px] text-gray-500 truncate" title={pending.filename}>
                  {pending.filename}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 text-[13px] text-gray-700 space-y-2">
              <div>
                <strong>{pending.count}</strong> {kind === 'events' ? 'event' : 'publication'}
                {pending.count === 1 ? '' : 's'} found in this workbook.
              </div>
              {existingCount > 0 ? (
                <div className="text-[12px] text-gray-500">
                  This will replace the current {existingCount} {kind} with the file contents.
                  Changes sync to Supabase when connected.
                </div>
              ) : (
                <div className="text-[12px] text-gray-500">
                  The register is empty — this will load the file from scratch. Changes sync to
                  Supabase when connected.
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-rule flex items-center justify-end gap-2 bg-gray-50">
              <button type="button" onClick={() => setPending(null)} className="btn btn-ghost btn-sm">
                Cancel
              </button>
              <button type="button" onClick={confirmImport} className="btn btn-primary btn-sm">
                {existingCount > 0 ? 'Replace & import' : 'Import'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
