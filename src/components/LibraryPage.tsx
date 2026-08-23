import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Upload,
  Trash2,
  Plus,
  FileText,
  FileSpreadsheet,
  FileType,
  Library,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  Home,
  MapPin,
  Lock,
} from 'lucide-react';
import {
  ingestFiles,
  persistDocToCloud,
  removeUploadedDoc,
  removeUploadedDocsInFolder,
  useUploadedDocs,
  type UploadedDoc,
} from '../lib/uploads';
import { filesFromDataTransfer } from '../lib/folderDrop';
import {
  buildLibraryTree,
  countFilesRecursive,
  docBreadcrumbPath,
  docDisplayName,
  docFolderPath,
  docFullPath,
  folderBreadcrumbPath,
  getFolderAtPath,
  joinLibraryPath,
  libraryFileHref,
  libraryFolderHref,
  normalizeLibraryPath,
  searchLibrary,
  type LibrarySearchHit,
  type TreeFolder,
} from '../lib/libraryTree';
import { formatBytes, classNames } from '../lib/format';
import { EmptyState, MetaSummary, PageHeader, SearchField } from './ui';
import { useAuth } from '../lib/auth';
import { canAccessLibrary, canEditLibrary } from '../lib/permissions';
import { supabaseConfigured } from '../lib/supabase';
import type { ShellContext } from './AppShell';
import FolderAccessModal from './FolderAccessModal';

const ACCEPT =
  '.pdf,.docx,.xlsx,.csv,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,text/markdown';

type DocKind = 'pdf' | 'word' | 'sheet' | 'text' | 'other';

function docKind(filename: string): DocKind {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx' || ext === 'doc') return 'word';
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return 'sheet';
  if (ext === 'txt' || ext === 'md' || ext === 'markdown') return 'text';
  return 'other';
}

function KindIcon({ kind }: { kind: DocKind }) {
  const cls = 'w-4 h-4';
  if (kind === 'sheet') return <FileSpreadsheet className={cls} strokeWidth={1.5} />;
  if (kind === 'text') return <FileType className={cls} strokeWidth={1.5} />;
  return <FileText className={cls} strokeWidth={1.5} />;
}

function kindLabel(kind: DocKind): string {
  if (kind === 'pdf') return 'PDF';
  if (kind === 'word') return 'Word';
  if (kind === 'sheet') return 'Spreadsheet';
  if (kind === 'text') return 'Text';
  return 'Document';
}

function kindChip(kind: DocKind): string {
  if (kind === 'pdf') return 'chip-red';
  if (kind === 'word') return 'chip-blue';
  if (kind === 'sheet') return 'chip-green';
  if (kind === 'text') return 'chip-amber';
  return 'chip-gray';
}

function hasFilePayload(e: React.DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

function matchKindLabel(kind: LibrarySearchHit['kind']): string {
  if (kind === 'filename') return 'Filename';
  if (kind === 'path') return 'Folder path';
  return 'In document';
}

export default function LibraryPage() {
  const ctx = useOutletContext<ShellContext>();
  const { user } = useAuth();
  const uploadedDocs = useUploadedDocs();
  const cloud = supabaseConfigured();
  const canAccess = canAccessLibrary({
    isAdmin: Boolean(user?.isAdmin),
    libraryRole: user?.libraryRole ?? 'none',
  });
  const canEdit = canEditLibrary({
    isAdmin: Boolean(user?.isAdmin),
    libraryRole: user?.libraryRole ?? 'none',
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [highlightFileId, setHighlightFileId] = useState<string | null>(null);
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [folderMenu, setFolderMenu] = useState<{
    x: number;
    y: number;
    path: string;
    name: string;
  } | null>(null);
  const [accessFolder, setAccessFolder] = useState<{
    path: string;
    name: string;
  } | null>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const highlightTimer = useRef<number | null>(null);
  const fileRowRefs = useRef<Map<string, HTMLElement>>(new Map());

  const currentPath = normalizeLibraryPath(searchParams.get('path') ?? '');
  const fileParam = searchParams.get('file');

  const tree = useMemo(
    () => buildLibraryTree(uploadedDocs, [...extraFolders, currentPath].filter(Boolean)),
    [uploadedDocs, extraFolders, currentPath]
  );
  const currentFolder = useMemo(
    () => getFolderAtPath(tree, currentPath),
    [tree, currentPath]
  );

  const searchHits = useMemo(
    () => (query.trim() ? searchLibrary(uploadedDocs, query) : []),
    [uploadedDocs, query]
  );

  const stats = useMemo(() => {
    const pages = uploadedDocs.reduce((sum, d) => sum + (d.pageCount ?? 0), 0);
    const bytes = uploadedDocs.reduce((sum, d) => sum + d.bytes, 0);
    const folders = tree.folderPaths.length;
    return { count: uploadedDocs.length, pages, bytes, folders };
  }, [uploadedDocs, tree.folderPaths.length]);

  const breadcrumbs = useMemo(() => {
    if (!currentPath) return [] as { name: string; path: string }[];
    const parts = currentPath.split('/');
    return parts.map((name, i) => ({
      name,
      path: parts.slice(0, i + 1).join('/'),
    }));
  }, [currentPath]);

  useEffect(() => {
    const el = folderInputRef.current;
    if (!el) return;
    el.setAttribute('webkitdirectory', '');
    el.setAttribute('directory', '');
  }, []);

  // Deep-link: ?file= highlights the row, navigates to its folder, opens viewer.
  useEffect(() => {
    if (!fileParam) return;
    const doc = uploadedDocs.find((d) => d.id === fileParam);
    if (!doc) {
      const params = new URLSearchParams();
      if (currentPath) params.set('path', currentPath);
      setSearchParams(params, { replace: true });
      return;
    }
    const folder = docFolderPath(doc);
    if (folder !== currentPath) {
      const params = new URLSearchParams();
      if (folder) params.set('path', folder);
      params.set('file', doc.id);
      setSearchParams(params, { replace: true });
      return;
    }
    flashHighlight(doc.id);
    ctx.openDocument(doc.id);
    const params = new URLSearchParams();
    if (currentPath) params.set('path', currentPath);
    setSearchParams(params, { replace: true });
    // Intentionally omit ctx/setSearchParams — only react to deep-link params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileParam, uploadedDocs, currentPath]);

  function flashHighlight(id: string) {
    setHighlightFileId(id);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => {
      setHighlightFileId(null);
    }, 3200);
    requestAnimationFrame(() => {
      fileRowRefs.current.get(id)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }

  function navigateToFolder(path: string) {
    setQuery('');
    const params = new URLSearchParams();
    const norm = normalizeLibraryPath(path);
    if (norm) params.set('path', norm);
    setSearchParams(params);
  }

  function goToSearchHit(hit: LibrarySearchHit) {
    setQuery('');
    const params = new URLSearchParams();
    if (hit.folderPath) params.set('path', hit.folderPath);
    params.set('file', hit.doc.id);
    setSearchParams(params);
  }

  async function ingestMany(files: File[]) {
    if (!canEdit) return;
    if (files.length === 0) return;
    setUploading(true);
    setErrors([]);
    setUploadProgress(null);
    // Nested folder drops keep their own paths; loose single files land in the open folder.
    const { docs, errors: errs } = await ingestFiles(files, {
      skipUnsupported: true,
      destinationFolder: currentPath || undefined,
      onProgress: (done, total, filename) => {
        setUploadProgress(`${done}/${total} · ${filename}`);
      },
    });
    if (cloud && user?.email) {
      for (const doc of docs) {
        const saved = await persistDocToCloud(doc, user.email);
        if (!saved.ok && saved.error) {
          errs.push(`Saved locally but not to the shared library: ${saved.error}`);
        }
      }
    }
    setUploading(false);
    setUploadProgress(null);
    const visibleErrs = errs.filter((e) => !/corpus limit/i.test(e));
    if (visibleErrs.length) setErrors(visibleErrs);

    // Stay put when uploading into the current folder; jump only for a new top-level tree drop.
    const nestedDrop = docs.find(
      (d) =>
        d.localRelativePath?.includes('/') &&
        (!currentPath || !d.localRelativePath.startsWith(`${currentPath}/`))
    );
    if (nestedDrop?.localRelativePath && !currentPath) {
      const top = nestedDrop.localRelativePath.split('/')[0];
      if (top) navigateToFolder(top);
    }
  }

  useEffect(() => {
    if (!folderMenu) return;

    // Delay dismiss listeners so the same right-click mouseup/click doesn't
    // instantly close the menu (common on macOS / Chrome).
    let detach: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      function onPointerDown(e: PointerEvent) {
        const node = e.target as Node | null;
        if (node && folderMenuRef.current?.contains(node)) return;
        setFolderMenu(null);
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') setFolderMenu(null);
      }
      window.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('keydown', onKey);
      detach = () => {
        window.removeEventListener('pointerdown', onPointerDown, true);
        window.removeEventListener('keydown', onKey);
      };
    }, 50);

    return () => {
      window.clearTimeout(timer);
      detach?.();
    };
  }, [folderMenu]);

  function openFolderMenu(
    e: React.MouseEvent,
    path: string,
    name: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    const norm = normalizeLibraryPath(path);
    if (!norm) return;
    // Keep the menu on-screen.
    const menuW = 220;
    const menuH = user?.isAdmin ? 120 : 72;
    const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
    setFolderMenu({
      x: Math.max(8, x),
      y: Math.max(8, y),
      path: norm,
      name,
    });
  }

  function deleteFolder(folderPath: string) {
    if (!canEdit) return;
    const norm = normalizeLibraryPath(folderPath);
    if (!norm) return;
    const folder = getFolderAtPath(tree, norm);
    const fileCount = countFilesRecursive(folder);
    const label = folderBreadcrumbPath(norm);
    const ok = window.confirm(
      fileCount > 0
        ? `Delete “${label}” and ${fileCount} file${fileCount === 1 ? '' : 's'} inside it? This cannot be undone.`
        : `Delete empty folder “${label}”?`
    );
    if (!ok) return;

    if (ctx.openDocId) {
      const open = uploadedDocs.find((d) => d.id === ctx.openDocId);
      if (open) {
        const path = docFullPath(open);
        if (path === norm || path.startsWith(`${norm}/`)) {
          ctx.closeDocument();
        }
      }
    }

    removeUploadedDocsInFolder(norm);
    setExtraFolders((prev) =>
      prev.filter((p) => p !== norm && !p.startsWith(`${norm}/`))
    );
    setFolderMenu(null);

    if (currentPath === norm || currentPath.startsWith(`${norm}/`)) {
      const parent = norm.includes('/')
        ? norm.split('/').slice(0, -1).join('/')
        : '';
      navigateToFolder(parent);
    }
  }

  function createFolder() {
    if (!canEdit) return;
    const raw = window.prompt('New folder name');
    if (!raw) return;
    const name = raw.trim().replace(/[\\/]/g, '-');
    if (!name) return;
    const next = joinLibraryPath(currentPath, name);
    setExtraFolders((prev) =>
      prev.includes(next) ? prev : [...prev, next]
    );
    navigateToFolder(next);
  }

  function resetDrag() {
    dragDepth.current = 0;
    setDragging(false);
  }

  function onDragEnter(e: React.DragEvent<HTMLElement>) {
    if (!canEdit) return;
    if (!hasFilePayload(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragOver(e: React.DragEvent<HTMLElement>) {
    if (!hasFilePayload(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }

  function onDragLeave(e: React.DragEvent<HTMLElement>) {
    if (!hasFilePayload(e)) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  async function onDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    resetDrag();
    const files = await filesFromDataTransfer(e.dataTransfer);
    if (files.length === 0) return;
    await ingestMany(files);
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    await ingestMany(files);
  }

  function handleRemove(doc: UploadedDoc) {
    if (!canEdit) return;
    removeUploadedDoc(doc.id);
    if (ctx.openDocId === doc.id) ctx.closeDocument();
  }

  const isEmpty = uploadedDocs.length === 0;
  const searching = query.trim().length > 0;

  return (
    <section
      className={classNames(
        'flex-1 min-w-0 flex flex-col bg-surface relative',
        ctx.openDocId ? 'border-r border-rule' : ''
      )}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={onPickFiles}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onPickFiles}
      />

      <PageHeader
        icon={Library}
        title="Knowledge library"
        subtitle={
          !canAccess
            ? 'You don’t have access to the knowledge library'
            : isEmpty
              ? 'Upload a folder or files · Nexus finds where numbers and facts live'
              : stats.folders > 0
                ? `${stats.count} file${stats.count === 1 ? '' : 's'} in ${stats.folders} folder${stats.folders === 1 ? '' : 's'} · search by name, path, or content`
                : `${stats.count} document${stats.count === 1 ? '' : 's'} · ready for grounded answers`
        }
        search={
          canAccess && !isEmpty ? (
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Where is…? Search files & content"
              className="hidden sm:block max-w-sm"
            />
          ) : undefined
        }
        actions={
          !canAccess ? undefined : canEdit ? (
            <div className="flex items-center gap-2">
              {!isEmpty && (
                <button
                  type="button"
                  onClick={createFolder}
                  disabled={uploading}
                  className="btn btn-secondary btn-sm"
                  title="Create a folder in the current location"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">New folder</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                disabled={uploading}
                className="btn btn-secondary btn-sm"
                title="Upload an entire folder tree"
              >
                <Folder className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{uploading ? 'Adding…' : 'Upload folder'}</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn btn-primary btn-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                {uploading ? 'Adding…' : 'Upload files'}
              </button>
            </div>
          ) : (
            <span className="chip chip-gray">Read only</span>
          )
        }
      />

      <div className="flex-1 overflow-hidden flex min-h-0">
        {!canAccess ? (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-lg mx-auto px-5 py-16">
              <EmptyState
                icon={Lock}
                title="No library access"
                description="An administrator hasn’t given you access to the knowledge library yet. Contact them if you need to view or upload documents."
              />
            </div>
          </div>
        ) : isEmpty ? (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-5xl mx-auto px-5 lg:px-8 py-6 lg:py-10">
              <EmptyLibrary
                readOnly={!canEdit}
                onPickFiles={() => fileInputRef.current?.click()}
                onPickFolder={() => folderInputRef.current?.click()}
                onDragOver={onDragOver}
                onDrop={onDrop}
              />
            </div>
          </div>
        ) : (
          <>
            <aside className="hidden md:flex w-56 lg:w-64 shrink-0 flex-col border-r border-rule bg-surface-subtle min-h-0">
              <div className="px-3 py-2.5 border-b border-rule flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Folders
                </span>
                <span
                  className="text-[10px] text-gray-400 truncate"
                  title={
                    user?.isAdmin
                      ? 'Right-click a folder to manage access or delete it'
                      : canEdit
                        ? 'Right-click a folder to delete it'
                        : 'Browse folders'
                  }
                >
                  {user?.isAdmin ? 'right-click to manage' : canEdit ? 'right-click to delete' : ''}
                </span>
              </div>
              <nav className="flex-1 overflow-y-auto py-2 px-1.5" aria-label="Folder tree">
                <FolderTreeNav
                  folder={tree.root}
                  currentPath={currentPath}
                  depth={0}
                  onNavigate={navigateToFolder}
                  onFolderContextMenu={openFolderMenu}
                  onDeleteFolder={deleteFolder}
                />
              </nav>
            </aside>

            <div className="flex-1 min-w-0 overflow-y-auto">
              <div className="max-w-5xl mx-auto px-5 lg:px-8 py-5 lg:py-8">
                <SearchField
                  value={query}
                  onChange={setQuery}
                  placeholder="Where is…? Search files & content"
                  className="sm:hidden mb-4 max-w-none"
                />

                <MetaSummary
                  items={[
                    {
                      label: stats.count === 1 ? 'file' : 'files',
                      value: stats.count,
                    },
                    ...(stats.folders > 0
                      ? [
                          {
                            label: stats.folders === 1 ? 'folder' : 'folders',
                            value: stats.folders,
                          },
                        ]
                      : []),
                    ...(stats.pages > 0
                      ? [
                          {
                            label: stats.pages === 1 ? 'page' : 'pages',
                            value: stats.pages,
                          },
                        ]
                      : []),
                    { label: 'total size', value: formatBytes(stats.bytes) },
                  ]}
                />

                <UploadStrip
                  onPickFiles={() => fileInputRef.current?.click()}
                  onPickFolder={() => folderInputRef.current?.click()}
                  uploading={uploading}
                  progress={uploadProgress}
                  destinationLabel={folderBreadcrumbPath(currentPath)}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                />

                {errors.length > 0 && (
                  <div className="mt-4 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-900 fade-in">
                    <div className="font-semibold mb-1">Some files couldn&apos;t be added</div>
                    <ul className="space-y-0.5 list-disc pl-5">
                      {errors.map((er, i) => (
                        <li key={i}>{er}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {searching ? (
                  <SearchResults
                    query={query}
                    hits={searchHits}
                    onGoTo={goToSearchHit}
                    onOpen={(doc) => {
                      goToSearchHit({
                        doc,
                        kind: 'filename',
                        folderPath: docFolderPath(doc),
                        fullPath: docFullPath(doc),
                        breadcrumb: docBreadcrumbPath(doc),
                        href: libraryFileHref(doc),
                      });
                    }}
                  />
                ) : (
                  <>
                    <BreadcrumbBar
                      crumbs={breadcrumbs}
                      onNavigate={navigateToFolder}
                    />

                    <div className="mt-4">
                      <div className="flex items-baseline justify-between gap-3 mb-3">
                        <h2 className="text-[15px] font-semibold text-ink tracking-tight">
                          {currentPath ? currentFolder.name : 'Library root'}
                        </h2>
                        <span className="text-[12px] text-gray-500">
                          {currentFolder.folders.length > 0 &&
                            `${currentFolder.folders.length} folder${currentFolder.folders.length === 1 ? '' : 's'}`}
                          {currentFolder.folders.length > 0 &&
                            currentFolder.files.length > 0 &&
                            ' · '}
                          {currentFolder.files.length > 0 &&
                            `${currentFolder.files.length} file${currentFolder.files.length === 1 ? '' : 's'}`}
                          {currentFolder.folders.length === 0 &&
                            currentFolder.files.length === 0 &&
                            'Empty folder'}
                        </span>
                      </div>

                      {currentFolder.folders.length === 0 &&
                      currentFolder.files.length === 0 ? (
                        <div className="data-table-empty">
                          This folder is empty. Upload files or a subfolder here.
                        </div>
                      ) : (
                        <div className="lib-browser list-panel">
                          {currentFolder.folders.map((folder) => (
                            <div
                              key={folder.path}
                              className="lib-browser-row lib-browser-folder group"
                              onContextMenu={(e) =>
                                openFolderMenu(e, folder.path, folder.name)
                              }
                            >
                              <button
                                type="button"
                                onClick={() => navigateToFolder(folder.path)}
                                className="lib-browser-file-main"
                                title="Right-click to delete folder"
                              >
                                <Folder
                                  className="w-4 h-4 text-un-blue shrink-0"
                                  strokeWidth={1.6}
                                />
                                <span className="flex-1 min-w-0 text-left truncate font-medium text-ink">
                                  {folder.name}
                                </span>
                                <span className="text-[11px] text-gray-500 tabular-nums shrink-0">
                                  {countFilesRecursive(folder)} file
                                  {countFilesRecursive(folder) === 1 ? '' : 's'}
                                </span>
                                <ChevronRight
                                  className="w-3.5 h-3.5 text-gray-400 shrink-0"
                                  strokeWidth={1.75}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteFolder(folder.path);
                                }}
                                aria-label={`Delete folder ${folder.name}`}
                                title="Delete folder"
                                className="p-1.5 rounded-sm text-gray-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-accent-red hover:bg-red-50 transition-opacity shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                              </button>
                            </div>
                          ))}
                          {currentFolder.files.map((doc) => (
                            <FileRow
                              key={doc.id}
                              doc={doc}
                              active={ctx.openDocId === doc.id}
                              highlighted={highlightFileId === doc.id}
                              canRemove={canEdit}
                              onOpen={() => {
                                flashHighlight(doc.id);
                                ctx.openDocument(doc.id);
                              }}
                              onRemove={() => handleRemove(doc)}
                              rowRef={(el) => {
                                if (el) fileRowRefs.current.set(doc.id, el);
                                else fileRowRefs.current.delete(doc.id);
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <p className="mt-10 text-[12px] text-gray-500 max-w-2xl leading-relaxed">
                  {cloud
                    ? 'Original files are stored for preview; extracted text is indexed behind them. Nexus searches the library and only pulls the most relevant files into each answer — so you can upload large folder trees. Documents also sync to the shared UNU Global Health library.'
                    : 'Original files are stored for preview; extracted text is indexed behind them. Nexus searches the library and only pulls the most relevant files into each answer — so you can upload large folder trees. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to sync a shared team library.'}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {folderMenu &&
        createPortal(
          <div
            ref={folderMenuRef}
            className="lib-ctx-menu"
            style={{ top: folderMenu.y, left: folderMenu.x }}
            role="menu"
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="lib-ctx-menu-label" title={folderMenu.path}>
              {folderMenu.name}
            </div>
            {user?.isAdmin && (
              <button
                type="button"
                role="menuitem"
                className="lib-ctx-menu-item"
                onClick={() => {
                  setAccessFolder({ path: folderMenu.path, name: folderMenu.name });
                  setFolderMenu(null);
                }}
              >
                <Lock className="w-3.5 h-3.5" strokeWidth={1.75} />
                Manage who can see this
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                role="menuitem"
                className="lib-ctx-menu-item lib-ctx-menu-danger"
                onClick={() => deleteFolder(folderMenu.path)}
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                Delete folder
              </button>
            )}
          </div>,
          document.body
        )}

      {accessFolder && user?.isAdmin && (
        <FolderAccessModal
          folderPath={accessFolder.path}
          folderName={accessFolder.name}
          onClose={() => setAccessFolder(null)}
        />
      )}

      {dragging && canEdit && (
        <div
          className="absolute inset-0 z-40 bg-un-blue-bg/96 border-2 border-dashed border-un-blue m-3 rounded-sm flex items-center justify-center fade-in"
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) onDragLeave(e);
          }}
        >
          <div className="text-center px-6 pointer-events-none">
            <div className="w-14 h-14 rounded-sm bg-un-blue text-white flex items-center justify-center mx-auto mb-3">
              <FolderPlus className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <div className="text-[17px] font-semibold text-un-blue-dark tracking-tight">
              Drop folders or files to add
            </div>
            <div className="text-[13px] text-un-blue mt-1">
              Folder structure is kept · PDF, Word, Excel, .txt, .md
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function FolderTreeNav({
  folder,
  currentPath,
  depth,
  onNavigate,
  onFolderContextMenu,
  onDeleteFolder,
}: {
  folder: TreeFolder;
  currentPath: string;
  depth: number;
  onNavigate: (path: string) => void;
  onFolderContextMenu: (e: React.MouseEvent, path: string, name: string) => void;
  onDeleteFolder: (path: string) => void;
}) {
  const isRoot = folder.path === '';
  const isActive = currentPath === folder.path;
  const isAncestor =
    !isRoot &&
    (currentPath === folder.path || currentPath.startsWith(`${folder.path}/`));
  const [open, setOpen] = useState(depth < 2 || isAncestor);

  useEffect(() => {
    if (isAncestor) setOpen(true);
  }, [isAncestor]);

  return (
    <div>
      <div
        className={classNames(
          'lib-tree-row group',
          isActive && 'lib-tree-row-active'
        )}
        style={{ paddingLeft: `${6 + depth * 12}px` }}
        onContextMenu={
          isRoot
            ? undefined
            : (e) => onFolderContextMenu(e, folder.path, folder.name)
        }
      >
        <button
          type="button"
          onClick={() => {
            onNavigate(folder.path);
            if (!isRoot) setOpen(true);
          }}
          className="lib-tree-item flex-1 min-w-0"
          title={isRoot ? undefined : 'Right-click to delete folder'}
        >
          {!isRoot ? (
            <span
              role="presentation"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => !o);
              }}
              className="lib-tree-chevron"
            >
              <ChevronRight
                className={classNames(
                  'w-3 h-3 transition-transform',
                  open && 'rotate-90'
                )}
                strokeWidth={2}
              />
            </span>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {isRoot ? (
            <Home className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} />
          ) : open ? (
            <FolderOpen className="w-3.5 h-3.5 shrink-0 text-un-blue" strokeWidth={1.6} />
          ) : (
            <Folder className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} />
          )}
          <span className="truncate flex-1 text-left">
            {isRoot ? 'All files' : folder.name}
          </span>
          <span className="text-[10px] text-gray-400 tabular-nums shrink-0">
            {countFilesRecursive(folder)}
          </span>
        </button>
        {!isRoot && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFolder(folder.path);
            }}
            aria-label={`Delete folder ${folder.name}`}
            title="Delete folder"
            className="lib-tree-delete"
          >
            <Trash2 className="w-3 h-3" strokeWidth={1.75} />
          </button>
        )}
      </div>
      {(isRoot || open) &&
        folder.folders.map((child) => (
          <FolderTreeNav
            key={child.path}
            folder={child}
            currentPath={currentPath}
            depth={depth + 1}
            onNavigate={onNavigate}
            onFolderContextMenu={onFolderContextMenu}
            onDeleteFolder={onDeleteFolder}
          />
        ))}
    </div>
  );
}

function BreadcrumbBar({
  crumbs,
  onNavigate,
}: {
  crumbs: { name: string; path: string }[];
  onNavigate: (path: string) => void;
}) {
  return (
    <nav
      className="mt-5 flex flex-wrap items-center gap-1 text-[12px] text-gray-500"
      aria-label="Breadcrumb"
    >
      <button
        type="button"
        onClick={() => onNavigate('')}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm hover:bg-gray-100 hover:text-ink transition-colors"
      >
        <Home className="w-3 h-3" strokeWidth={1.75} />
        Library
      </button>
      {crumbs.map((c) => (
        <span key={c.path} className="inline-flex items-center gap-1 min-w-0">
          <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" strokeWidth={2} />
          <button
            type="button"
            onClick={() => onNavigate(c.path)}
            className="px-1.5 py-0.5 rounded-sm hover:bg-gray-100 hover:text-ink transition-colors truncate max-w-[10rem]"
          >
            {c.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

function SearchResults({
  query,
  hits,
  onGoTo,
  onOpen,
}: {
  query: string;
  hits: LibrarySearchHit[];
  onGoTo: (hit: LibrarySearchHit) => void;
  onOpen: (doc: UploadedDoc) => void;
}) {
  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-[15px] font-semibold text-ink tracking-tight">
          Where to find &ldquo;{query}&rdquo;
        </h2>
        <span className="text-[12px] text-gray-500">
          {hits.length === 0
            ? 'No matches'
            : `${hits.length} location${hits.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {hits.length === 0 ? (
        <div className="data-table-empty">
          Nothing matched &ldquo;{query}&rdquo; in filenames, folder paths, or document text.
        </div>
      ) : (
        <ul className="lib-search-results list-panel">
          {hits.map((hit) => {
            const kind = docKind(hit.doc.filename);
            return (
              <li key={hit.doc.id} className="lib-search-hit">
                <button
                  type="button"
                  onClick={() => onOpen(hit.doc)}
                  className="lib-search-hit-main"
                >
                  <div className="lib-search-hit-icon">
                    <KindIcon kind={kind} />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-ink truncate">
                        {docDisplayName(hit.doc)}
                      </span>
                      <span className={`chip ${kindChip(kind)} text-[9px] py-0.5 px-1.5`}>
                        {matchKindLabel(hit.kind)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-start gap-1.5 text-[12px] text-gray-500">
                      <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-un-blue" strokeWidth={2} />
                      <span className="leading-snug">
                        You can find it at{' '}
                        <span className="text-ink font-medium">{hit.breadcrumb}</span>
                      </span>
                    </div>
                    {hit.snippet && (
                      <p className="mt-1.5 text-[12px] text-gray-500 leading-relaxed line-clamp-2">
                        {hit.snippet}
                      </p>
                    )}
                  </div>
                </button>
                <div className="lib-search-hit-actions">
                  <Link
                    to={libraryFolderHref(hit.folderPath)}
                    onClick={(e) => {
                      e.preventDefault();
                      onGoTo(hit);
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Open folder
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FileRow({
  doc,
  active,
  highlighted,
  canRemove = true,
  onOpen,
  onRemove,
  rowRef,
}: {
  doc: UploadedDoc;
  active: boolean;
  highlighted: boolean;
  canRemove?: boolean;
  onOpen: () => void;
  onRemove: () => void;
  rowRef: (el: HTMLElement | null) => void;
}) {
  const kind = docKind(doc.filename);
  const name = docDisplayName(doc);

  return (
    <div
      ref={rowRef}
      className={classNames(
        'lib-browser-row lib-browser-file group',
        active && 'lib-browser-row-active',
        highlighted && 'lib-file-highlight'
      )}
    >
      <button type="button" onClick={onOpen} className="lib-browser-file-main">
        {doc.previewUrl ? (
          <img
            src={doc.previewUrl}
            alt=""
            className="w-9 h-11 object-cover object-top rounded-sm border border-rule shrink-0 bg-white"
            draggable={false}
          />
        ) : (
          <span className="text-gray-500 shrink-0">
            <KindIcon kind={kind} />
          </span>
        )}
        <span className="flex-1 min-w-0 text-left">
          <span className="block truncate text-[13px] font-medium text-ink" title={name}>
            {name}
          </span>
          <span className="block text-[11px] text-gray-500 mt-0.5 truncate" title={docBreadcrumbPath(doc)}>
            {docBreadcrumbPath(doc)}
            {' · '}
            {formatBytes(doc.bytes)}
            {doc.pageCount ? ` · ${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'}` : ''}
          </span>
        </span>
        <span className={`chip ${kindChip(kind)} text-[9px] py-0.5 px-1.5 shrink-0`}>
          {kindLabel(kind)}
        </span>
      </button>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          title="Remove"
          className="p-1.5 rounded-sm text-gray-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-accent-red hover:bg-red-50 transition-opacity shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

function EmptyLibrary({
  readOnly = false,
  onPickFiles,
  onPickFolder,
  onDragOver,
  onDrop,
}: {
  readOnly?: boolean;
  onPickFiles: () => void;
  onPickFolder: () => void;
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: (e: React.DragEvent<HTMLElement>) => void;
}) {
  return (
    <div
      className="fade-in"
      onDragOver={readOnly ? undefined : onDragOver}
      onDrop={readOnly ? undefined : onDrop}
    >
      <EmptyState
        icon={Library}
        title={readOnly ? 'Library is empty' : 'Build your knowledge base'}
        description={
          readOnly
            ? 'Nothing is in the knowledge library yet. Someone with edit access needs to upload documents first.'
            : 'Upload an entire folder system — reports, briefs, spreadsheets — and keep the structure. Search or ask Nexus where something lives; you’ll get a link to the exact folder with the file highlighted.'
        }
        action={
          readOnly ? undefined : (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={onPickFolder} className="btn btn-primary">
                <FolderPlus className="w-4 h-4" />
                Upload a folder
              </button>
              <button type="button" onClick={onPickFiles} className="btn btn-secondary">
                <Upload className="w-4 h-4" />
                Upload files
              </button>
            </div>
          )
        }
      >
        {!readOnly && (
          <>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg text-left">
              {[
                { label: 'Keep your folders', hint: 'Paths stay intact' },
                { label: 'Find by location', hint: '“Where are the numbers?”' },
                { label: 'Jump & highlight', hint: 'Deep-link to the file' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-sm border border-rule bg-surface/80 px-3.5 py-3"
                >
                  <div className="text-[12px] font-semibold text-ink">{item.label}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{item.hint}</div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-[12px] text-gray-500">
              Or drag a folder anywhere onto this page.
            </p>
          </>
        )}
      </EmptyState>
    </div>
  );
}

function UploadStrip({
  onPickFiles,
  onPickFolder,
  uploading,
  progress,
  destinationLabel,
  onDragOver,
  onDrop,
}: {
  onPickFiles: () => void;
  onPickFolder: () => void;
  uploading: boolean;
  progress: string | null;
  destinationLabel: string;
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: (e: React.DragEvent<HTMLElement>) => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="w-full flex flex-col sm:flex-row sm:items-center gap-3 rounded-sm border border-dashed border-rule-strong bg-surface-subtle px-4 py-3.5"
    >
      <div className="w-10 h-10 rounded-sm bg-un-blue-bg text-un-blue flex items-center justify-center shrink-0 border border-un-blue-soft">
        <FolderPlus className="w-[18px] h-[18px]" strokeWidth={1.6} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-ink">
          {uploading
            ? progress
              ? `Adding… ${progress}`
              : 'Adding documents…'
            : 'Drop a folder or files here'}
        </div>
        <div className="text-[12px] text-gray-500 mt-0.5">
          Single files go into <span className="text-ink font-medium">{destinationLabel}</span>
          {' · '}
          folder drops keep their full path
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onPickFolder}
          disabled={uploading}
          className="btn btn-secondary btn-sm"
        >
          Folder
        </button>
        <button
          type="button"
          onClick={onPickFiles}
          disabled={uploading}
          className="btn btn-primary btn-sm"
        >
          Files
        </button>
      </div>
    </div>
  );
}
