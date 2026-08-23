import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Link as LinkIcon,
  MessageSquare,
  Plus,
  Trash2,
} from 'lucide-react';
import type { Publication } from '../types';
import {
  formatAuthors,
  getPublication,
  PUBLICATION_TYPE_DEFINITIONS,
  PUBLICATION_TYPES,
  publicationsStore,
} from '../data/publications';
import SpreadsheetImport from './SpreadsheetImport';
import InlineEditField from './InlineEditField';
import { useLocalDataInfo } from '../lib/localDataSync';
import { classNames, formatDate } from '../lib/format';
import type { ShellContext } from './AppShell';
import { EmptyState, FilterChip, MetaSummary, PageHeader, SearchField } from './ui';
import { makeRecordId } from '../lib/recordId';
import { emptyPublication } from '../lib/recordTemplates';

const TYPE_CHIP_COLORS = ['chip-blue', 'chip-green', 'chip-amber', 'chip-teal', 'chip-red'];

function typeChipClass(type: string | null): string {
  if (!type) return 'chip-gray';
  const i = PUBLICATION_TYPES.indexOf(type as (typeof PUBLICATION_TYPES)[number]);
  return i === -1 ? 'chip-gray' : TYPE_CHIP_COLORS[i % TYPE_CHIP_COLORS.length];
}

function primaryHref(p: Publication): string | null {
  return p.doi || p.externalLink || p.url || p.link || p.collectionsLink || null;
}

export default function PublicationsPage() {
  const ctx = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const publications = publicationsStore.use();
  const dataInfo = useLocalDataInfo();

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const open = searchParams.get('open');
    if (open) {
      setExpandedId(open);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of PUBLICATION_TYPES) counts.set(t, 0);
    for (const p of publications) {
      if (p.type) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    }
    return counts;
  }, [publications]);

  const filterTypes = useMemo(() => {
    const extras = [...typeCounts.keys()].filter(
      (t) => !(PUBLICATION_TYPES as readonly string[]).includes(t) && (typeCounts.get(t) ?? 0) > 0
    );
    return [...PUBLICATION_TYPES, ...extras.sort()];
  }, [typeCounts]);

  const stats = useMemo(() => {
    const peerReviewed = publications.filter((p) => p.type === 'Journal article').length;
    const withLink = publications.filter((p) => primaryHref(p)).length;
    return {
      total: publications.filter((p) => p.title.trim()).length,
      peerReviewed,
      withLink,
    };
  }, [publications]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return publications
      .filter((p) => {
        if (!p.title.trim()) return false;
        if (typeFilter !== 'all' && p.type !== typeFilter) return false;
        if (!q) return true;
        return [
          p.title,
          p.firstAuthor,
          p.otherAuthors,
          p.outlet,
          p.purpose,
          p.type,
          p.fullCitation,
          p.doi,
          p.workPackage,
        ]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q));
      })
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title));
  }, [publications, query, typeFilter]);

  function askNexusAbout(p: Publication) {
    ctx.sendMessage(`What do we know about the publication "${p.title}"?`);
    navigate('/');
  }

  function patchPublication(id: string, patch: Partial<Publication>) {
    const current = getPublication(id);
    if (!current) return;
    const next = { ...current, ...patch };
    // Keep convenience `link` in sync with the best available URL.
    if (
      'doi' in patch ||
      'externalLink' in patch ||
      'url' in patch ||
      'collectionsLink' in patch
    ) {
      next.link =
        next.doi ||
        next.externalLink ||
        next.url ||
        next.collectionsLink ||
        next.link ||
        null;
    }
    publicationsStore.update(next);
  }

  function toggleExpand(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  function addBlank() {
    const blank = {
      ...emptyPublication(),
      id: makeRecordId('pub', `new-${Date.now()}`),
      title: 'Untitled publication',
    };
    publicationsStore.add(blank);
    setExpandedId(blank.id);
  }

  function deletePublication(p: Publication) {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    publicationsStore.remove(p.id);
    if (expandedId === p.id) setExpandedId(null);
  }

  return (
    <section
      className={classNames(
        'flex-1 min-w-0 flex flex-col bg-surface relative',
        ctx.openDocId ? 'border-r border-rule' : ''
      )}
    >
      <PageHeader
        icon={BookOpen}
        title="Publications"
        subtitle={`${stats.total} outputs${dataInfo.label ? ` · ${dataInfo.label}` : ''}`}
        search={
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search publications…"
            className="hidden sm:block"
          />
        }
        actions={
          <>
            <button type="button" onClick={addBlank} className="btn btn-secondary btn-sm">
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
            <SpreadsheetImport kind="publications" />
          </>
        }
      />

      <div className="toolbar">
        <FilterChip
          active={typeFilter === 'all'}
          count={stats.total}
          onClick={() => setTypeFilter('all')}
        >
          All
        </FilterChip>
        {filterTypes.map((type) => (
          <FilterChip
            key={type}
            active={typeFilter === type}
            count={typeCounts.get(type) ?? 0}
            onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
          >
            {type}
          </FilterChip>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-5 lg:px-8 py-5 lg:py-6 space-y-4">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search publications…"
            className="sm:hidden max-w-none"
          />

          <MetaSummary
            items={[
              { label: 'outputs', value: stats.total },
              { label: 'journal articles', value: stats.peerReviewed },
              { label: 'with link / DOI', value: stats.withLink },
            ]}
          />

          <PublicationTypeKey />

          {stats.total === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No publications yet"
              description="Import your publications workbook (.xlsx). Click a row to expand every spreadsheet field under the title. Double-click any field to edit; changes save automatically."
              action={<SpreadsheetImport kind="publications" />}
            />
          ) : filtered.length === 0 ? (
            <div className="data-table-empty">
              {query.trim()
                ? `No publications match "${query}" with these filters.`
                : 'No publications match these filters.'}
            </div>
          ) : (
            <div className="data-register">
              <div className="data-register-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-8" />
                      <th>Date</th>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Authors</th>
                      <th>Outlet</th>
                      <th className="w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const open = expandedId === p.id;
                      return (
                        <PublicationRegisterRows
                          key={p.id}
                          publication={p}
                          open={open}
                          chipClass={typeChipClass(p.type)}
                          onToggle={() => toggleExpand(p.id)}
                          onDelete={() => deletePublication(p)}
                          onAskNexus={() => askNexusAbout(p)}
                          onPatch={(patch) => patchPublication(p.id, patch)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PublicationTypeKey() {
  return (
    <details className="publication-type-key group border border-rule rounded-lg bg-surface mb-4">
      <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none select-none hover:bg-surface-subtle rounded-lg">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">
            Publication type key
          </div>
          <div className="text-[12px] text-gray-500 mt-0.5">
            Filters above use these categories
          </div>
        </div>
        <ChevronDown
          className="w-4 h-4 text-gray-400 shrink-0 transition-transform group-open:rotate-180"
          strokeWidth={1.75}
        />
      </summary>
      <div className="border-t border-rule px-4 py-3">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          {PUBLICATION_TYPES.map((type) => {
            const definition = PUBLICATION_TYPE_DEFINITIONS[type];
            return (
              <div key={type} className="min-w-0">
                <dt className="text-[12px] font-semibold text-ink">{type}</dt>
                {definition ? (
                  <dd className="text-[12px] text-gray-500 mt-0.5 leading-snug">{definition}</dd>
                ) : null}
              </div>
            );
          })}
        </dl>
      </div>
    </details>
  );
}

function PublicationRegisterRows({
  publication: p,
  open,
  chipClass,
  onToggle,
  onDelete,
  onAskNexus,
  onPatch,
}: {
  publication: Publication;
  open: boolean;
  chipClass: string;
  onToggle: () => void;
  onDelete: () => void;
  onAskNexus: () => void;
  onPatch: (patch: Partial<Publication>) => void;
}) {
  const href = primaryHref(p);

  return (
    <>
      <tr className={classNames('data-row', open && 'data-row-open')} onClick={onToggle}>
        <td className="text-gray-400 w-8">
          {open ? (
            <ChevronDown className="w-4 h-4" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
          )}
        </td>
        <td>
          <div className="whitespace-nowrap font-medium tabular-nums text-ink">
            {p.date ? formatDate(p.date) : '—'}
          </div>
        </td>
        <td>
          <div className="min-w-0 max-w-[360px]">
            <div className="font-semibold text-ink leading-snug line-clamp-2">{p.title}</div>
            {p.workPackage && (
              <div className="text-[11px] text-gray-500 mt-0.5 truncate">{p.workPackage}</div>
            )}
          </div>
        </td>
        <td>
          {p.type ? (
            <span className={classNames('chip text-[10px] py-0.5 px-1.5', chipClass)}>{p.type}</span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td>
          <span className="text-[12px] text-gray-700 max-w-[180px] line-clamp-2">
            {formatAuthors(p) || '—'}
          </span>
        </td>
        <td>
          <span className="text-[12px] text-gray-600 max-w-[180px] line-clamp-2">
            {p.outlet || '—'}
          </span>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-0.5">
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-md text-gray-400 hover:text-un-blue hover:bg-un-blue-bg"
                title="Open link"
                aria-label={`Open link for ${p.title}`}
              >
                <LinkIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
              </a>
            )}
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-md text-gray-400 hover:text-accent-red hover:bg-red-50"
              title="Delete"
              aria-label={`Delete ${p.title}`}
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="data-detail">
          <td colSpan={7}>
            <PublicationDetailPanel
              publication={p}
              chipClass={chipClass}
              onAskNexus={onAskNexus}
              onPatch={onPatch}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function PublicationDetailPanel({
  publication: p,
  chipClass,
  onAskNexus,
  onPatch,
}: {
  publication: Publication;
  chipClass: string;
  onAskNexus: () => void;
  onPatch: (patch: Partial<Publication>) => void;
}) {
  const definition =
    p.type && p.type in PUBLICATION_TYPE_DEFINITIONS
      ? PUBLICATION_TYPE_DEFINITIONS[p.type as keyof typeof PUBLICATION_TYPE_DEFINITIONS]
      : undefined;

  const links = [
    { label: 'DOI', href: p.doi },
    { label: 'External', href: p.externalLink },
    { label: 'Collections', href: p.collectionsLink },
    { label: 'URL', href: p.url },
  ].filter((l): l is { label: string; href: string } => Boolean(l.href));

  return (
    <div className="data-detail-panel fade-in">
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {p.type && (
          <span className={classNames('chip text-[10px] py-0.5 px-1.5', chipClass)}>{p.type}</span>
        )}
        {p.date && <span className="text-[12px] text-gray-500">{formatDate(p.date)}</span>}
        {p.inCollections != null && (
          <span className="chip chip-gray text-[10px] py-0.5 px-1.5">
            Collections: {p.inCollections ? 'Yes' : 'No'}
          </span>
        )}
      </div>
      {definition && (
        <p className="text-[12px] text-gray-500 leading-snug mb-2 max-w-3xl">{definition}</p>
      )}
      <p className="text-[11px] text-gray-400 mb-4">Double-click any field to edit · autosaves</p>

      <div className="data-detail-grid">
        <InlineEditField
          label="Title"
          value={p.title}
          onSave={(title) => onPatch({ title: title || p.title })}
        />
        <InlineEditField
          label="Date"
          type="date"
          value={p.date ?? ''}
          onSave={(date) => onPatch({ date: date || null })}
        />
        <InlineEditField
          label="Publication type"
          value={p.type ?? ''}
          onSave={(type) => onPatch({ type: type || null })}
        />
        <InlineEditField
          label="First author"
          value={p.firstAuthor ?? ''}
          onSave={(firstAuthor) => onPatch({ firstAuthor: firstAuthor || null })}
        />
        <InlineEditField
          label="Other authors"
          value={p.otherAuthors ?? ''}
          onSave={(otherAuthors) => onPatch({ otherAuthors: otherAuthors || null })}
        />
        <InlineEditField
          label="Publication name / outlet"
          value={p.outlet ?? ''}
          onSave={(outlet) => onPatch({ outlet: outlet || null })}
        />
        <InlineEditField
          label="Full DOI"
          value={p.doi ?? ''}
          onSave={(doi) => onPatch({ doi: doi || null })}
        />
        <InlineEditField
          label="External link"
          value={p.externalLink ?? ''}
          onSave={(externalLink) => onPatch({ externalLink: externalLink || null })}
        />
        <InlineEditField
          label="UNU Collections link"
          value={p.collectionsLink ?? ''}
          onSave={(collectionsLink) => onPatch({ collectionsLink: collectionsLink || null })}
        />
        <InlineEditField
          label="URL"
          value={p.url ?? ''}
          onSave={(url) => onPatch({ url: url || null })}
        />
        <InlineEditField
          label="ISBN"
          value={p.isbn ?? ''}
          onSave={(isbn) => onPatch({ isbn: isbn || null })}
        />
        <InlineEditField
          label="Pelikan project ID"
          value={p.pelikanProjectId ?? ''}
          onSave={(pelikanProjectId) => onPatch({ pelikanProjectId: pelikanProjectId || null })}
        />
        <InlineEditField
          label="Files"
          value={p.files ?? ''}
          onSave={(files) => onPatch({ files: files || null })}
        />
        <InlineEditField
          label="Work package"
          value={p.workPackage ?? ''}
          onSave={(workPackage) => onPatch({ workPackage: workPackage || null })}
        />
        <InlineEditField
          label="Target audience"
          value={p.targetAudience ?? ''}
          onSave={(targetAudience) => onPatch({ targetAudience: targetAudience || null })}
        />
        <InlineEditField
          label="In UNU Collections (Yes/No)"
          value={p.inCollections == null ? '' : p.inCollections ? 'Yes' : 'No'}
          onSave={(v) => {
            const s = v.trim().toLowerCase();
            if (!s) onPatch({ inCollections: null });
            else if (s.startsWith('y')) onPatch({ inCollections: true });
            else if (s.startsWith('n')) onPatch({ inCollections: false });
          }}
        />
        <InlineEditField
          label="Global South focus (Yes/No)"
          value={p.globalSouth == null ? '' : p.globalSouth ? 'Yes' : 'No'}
          onSave={(v) => {
            const s = v.trim().toLowerCase();
            if (!s) onPatch({ globalSouth: null });
            else if (s.startsWith('y')) onPatch({ globalSouth: true });
            else if (s.startsWith('n')) onPatch({ globalSouth: false });
          }}
        />
      </div>

      <div className="mt-4">
        <InlineEditField
          label="Full citation"
          value={p.fullCitation ?? ''}
          multiline
          onSave={(fullCitation) => onPatch({ fullCitation: fullCitation || null })}
        />
      </div>
      <div className="mt-2">
        <InlineEditField
          label="Comments / purpose"
          value={p.purpose ?? ''}
          multiline
          onSave={(purpose) => onPatch({ purpose: purpose || null })}
        />
      </div>

      {links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-un-blue hover:underline"
            >
              <LinkIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
              Open {l.label}
            </a>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onAskNexus} className="btn btn-secondary btn-sm">
          <MessageSquare className="w-3.5 h-3.5" />
          Ask Nexus
        </button>
      </div>
    </div>
  );
}
