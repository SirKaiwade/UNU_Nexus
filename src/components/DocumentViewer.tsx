import { useEffect, useMemo, useRef } from 'react';
import {
  X,
  FileText,
  Calendar,
  User as UserIcon,
  Tag as TagIcon,
  Mail,
  ExternalLink,
  ArrowUpRight,
  Paperclip,
  Quote,
  AlertTriangle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDocument } from '../data/documents';
import { getPerson } from '../data/people';
import { getEvent } from '../data/events';
import { getPublication } from '../data/publications';
import { eventDateLabel, eventToText, publicationToText } from '../lib/corpusText';
import { FreshnessLabel, Avatar } from './ui';
import { formatBytes, formatDate, formatRelative } from '../lib/format';
import { useUploadedDocs, useDocFileUrl, type UploadedDoc } from '../lib/uploads';
import { docBreadcrumbPath } from '../lib/libraryTree';
import { findHighlight, type HighlightMatchKind } from '../lib/highlight';
import { classNames } from '../lib/format';

const VIEWER_SHELL =
  'flex flex-col shrink-0 border-l border-rule bg-surface z-50 fixed inset-0 lg:relative lg:inset-auto w-full lg:w-[440px] xl:w-[480px]';

interface Props {
  documentId: string | null;
  highlight?: string | null;
  /** Bumped each time openDocument is called, so we re-scroll on repeat clicks. */
  highlightToken?: number;
  onClose: () => void;
  onOpenDocument: (id: string, highlight?: string) => void;
}

export default function DocumentViewer({
  documentId,
  highlight,
  highlightToken = 0,
  onClose,
  onOpenDocument,
}: Props) {
  const doc = useMemo(() => (documentId ? getDocument(documentId) : undefined), [documentId]);
  const allUploaded = useUploadedDocs();
  const uploaded = useMemo(
    () => (documentId && !doc ? allUploaded.find((u) => u.id === documentId) : undefined),
    [documentId, doc, allUploaded]
  );

  if (!documentId) return null;

  const event = !doc && !uploaded ? getEvent(documentId) : undefined;
  const publication = !doc && !uploaded && !event ? getPublication(documentId) : undefined;

  if (event || publication) {
    const record = event
      ? {
          kindLabel: 'Event',
          chip: event.type,
          title: event.title,
          meta: [eventDateLabel(event), event.location].filter(Boolean).join(' · '),
          text: eventToText(event),
          href: `/events?open=${event.id}`,
          hrefLabel: 'Open in Events',
        }
      : {
          kindLabel: 'Publication',
          chip: publication!.type ?? 'Publication',
          title: publication!.title,
          meta: [publication!.outlet, publication!.date ? formatDate(publication!.date) : null]
            .filter(Boolean)
            .join(' · '),
          text: publicationToText(publication!),
          href: `/publications?open=${publication!.id}`,
          hrefLabel: 'Open in Publications',
        };
    return (
      <>
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
          aria-hidden
        />
        <RecordView
          record={record}
          highlight={highlight ?? null}
          highlightToken={highlightToken}
          onClose={onClose}
        />
      </>
    );
  }

  if (uploaded) {
    return (
      <>
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
          aria-hidden
        />
        <UploadedView
          doc={uploaded}
          highlight={highlight ?? null}
          highlightToken={highlightToken}
          onClose={onClose}
        />
      </>
    );
  }

  if (!doc) return null;
  const owner = getPerson(doc.ownerId);

  return (
    <>
      <div
        className="lg:hidden fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
    <aside className={VIEWER_SHELL}>
      <div className="px-5 py-3 border-b border-rule flex items-center gap-3 shrink-0">
        <div className="w-7 h-7 rounded-sm bg-un-blue-bg text-un-blue flex items-center justify-center shrink-0">
          <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-overline uppercase font-semibold text-gray-500 truncate">
            {doc.type}
          </div>
          <div className="text-[13px] font-semibold text-ink truncate" title={doc.title}>
            {doc.title}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close document"
          className="p-1.5 rounded-sm hover:bg-gray-100 text-gray-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1">
        <div className="px-6 py-6">
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <FreshnessLabel freshness={doc.freshness} />
            <span className="chip chip-blue">{doc.type}</span>
            <span className="chip chip-gray">{doc.region}</span>
          </div>
          <h1 className="font-display font-bold text-display-m leading-tight mb-2">{doc.title}</h1>
          <div className="text-[12px] text-gray-500 mb-5">
            {doc.team} · Updated {formatDate(doc.updatedAt)}
          </div>

          <Section title="Summary">
            <p className="text-body-m text-gray-700 leading-relaxed">{doc.summary}</p>
          </Section>

          <Section title="Key takeaways">
            <ul className="space-y-2">
              {doc.takeaways.map((t, i) => (
                <li key={i} className="flex items-start gap-3 text-body-m text-gray-700">
                  <span className="text-overline font-mono text-un-blue shrink-0 mt-0.5">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Section>

          {doc.excerpt && (
            <Section title="Excerpt">
              <blockquote className="border-l-2 border-un-blue pl-3 text-body-m text-gray-700 italic">
                {doc.excerpt}
              </blockquote>
            </Section>
          )}

          <Section title="Metadata">
            <dl className="grid grid-cols-1 gap-3 text-[13px]">
              <Meta
                icon={<UserIcon className="w-3.5 h-3.5 text-gray-400" />}
                label="Owner"
                value={
                  owner ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar initials={owner.avatarInitials} color={owner.avatarColor} size="xs" />
                      {owner.name}
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
              {owner && (
                <Meta
                  icon={<Mail className="w-3.5 h-3.5 text-gray-400" />}
                  label="Contact"
                  value={
                    <a className="text-un-blue hover:underline" href={`mailto:${owner.email}`}>
                      {owner.email}
                    </a>
                  }
                />
              )}
              <Meta
                icon={<Calendar className="w-3.5 h-3.5 text-gray-400" />}
                label="Created"
                value={formatDate(doc.createdAt)}
              />
              <Meta
                icon={<Calendar className="w-3.5 h-3.5 text-gray-400" />}
                label="Last updated"
                value={formatDate(doc.updatedAt)}
              />
              <Meta
                icon={<TagIcon className="w-3.5 h-3.5 text-gray-400" />}
                label="Topics"
                value={
                  <div className="flex flex-wrap gap-1">
                    {doc.topics.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </div>
                }
              />
            </dl>
          </Section>

          {doc.relatedDocIds.length > 0 && (
            <Section title="Related">
              <div className="space-y-1.5">
                {doc.relatedDocIds.map((id) => {
                  const r = getDocument(id);
                  if (!r) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onOpenDocument(id)}
                      className="w-full flex items-start gap-2 px-3 py-2 rounded-sm border border-rule hover:border-un-blue hover:bg-un-blue-bg/40 group text-left"
                    >
                      <FileText
                        className="w-3.5 h-3.5 text-gray-400 group-hover:text-un-blue shrink-0 mt-0.5"
                        strokeWidth={1.75}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-semibold text-ink truncate group-hover:text-un-blue-dark">
                          {r.title}
                        </span>
                        <span className="block text-[11px] text-gray-500 truncate">
                          {r.type} · {formatDate(r.updatedAt)}
                        </span>
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-un-blue shrink-0 mt-0.5" />
                    </button>
                  );
                })}
              </div>
            </Section>
          )}
        </div>
      </div>

      <div className="border-t border-rule p-4 bg-gray-50 shrink-0 text-[11px] text-gray-500 leading-tight">
        Source documents are maintained by the named owner. Flag inaccuracies from the chat.
      </div>
    </aside>
    </>
  );
}

function UploadedView({
  doc,
  highlight,
  highlightToken,
  onClose,
}: {
  doc: UploadedDoc;
  highlight: string | null;
  highlightToken: number;
  onClose: () => void;
}) {
  const match = useMemo(
    () => (highlight ? findHighlight(doc.text, highlight) : null),
    [doc.text, highlight]
  );
  const breadcrumb = docBreadcrumbPath(doc);
  const fileUrl = useDocFileUrl(doc.hasOriginalFile ? doc.id : null);
  const isPdf =
    (doc.mimeType === 'application/pdf' ||
      doc.filename.toLowerCase().endsWith('.pdf')) &&
    Boolean(fileUrl);

  const markRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!match || !markRef.current) return;
    const el = markRef.current;
    const id = requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [match, highlightToken]);

  return (
    <aside className={VIEWER_SHELL}>
      <div className="px-5 py-3 border-b border-rule flex items-center gap-3 shrink-0">
        <div className="w-7 h-7 rounded-sm bg-un-blue-bg text-un-blue flex items-center justify-center shrink-0">
          <Paperclip className="w-3.5 h-3.5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-overline uppercase font-semibold text-gray-500 truncate" title={breadcrumb}>
            {breadcrumb}
          </div>
          <div className="text-[13px] font-semibold text-ink truncate" title={doc.filename}>
            {doc.filename}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close document"
          className="p-1.5 rounded-sm hover:bg-gray-100 text-gray-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1">
        <div className="px-6 py-6">
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="chip chip-green">Saved</span>
            {doc.hasOriginalFile ? (
              <span className="chip chip-blue">Original file</span>
            ) : (
              <span className="chip chip-gray">Text only</span>
            )}
          </div>
          <h1 className="font-display font-bold text-display-m leading-tight mb-2 break-words">
            {doc.filename}
          </h1>
          <div className="text-[12px] text-gray-500 mb-5">
            <span className="text-ink font-medium">{breadcrumb}</span>
            {' · '}
            {formatBytes(doc.bytes)}
            {doc.pageCount ? ` · ${doc.pageCount} pages` : ''} · added{' '}
            {formatRelative(doc.uploadedAt)}
          </div>

          {isPdf && fileUrl && (
            <section className="mb-6">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-overline uppercase font-semibold text-gray-500">
                  File preview
                </h2>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-semibold text-un-blue hover:underline"
                >
                  Open PDF
                </a>
              </div>
              <iframe
                title={doc.filename}
                src={fileUrl}
                className="w-full h-[42vh] min-h-[240px] rounded-sm border border-rule bg-white"
              />
            </section>
          )}

          {highlight && (
            <CitedPassage highlight={highlight} matchKind={match?.kind ?? null} />
          )}

          <section className="mb-6">
            <h2 className="text-overline uppercase font-semibold text-gray-500 mb-2">
              Extracted text
            </h2>
            <div className="text-[12px] text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 border border-rule rounded-sm p-3 max-h-[40vh] overflow-y-auto leading-relaxed">
              <HighlightedText
                text={doc.text}
                match={match}
                markRef={markRef}
                highlightToken={highlightToken}
              />
            </div>
            <div className="mt-2 text-[11px] text-gray-500">
              {doc.charCount.toLocaleString()} characters indexed for search.
              {highlight
                ? match
                  ? match.kind === 'paraphrase'
                    ? ' Approximate passage match highlighted below.'
                    : ' Verified passages are highlighted below.'
                  : ' Could not locate this passage in the extracted text.'
                : ' Nexus searches this text; the original file is kept for preview.'}
            </div>
          </section>
        </div>
      </div>

      <div className="border-t border-rule p-4 bg-gray-50 shrink-0 text-[11px] text-gray-500 leading-tight">
        Original file + extracted text are stored in this browser. Nexus retrieves
        relevant files per question instead of loading the whole library into the prompt.
      </div>
    </aside>
  );
}

interface RecordViewModel {
  kindLabel: string;
  chip: string;
  title: string;
  meta: string;
  text: string;
  href: string;
  hrefLabel: string;
}

function RecordView({
  record,
  highlight,
  highlightToken,
  onClose,
}: {
  record: RecordViewModel;
  highlight: string | null;
  highlightToken: number;
  onClose: () => void;
}) {
  const match = useMemo(
    () => (highlight ? findHighlight(record.text, highlight) : null),
    [record.text, highlight]
  );
  const markRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!match || !markRef.current) return;
    const el = markRef.current;
    const id = requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [match, highlightToken]);

  return (
    <aside className={VIEWER_SHELL}>
      <div className="px-5 py-3 border-b border-rule flex items-center gap-3 shrink-0">
        <div className="w-7 h-7 rounded-sm bg-un-blue-bg text-un-blue flex items-center justify-center shrink-0">
          <Calendar className="w-3.5 h-3.5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-overline uppercase font-semibold text-gray-500 truncate">
            {record.kindLabel}
          </div>
          <div className="text-[13px] font-semibold text-ink truncate" title={record.title}>
            {record.title}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 rounded-sm hover:bg-gray-100 text-gray-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1">
        <div className="px-6 py-6">
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="chip chip-blue">{record.kindLabel}</span>
            <span className="chip chip-gray">{record.chip}</span>
          </div>
          <h1 className="font-display font-bold text-display-m leading-tight mb-2 break-words">
            {record.title}
          </h1>
          {record.meta && <div className="text-[12px] text-gray-500 mb-5">{record.meta}</div>}

          {highlight && <CitedPassage highlight={highlight} matchKind={match?.kind ?? null} />}

          <section className="mb-6">
            <h2 className="text-overline uppercase font-semibold text-gray-500 mb-2">
              Record details
            </h2>
            <div className="text-[12px] text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 border border-rule rounded-sm p-3 max-h-[60vh] overflow-y-auto leading-relaxed">
              <HighlightedText
                text={record.text}
                match={match}
                markRef={markRef}
                highlightToken={highlightToken}
              />
            </div>
          </section>
        </div>
      </div>

      <div className="border-t border-rule p-4 flex items-center justify-between bg-gray-50 shrink-0">
        <div className="text-[11px] text-gray-500 leading-tight">
          Synced from the {record.kindLabel === 'Event' ? 'events matrix' : 'publications mastersheet'}.
        </div>
        <Link to={record.href} onClick={onClose} className="btn btn-secondary btn-sm">
          <ExternalLink className="w-3.5 h-3.5" />
          {record.hrefLabel}
        </Link>
      </div>
    </aside>
  );
}

function CitedPassage({
  highlight,
  matchKind,
}: {
  highlight: string;
  matchKind: HighlightMatchKind | null;
}) {
  return (
    <section className="mb-5 border border-un-blue-soft bg-un-blue-bg/60 rounded-sm">
      <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5 text-overline uppercase font-semibold text-un-blue-dark">
        <Quote className="w-3 h-3" strokeWidth={2} />
        Cited passage
      </div>
      <blockquote className="px-3 pb-3 text-[13px] text-ink leading-relaxed italic">
        “{highlight.replace(/^[…\s]+|[…\s]+$/g, '').trim()}”
      </blockquote>
      {matchKind === 'paraphrase' && (
        <div className="px-3 py-2 border-t border-un-blue-soft bg-amber-50 text-[11px] text-amber-900 flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" strokeWidth={2} />
          <span>
            No exact match — the closest related passage is highlighted below. The model may
            have paraphrased; review before citing.
          </span>
        </div>
      )}
      {!matchKind && (
        <div className="px-3 py-2 border-t border-un-blue-soft bg-amber-50 text-[11px] text-amber-900 flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" strokeWidth={2} />
          <span>
            Couldn't find this passage in the extracted text. Review the full source below
            before citing.
          </span>
        </div>
      )}
    </section>
  );
}

function HighlightedText({
  text,
  match,
  markRef,
  highlightToken,
}: {
  text: string;
  match: { start: number; end: number; kind: HighlightMatchKind } | null;
  markRef: React.MutableRefObject<HTMLElement | null>;
  highlightToken: number;
}) {
  if (!match) return <>{text}</>;
  const before = text.slice(0, match.start);
  const hit = text.slice(match.start, match.end);
  const after = text.slice(match.end);
  return (
    <>
      {before}
      <mark
        key={highlightToken}
        ref={(el) => {
          markRef.current = el;
        }}
        className={classNames(
          'text-ink ring-1',
          match.kind === 'paraphrase'
            ? 'nexus-highlight-paraphrase ring-amber-400'
            : 'nexus-highlight ring-amber-300'
        )}
      >
        {hit}
      </mark>
      {after}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <h2 className="text-overline uppercase font-semibold text-gray-500 mb-2">{title}</h2>
      {children}
    </section>
  );
}

function Meta({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
      <dt className="flex items-center gap-1.5 text-[12px] text-gray-500">
        {icon}
        {label}
      </dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
