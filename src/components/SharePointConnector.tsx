import { useCallback, useEffect, useState } from 'react';
import {
  X,
  Cloud,
  LogOut,
  ChevronRight,
  FolderOpen,
  FileText,
  Loader2,
  HardDrive,
  Globe,
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertCircle,
  Download,
  ShieldAlert,
} from 'lucide-react';
import {
  BLOCKED_RETENTION_LABEL,
  getCurrentUser,
  importDriveItem,
  isImportableFilename,
  listChildren,
  listMyDrives,
  searchSites,
  getSiteDefaultDrive,
  sharePointConfigured,
  signIn,
  signOut,
  type DriveItemSummary,
  type DriveSummary,
  type SharePointSite,
  type SignedInUser,
} from '../lib/sharepoint';
import { classNames, formatBytes, formatRelative } from '../lib/format';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Source =
  | { kind: 'drive'; drive: DriveSummary }
  | { kind: 'site'; site: SharePointSite; drive: DriveSummary };

interface Crumb {
  id: string | 'root';
  name: string;
}

export default function SharePointConnector({ open, onClose }: Props) {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [drives, setDrives] = useState<DriveSummary[] | null>(null);
  const [siteQuery, setSiteQuery] = useState('');
  const [sites, setSites] = useState<SharePointSite[] | null>(null);
  const [sitesLoading, setSitesLoading] = useState(false);

  const [source, setSource] = useState<Source | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [items, setItems] = useState<DriveItemSummary[] | null>(null);
  const [hiddenConfidential, setHiddenConfidential] = useState(0);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importLog, setImportLog] = useState<{ filename: string; ok: boolean; error?: string }[]>(
    []
  );

  const configured = sharePointConfigured();

  useEffect(() => {
    if (!open || !configured) return;
    let cancelled = false;
    (async () => {
      try {
        const u = await getCurrentUser();
        if (!cancelled) setUser(u);
      } catch {
        if (!cancelled) setUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, configured]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const ds = await listMyDrives();
        if (!cancelled) setDrives(ds);
      } catch (err) {
        if (!cancelled)
          setBrowseError(err instanceof Error ? err.message : 'Could not list drives.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while panel is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const loadFolder = useCallback(
    async (driveId: string, itemId: string | 'root') => {
      setItemsLoading(true);
      setBrowseError(null);
      setHiddenConfidential(0);
      try {
        const { items: children, hiddenConfidentialCount } = await listChildren(driveId, itemId);
        children.sort((a, b) => {
          if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setItems(children);
        setHiddenConfidential(hiddenConfidentialCount);
      } catch (err) {
        setBrowseError(err instanceof Error ? err.message : 'Could not list folder.');
      } finally {
        setItemsLoading(false);
      }
    },
    []
  );

  const pickSource = useCallback(
    async (next: Source) => {
      setSource(next);
      setCrumbs([{ id: 'root', name: next.kind === 'site' ? next.site.displayName : next.drive.name }]);
      setSelected(new Set());
      setImportLog([]);
      await loadFolder(next.drive.id, 'root');
    },
    [loadFolder]
  );

  const enterFolder = useCallback(
    async (item: DriveItemSummary) => {
      if (!source) return;
      setCrumbs((cs) => [...cs, { id: item.id, name: item.name }]);
      setSelected(new Set());
      await loadFolder(source.drive.id, item.id);
    },
    [source, loadFolder]
  );

  const goToCrumb = useCallback(
    async (index: number) => {
      if (!source) return;
      const newCrumbs = crumbs.slice(0, index + 1);
      setCrumbs(newCrumbs);
      setSelected(new Set());
      const target = newCrumbs[newCrumbs.length - 1];
      await loadFolder(source.drive.id, target.id);
    },
    [crumbs, source, loadFolder]
  );

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllImportable = useCallback(() => {
    if (!items) return;
    const importable = items.filter((it) => !it.isFolder && isImportableFilename(it.name));
    setSelected(new Set(importable.map((it) => it.id)));
  }, [items]);

  const runImport = useCallback(async () => {
    if (!source || !items) return;
    const targets = items.filter((it) => !it.isFolder && selected.has(it.id));
    if (targets.length === 0) return;
    setImporting(true);
    setImportLog([]);
    setImportProgress(0);
    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];
      const r = await importDriveItem(source.drive.id, item.id, item.name);
      setImportLog((prev) => [...prev, { filename: r.filename, ok: r.ok, error: r.error }]);
      setImportProgress(i + 1);
    }
    setImporting(false);
    setSelected(new Set());
  }, [items, selected, source]);

  const onSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const u = await signIn();
      setUser(u);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const onSignOut = async () => {
    try {
      await signOut();
    } catch {
      // ignore — popup might be blocked, just clear local state
    }
    setUser(null);
    setDrives(null);
    setSites(null);
    setSource(null);
    setCrumbs([]);
    setItems(null);
    setHiddenConfidential(0);
    setSelected(new Set());
    setImportLog([]);
  };

  const onSearchSites = async () => {
    setSitesLoading(true);
    try {
      const ss = await searchSites(siteQuery);
      setSites(ss);
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : 'Could not search sites.');
    } finally {
      setSitesLoading(false);
    }
  };

  const pickSite = async (site: SharePointSite) => {
    try {
      const drive = await getSiteDefaultDrive(site.id);
      await pickSource({ kind: 'site', site, drive });
    } catch (err) {
      setBrowseError(
        err instanceof Error ? err.message : 'Could not open this site.'
      );
    }
  };

  const backToSourcePicker = () => {
    setSource(null);
    setCrumbs([]);
    setItems(null);
    setHiddenConfidential(0);
    setSelected(new Set());
    setBrowseError(null);
    setImportLog([]);
  };

  if (!open) return null;

  const importableCount =
    items?.filter((it) => !it.isFolder && isImportableFilename(it.name)).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative ml-auto w-full max-w-lg bg-surface border-l border-rule shadow-elevated flex flex-col h-full panel-slide-in"
        role="dialog"
        aria-label="SharePoint connector"
      >
        <div className="px-5 py-4 border-b border-rule flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-sm bg-un-blue-bg text-un-blue flex items-center justify-center shrink-0">
            <Cloud className="w-4.5 h-4.5" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-semibold text-display-m">SharePoint</div>
            <div className="text-[12px] text-gray-500 truncate">
              {user
                ? `Signed in as ${user.email}`
                : 'Connect with your Microsoft account to import files'}
            </div>
          </div>
          {user && (
            <button
              type="button"
              onClick={onSignOut}
              title="Sign out"
              className="p-1.5 rounded-sm hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.75} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-sm hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 scroll-smooth">
          {!configured ? (
            <NotConfigured />
          ) : !user ? (
            <SignInState
              onSignIn={onSignIn}
              busy={authBusy}
              error={authError}
            />
          ) : !source ? (
            <SourcePicker
              drives={drives}
              sites={sites}
              sitesLoading={sitesLoading}
              siteQuery={siteQuery}
              onSiteQuery={setSiteQuery}
              onSearchSites={onSearchSites}
              onPickDrive={(drive) => pickSource({ kind: 'drive', drive })}
              onPickSite={pickSite}
            />
          ) : (
            <Browser
              source={source}
              crumbs={crumbs}
              items={items}
              loading={itemsLoading}
              hiddenConfidential={hiddenConfidential}
              error={browseError}
              selected={selected}
              importableCount={importableCount}
              onBack={backToSourcePicker}
              onCrumb={goToCrumb}
              onEnter={enterFolder}
              onToggle={toggleSelected}
              onSelectAll={selectAllImportable}
            />
          )}
        </div>

        {source && (
          <div className="border-t border-rule px-5 py-3 bg-gray-50 shrink-0 space-y-2">
            {importLog.length > 0 && (
              <ImportLog log={importLog} />
            )}
            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px] text-gray-600 min-w-0">
                {importing ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    Importing {importProgress} of {selected.size || importLog.length}…
                  </span>
                ) : selected.size === 0 ? (
                  'Select files to import into your session'
                ) : (
                  `${selected.size} file${selected.size === 1 ? '' : 's'} selected`
                )}
              </div>
              <button
                type="button"
                onClick={runImport}
                disabled={importing || selected.size === 0}
                className="btn btn-primary btn-sm shrink-0"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Import {selected.size > 0 ? `(${selected.size})` : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="px-5 py-6 text-[13px] text-gray-700 leading-relaxed fade-in">
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-sm bg-amber-50 border border-amber-200 text-amber-900 mb-4">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>SharePoint integration is not configured.</div>
      </div>
      <p className="mb-3">
        To connect SharePoint, register a single-page app in Azure and paste the client ID into{' '}
        <code className="font-mono text-[12px] bg-gray-100 px-1 py-0.5 rounded">.env.local</code>.
      </p>
      <ol className="list-decimal pl-5 space-y-1.5 text-[13px]">
        <li>
          Azure Portal → Microsoft Entra ID → App registrations → <strong>New registration</strong>.
        </li>
        <li>
          Account types: <em>Multitenant + personal</em>. Redirect URI:{' '}
          <code className="font-mono text-[12px] bg-gray-100 px-1 py-0.5 rounded">
            {window.location.origin}
          </code>{' '}
          (Single-page application).
        </li>
        <li>
          API permissions → Microsoft Graph → Delegated:{' '}
          <code className="font-mono text-[12px] bg-gray-100 px-1 py-0.5 rounded">Files.Read.All</code>,{' '}
          <code className="font-mono text-[12px] bg-gray-100 px-1 py-0.5 rounded">Sites.Read.All</code>,{' '}
          <code className="font-mono text-[12px] bg-gray-100 px-1 py-0.5 rounded">User.Read</code>.
        </li>
        <li>
          Copy the Application (client) ID into{' '}
          <code className="font-mono text-[12px] bg-gray-100 px-1 py-0.5 rounded">VITE_AZURE_CLIENT_ID</code>{' '}
          in <code className="font-mono text-[12px] bg-gray-100 px-1 py-0.5 rounded">.env.local</code>{' '}
          and restart the dev server.
        </li>
      </ol>
    </div>
  );
}

function SignInState({
  onSignIn,
  busy,
  error,
}: {
  onSignIn: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="px-5 py-8 fade-in">
      <div className="text-center max-w-sm mx-auto">
        <div className="w-12 h-12 rounded-sm bg-un-blue-bg text-un-blue flex items-center justify-center mx-auto mb-4">
          <Cloud className="w-6 h-6" strokeWidth={1.5} />
        </div>
        <div className="font-display text-display-m font-semibold mb-2">
          Sign in with Microsoft
        </div>
        <p className="text-[13px] text-gray-600 mb-5 leading-relaxed">
          Nexus only sees files you already have access to. Sign-in is delegated — no
          server stores your tokens, and they're cleared when you close this tab.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          disabled={busy}
          className="btn btn-primary"
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Opening sign-in…
            </>
          ) : (
            <>
              <Cloud className="w-4 h-4" />
              Sign in
            </>
          )}
        </button>
        {error && (
          <div className="mt-4 px-3 py-2 rounded-sm bg-red-50 border border-red-200 text-red-900 text-[12px] text-left">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function SourcePicker({
  drives,
  sites,
  sitesLoading,
  siteQuery,
  onSiteQuery,
  onSearchSites,
  onPickDrive,
  onPickSite,
}: {
  drives: DriveSummary[] | null;
  sites: SharePointSite[] | null;
  sitesLoading: boolean;
  siteQuery: string;
  onSiteQuery: (q: string) => void;
  onSearchSites: () => void;
  onPickDrive: (d: DriveSummary) => void;
  onPickSite: (s: SharePointSite) => void;
}) {
  return (
    <div className="px-5 py-4 space-y-6 fade-in">
      <section>
        <div className="text-overline uppercase font-semibold text-gray-500 mb-2">
          Your drives
        </div>
        {drives === null ? (
          <SkeletonList rows={3} />
        ) : drives.length === 0 ? (
          <div className="text-[13px] text-gray-500 py-2">No drives found.</div>
        ) : (
          <ul className="space-y-1">
            {drives.map((d, i) => (
              <li key={d.id} className="stagger-in" style={{ animationDelay: `${i * 40}ms` }}>
                <button
                  type="button"
                  onClick={() => onPickDrive(d)}
                  className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-sm border border-rule hover:border-un-blue hover:bg-un-blue-bg/40 group transition-all duration-150"
                >
                  <HardDrive
                    className="w-3.5 h-3.5 text-gray-400 group-hover:text-un-blue mt-0.5 shrink-0 transition-colors"
                    strokeWidth={1.75}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink group-hover:text-un-blue-dark truncate">
                      {d.name}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {d.driveType === 'personal' ? 'Personal OneDrive' : d.driveType}
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-un-blue mt-1 transition-colors" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="text-overline uppercase font-semibold text-gray-500 mb-2">
          SharePoint sites
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSearchSites();
          }}
          className="flex gap-2 mb-3"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={siteQuery}
              onChange={(e) => onSiteQuery(e.target.value)}
              placeholder="Search site name (or leave empty for all)"
              className="input pl-9"
            />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm" disabled={sitesLoading}>
            {sitesLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
          </button>
        </form>

        {sites === null ? (
          <div className="text-[12px] text-gray-500">Search to list SharePoint sites you can access.</div>
        ) : sites.length === 0 ? (
          <div className="text-[13px] text-gray-500 py-2">No sites match.</div>
        ) : (
          <ul className="space-y-1">
            {sites.map((s, i) => (
              <li key={s.id} className="stagger-in" style={{ animationDelay: `${i * 40}ms` }}>
                <button
                  type="button"
                  onClick={() => onPickSite(s)}
                  className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-sm border border-rule hover:border-un-blue hover:bg-un-blue-bg/40 group transition-all duration-150"
                >
                  <Globe
                    className="w-3.5 h-3.5 text-gray-400 group-hover:text-un-blue mt-0.5 shrink-0 transition-colors"
                    strokeWidth={1.75}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink group-hover:text-un-blue-dark truncate">
                      {s.displayName}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5 truncate">{s.webUrl}</div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-un-blue mt-1 transition-colors" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Browser({
  source,
  crumbs,
  items,
  loading,
  hiddenConfidential,
  error,
  selected,
  importableCount,
  onBack,
  onCrumb,
  onEnter,
  onToggle,
  onSelectAll,
}: {
  source: Source;
  crumbs: Crumb[];
  items: DriveItemSummary[] | null;
  loading: boolean;
  hiddenConfidential: number;
  error: string | null;
  selected: Set<string>;
  importableCount: number;
  onBack: () => void;
  onCrumb: (index: number) => void;
  onEnter: (item: DriveItemSummary) => void;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
}) {
  const allImportableSelected =
    importableCount > 0 &&
    items?.filter((it) => !it.isFolder && isImportableFilename(it.name)).every((it) => selected.has(it.id));

  return (
    <div className="px-5 py-4 fade-in">
      <button
        type="button"
        onClick={onBack}
        className="text-[12px] text-gray-500 hover:text-un-blue inline-flex items-center gap-1 mb-3 transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        Change source
      </button>

      <div className="flex items-center flex-wrap gap-1 text-[12px] mb-3">
        <span className="text-gray-500">
          {source.kind === 'site' ? source.site.displayName : source.drive.name} /
        </span>
        {crumbs.map((c, i) => (
          <span key={c.id} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onCrumb(i)}
              className={classNames(
                'hover:underline transition-colors',
                i === crumbs.length - 1 ? 'text-ink font-semibold' : 'text-gray-500 hover:text-un-blue'
              )}
            >
              {c.name}
            </button>
            {i < crumbs.length - 1 && <span className="text-gray-300">/</span>}
          </span>
        ))}
      </div>

      {hiddenConfidential > 0 && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-sm bg-amber-50/80 border border-amber-200/80 text-amber-900 text-[12px] leading-snug">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />
          <span>
            {hiddenConfidential} item{hiddenConfidential === 1 ? '' : 's'} hidden —{' '}
            <strong>{BLOCKED_RETENTION_LABEL}</strong> retention labels are excluded from Nexus.
          </span>
        </div>
      )}

      {error && (
        <div className="mb-3 px-3 py-2 rounded-sm bg-red-50 border border-red-200 text-red-900 text-[12px]">
          {error}
        </div>
      )}

      {!loading && importableCount > 0 && (
        <div className="mb-2 flex items-center justify-end">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={allImportableSelected}
            className="text-[11px] font-semibold text-un-blue hover:text-un-blue-dark disabled:opacity-40 disabled:cursor-default transition-colors"
          >
            {allImportableSelected ? 'All importable selected' : 'Select all importable'}
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonList rows={6} />
      ) : items && items.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-gray-500">
          {hiddenConfidential > 0
            ? 'All items in this folder are confidential and have been excluded.'
            : 'This folder is empty.'}
        </div>
      ) : items ? (
        <ul className="space-y-0.5">
          {items.map((it, i) => {
            if (it.isFolder) {
              return (
                <li key={it.id} className="stagger-in" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <button
                    type="button"
                    onClick={() => onEnter(it)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-sm hover:bg-gray-50 group transition-colors duration-150"
                  >
                    <FolderOpen
                      className="w-4 h-4 text-un-blue shrink-0"
                      strokeWidth={1.75}
                    />
                    <span className="flex-1 min-w-0 text-[13px] font-medium text-ink truncate">
                      {it.name}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-un-blue transition-colors" />
                  </button>
                </li>
              );
            }
            const importable = isImportableFilename(it.name);
            const isSelected = selected.has(it.id);
            return (
              <li key={it.id} className="stagger-in" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                <label
                  className={classNames(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-sm group transition-all duration-150',
                    importable
                      ? isSelected
                        ? 'bg-un-blue-bg border border-un-blue-soft cursor-pointer'
                        : 'border border-transparent hover:bg-gray-50 cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  )}
                  title={
                    importable
                      ? undefined
                      : 'Only PDF, Word, .txt and .md are supported in this session.'
                  }
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!importable}
                    onChange={() => importable && onToggle(it.id)}
                    className="w-3.5 h-3.5 accent-un-blue shrink-0"
                  />
                  <FileText
                    className="w-3.5 h-3.5 text-gray-400 shrink-0"
                    strokeWidth={1.75}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-ink truncate">
                      {it.name}
                    </span>
                    <span className="block text-[11px] text-gray-500 truncate">
                      {it.size ? formatBytes(it.size) : ''}
                      {it.lastModifiedDateTime
                        ? ` · ${formatRelative(it.lastModifiedDateTime)}`
                        : ''}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function SkeletonList({ rows }: { rows: number }) {
  return (
    <ul className="space-y-1.5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-2.5">
          <div className="w-4 h-4 rounded-sm shimmer shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 rounded-sm shimmer w-3/5" />
            <div className="h-2.5 rounded-sm shimmer w-2/5" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ImportLog({
  log,
}: {
  log: { filename: string; ok: boolean; error?: string }[];
}) {
  const oks = log.filter((l) => l.ok).length;
  const errs = log.length - oks;
  return (
    <div className="space-y-1 fade-in">
      <div className="text-[11px] text-gray-600">
        {oks > 0 && (
          <span className="text-accent-green">
            {oks} imported
          </span>
        )}
        {oks > 0 && errs > 0 && <span className="text-gray-400"> · </span>}
        {errs > 0 && <span className="text-accent-red">{errs} failed</span>}
      </div>
      <ul className="space-y-0.5 max-h-32 overflow-y-auto">
        {log.map((l, i) => (
          <li
            key={i}
            className="flex items-start gap-1.5 text-[11px]"
          >
            {l.ok ? (
              <CheckCircle2 className="w-3 h-3 text-accent-green mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-3 h-3 text-accent-red mt-0.5 shrink-0" />
            )}
            <span className="font-medium truncate">{l.filename}</span>
            {!l.ok && l.error && (
              <span className="text-gray-500 truncate">— {l.error}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
