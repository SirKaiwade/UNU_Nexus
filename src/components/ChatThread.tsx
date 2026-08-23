import { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Copy,
  Check,
  ArrowUpRight,
  Upload,
  Paperclip,
  X,
  Library,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Conversation, ChatMessage } from '../types/chat';
import { Avatar, NexusMark, ThinkingBar } from './ui';
import { classNames, formatBytes } from '../lib/format';
import { documents } from '../data/documents';
import { eventsStore } from '../data/events';
import { publicationsStore } from '../data/publications';
import { getPerson } from '../data/people';
import { useAuth } from '../lib/auth';
import {
  ingestFiles,
  persistDocToCloud,
  useUploadedDocs,
  getUploadedDocs,
  type UploadedDoc,
} from '../lib/uploads';
import { filesFromDataTransfer } from '../lib/folderDrop';
import { supabaseConfigured } from '../lib/supabase';
import Composer from './Composer';
import AnswerMarkdown from './AnswerMarkdown';
import SourcesPanel from './SourcesPanel';
import SelectionFindBar from './SelectionFindBar';
import type { CitationRailState, CitationQuoteItem } from './CitationRail';
import {
  buildCitationSlots,
  claimContextAroundCitation,
  occurrenceCacheKey,
} from '../lib/citations';
import { findSupportingQuotes } from '../lib/nexus';
import { getDocument } from '../data/documents';
import { getEvent } from '../data/events';
import { getPublication } from '../data/publications';
import { eventDateLabel } from '../lib/corpusText';
import type { SourceReference } from '../types';

interface Props {
  conversation: Conversation | null;
  onSend: (text: string, options?: { pinnedDocIds?: string[] }) => void;
  onOpenDocument: (id: string, highlight?: string) => void;
  onToggleSave: (messageId: string) => void;
  openDocId: string | null;
  setCitationRail: (state: CitationRailState | null) => void;
}

function hasFilePayload(e: React.DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes('Files');
}

export default function ChatThread({
  conversation,
  onSend,
  onOpenDocument,
  onToggleSave,
  openDocId,
  setCitationRail,
}: Props) {
  const { user } = useAuth();
  const messages = conversation?.messages ?? [];
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const libraryDocs = useUploadedDocs();
  /** Files attached in this chat only — not the full knowledge library. */
  const [attachedIds, setAttachedIds] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const dragDepth = useRef(0);
  /** Keep chips when the first send promotes a draft chat into a real conversation. */
  const promoteAttachments = useRef(false);

  useEffect(() => {
    if (promoteAttachments.current && conversation?.id) {
      promoteAttachments.current = false;
      return;
    }
    setAttachedIds([]);
  }, [conversation?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, messages[messages.length - 1]?.pending, messages[messages.length - 1]?.content]);

  const isEmpty = !conversation || messages.length === 0;

  const attachedDocs = attachedIds
    .map((id) => libraryDocs.find((d) => d.id === id))
    .filter((d): d is UploadedDoc => Boolean(d));

  function addAttachments(docs: UploadedDoc[]) {
    if (docs.length === 0) return;
    setAttachedIds((prev) => {
      const next = [...prev];
      for (const d of docs) {
        if (!next.includes(d.id)) next.push(d.id);
      }
      return next;
    });
  }

  function detachAttachment(id: string) {
    setAttachedIds((prev) => prev.filter((x) => x !== id));
  }

  function resetDrag() {
    dragDepth.current = 0;
    setDragging(false);
  }

  async function ingestMany(files: File[]) {
    if (files.length === 0) return;
    setDropError(null);
    const { docs, errors } = await ingestFiles(files, { skipUnsupported: true });
    const cloud = supabaseConfigured();
    if (cloud && user?.email) {
      for (const doc of docs) {
        const saved = await persistDocToCloud(doc, user.email);
        if (!saved.ok && saved.error) errors.push(saved.error);
      }
    }
    addAttachments(docs);
    if (errors.length) setDropError(errors[0]);
  }

  async function onDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    resetDrag();
    await ingestMany(await filesFromDataTransfer(e.dataTransfer));
  }

  function handleSend(text: string) {
    if (!conversation) promoteAttachments.current = true;
    onSend(text, { pinnedDocIds: attachedIds });
  }

  return (
    <section
      className={classNames(
        'chat-stage flex-1 min-w-0 flex flex-col relative',
        openDocId ? 'border-r border-rule' : ''
      )}
      onDragEnter={(e) => {
        if (!hasFilePayload(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!hasFilePayload(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <header className="chat-topbar shrink-0">
        <div className="chat-topbar-inner">
          <NexusMark size={22} />
          <div className="min-w-0 flex-1">
            <h1 className="chat-topbar-title truncate">
              {conversation ? conversation.title : 'New chat'}
            </h1>
          </div>
          {!isEmpty && (
            <span className="chat-topbar-meta hidden sm:inline">Cited answers</span>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto chat-scroll">
        <div className={classNames('chat-column', isEmpty && 'chat-column-empty')}>
          {isEmpty ? (
            <EmptyChat onSend={handleSend} attachedDocs={attachedDocs} />
          ) : (
            <div className="chat-thread">
              {messages.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  index={i}
                  onOpenDocument={onOpenDocument}
                  onToggleSave={onToggleSave}
                  setCitationRail={setCitationRail}
                />
              ))}
              <div ref={endRef} className="h-6" />
            </div>
          )}
        </div>
      </div>

      <div className="chat-composer-dock shrink-0">
        <div className="chat-composer-fade" aria-hidden="true" />
        <div className="chat-column chat-composer-pad">
          {attachedDocs.length > 0 && (
            <AttachedRail
              docs={attachedDocs}
              onOpen={onOpenDocument}
              onDetach={detachAttachment}
            />
          )}
          <Composer
            onSend={handleSend}
            onAttached={addAttachments}
            placeholder={
              isEmpty
                ? attachedDocs.length > 0
                  ? 'Ask about your attached document…'
                  : 'Ask Nexus…'
                : 'Ask a follow-up…'
            }
          />
          {dropError && (
            <div className="mt-2 text-[12px] text-accent-red fade-in">{dropError}</div>
          )}
          <p className="chat-disclaimer">
            Grounded in your sources · verify citations before briefing
          </p>
        </div>
      </div>

      {dragging && (
        <div
          className="chat-drop-overlay"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={onDrop}
        >
          <div className="chat-drop-card pointer-events-none">
            <Upload className="w-7 h-7 text-un-blue mb-3" strokeWidth={1.5} />
            <div className="text-[16px] font-semibold text-un-blue-dark tracking-tight">
              Drop to attach
            </div>
            <div className="text-[12px] text-un-blue mt-1">PDF, Word, Excel, text</div>
          </div>
        </div>
      )}
    </section>
  );
}

function AttachedRail({
  docs,
  onOpen,
  onDetach,
}: {
  docs: UploadedDoc[];
  onOpen: (id: string) => void;
  onDetach: (id: string) => void;
}) {
  return (
    <div className="mb-3 flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
      {docs.map((d) => (
        <div
          key={d.id}
          className="chat-attach-chip group shrink-0"
          title={`${d.filename} · ${formatBytes(d.bytes)}${d.pageCount ? ` · ${d.pageCount} pages` : ''}`}
        >
          <Paperclip className="w-3 h-3 text-un-blue shrink-0" strokeWidth={1.75} />
          <button
            type="button"
            onClick={() => onOpen(d.id)}
            className="max-w-[140px] truncate text-gray-700 hover:text-un-blue-dark"
          >
            {d.filename}
          </button>
          <button
            type="button"
            onClick={() => onDetach(d.id)}
            aria-label={`Detach ${d.filename}`}
            className="p-0.5 rounded-sm text-gray-400 hover:text-accent-red"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function EmptyChat({
  onSend,
  attachedDocs,
}: {
  onSend: (q: string) => void;
  attachedDocs: UploadedDoc[];
}) {
  const hasUploads = attachedDocs.length > 0;
  const eventCount = eventsStore.get().length;
  const pubCount = publicationsStore.get().length;
  const libCount = documents.length;
  const libraryFileCount = useUploadedDocs().length;
  const hasInstitutional =
    libCount > 0 || eventCount > 0 || pubCount > 0 || libraryFileCount > 0;

  if (!hasUploads && !hasInstitutional) {
    return (
      <div className="chat-empty chat-empty-center fade-up">
        <div className="chat-empty-orb" aria-hidden="true">
          <NexusMark size={36} />
        </div>
        <h2 className="chat-empty-title">Start with your sources</h2>
        <p className="chat-empty-lead">
          Upload reports to the library, or drop a file here. Nexus answers with citations.
        </p>
        <Link to="/library" className="btn btn-primary mt-6">
          <Library className="w-4 h-4" />
          Open knowledge library
        </Link>
        <p className="mt-5 text-[12px] text-gray-500">Or drag a PDF onto this page</p>
      </div>
    );
  }

  const starters = hasUploads
    ? [
        `Summarise ${attachedDocs[0].filename} in 5 lines`,
        `What are the key findings in ${attachedDocs[0].filename}?`,
        attachedDocs.length > 1
          ? `Compare ${attachedDocs[0].filename} to ${attachedDocs[1].filename}`
          : `What questions does ${attachedDocs[0].filename} leave open?`,
      ]
    : [
        'What events are coming up next?',
        'What have we published this year?',
        'Who should I talk to about gender equality?',
      ];

  const corpusBits = hasUploads
    ? [
        `${attachedDocs.length} attached`,
        libraryFileCount > 0
          ? `library · ${libraryFileCount} file${libraryFileCount === 1 ? '' : 's'}`
          : null,
      ].filter(Boolean)
    : [
        libraryFileCount > 0
          ? `${libraryFileCount} library file${libraryFileCount === 1 ? '' : 's'}`
          : null,
        eventCount > 0 ? `${eventCount} events` : null,
        pubCount > 0 ? `${pubCount} publications` : null,
        libCount > 0 ? `${libCount} docs` : null,
      ].filter(Boolean);

  return (
    <div className="chat-empty fade-up">
      <div className="chat-empty-orb" aria-hidden="true">
        <NexusMark size={36} />
      </div>
      <h2 className="chat-empty-title">Ask Nexus</h2>
      <p className="chat-empty-lead">
        Grounded answers from{' '}
        <span className="text-ink font-medium">{corpusBits.join(' · ')}</span>
      </p>

      <div className="chat-starters">
        {starters.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => onSend(s)}
            className="chat-starter group"
            style={{ animationDelay: `${80 + i * 60}ms` }}
          >
            <span className="flex-1 text-left">{s}</span>
            <ArrowUpRight
              className="w-3.5 h-3.5 text-gray-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              strokeWidth={1.75}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  index: number;
  onOpenDocument: (id: string, highlight?: string) => void;
  onToggleSave: (id: string) => void;
  setCitationRail: (state: CitationRailState | null) => void;
}

function sourceMeta(documentId: string): { title: string; subtitle: string } {
  const seed = getDocument(documentId);
  if (seed) return { title: seed.title, subtitle: `${seed.type} · ${seed.team}` };
  const event = getEvent(documentId);
  if (event) return { title: event.title, subtitle: `Event · ${eventDateLabel(event)}` };
  const pub = getPublication(documentId);
  if (pub) {
    return {
      title: pub.title,
      subtitle: `Publication${pub.type ? ` · ${pub.type}` : ''}`,
    };
  }
  const uploaded = getUploadedDocs().find((d) => d.id === documentId);
  if (uploaded) return { title: uploaded.filename, subtitle: 'Library upload' };
  return { title: 'Source', subtitle: '' };
}

function toRailQuotes(
  quotes: Array<{ documentId: string; excerpt: string; relevanceReason: string }>
): CitationQuoteItem[] {
  return quotes.map((q) => {
    const meta = sourceMeta(q.documentId);
    return {
      documentId: q.documentId,
      excerpt: q.excerpt,
      title: meta.title,
      subtitle: meta.subtitle,
      relevanceReason: q.relevanceReason,
    };
  });
}

function MessageBubble({
  message,
  index,
  onToggleSave,
  setCitationRail,
}: MessageBubbleProps) {
  const [focusedSource, setFocusedSource] = useState<number | null>(null);
  const [resolvedSources, setResolvedSources] = useState<SourceReference[]>(
    () => message.sources ?? []
  );
  /** Cache quotes per [n] occurrence so different claims with the same [1] stay distinct. */
  const quoteCache = useRef<Map<string, CitationQuoteItem[]>>(new Map());
  const resolvingRef = useRef<Set<string>>(new Set());
  const answerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    setResolvedSources(message.sources ?? []);
    quoteCache.current.clear();
  }, [message.id, message.sources]);

  const citationSlots = buildCitationSlots(message.content, resolvedSources);

  async function resolveClaim(opts: {
    mode: 'citation' | 'selection';
    label: string;
    claimText: string;
    citationNumber?: number;
    occurrence?: number;
    knownDocumentId?: string;
    maxQuotes?: number;
    cacheKey?: string;
  }) {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const cacheKey = opts.cacheKey;

    if (cacheKey) {
      const cached = quoteCache.current.get(cacheKey);
      if (cached?.length) {
        setCitationRail({
          requestId,
          mode: opts.mode,
          label: opts.label,
          claimText: opts.claimText,
          status: 'ready',
          quotes: cached,
        });
        return;
      }
    }

    if (cacheKey && resolvingRef.current.has(cacheKey)) {
      setCitationRail({
        requestId,
        mode: opts.mode,
        label: opts.label,
        claimText: opts.claimText,
        status: 'loading',
        quotes: [],
      });
      return;
    }

    if (cacheKey) resolvingRef.current.add(cacheKey);

    setCitationRail({
      requestId,
      mode: opts.mode,
      label: opts.label,
      claimText: opts.claimText,
      status: 'loading',
      quotes: [],
    });

    try {
      const results = await findSupportingQuotes({
        claimText: opts.claimText,
        answer: message.content,
        citationNumber: opts.citationNumber,
        knownDocumentId: opts.knownDocumentId,
        maxQuotes: opts.maxQuotes ?? (opts.mode === 'selection' ? 3 : 1),
        uploadedDocs: getUploadedDocs(),
      });
      const quotes = toRailQuotes(results);
      if (cacheKey) quoteCache.current.set(cacheKey, quotes);

      // Keep sources list metadata fresh for the first occurrence of each [n].
      if (opts.citationNumber != null && (opts.occurrence ?? 0) === 0 && results[0]) {
        const srcIndex = opts.citationNumber - 1;
        setResolvedSources((prev) => {
          const copy = [...prev];
          while (copy.length <= srcIndex) {
            copy.push({ documentId: '', excerpt: '', relevanceReason: '' });
          }
          copy[srcIndex] = {
            documentId: results[0].documentId,
            excerpt: results[0].excerpt,
            relevanceReason:
              results[0].relevanceReason || copy[srcIndex]?.relevanceReason || '',
          };
          return copy;
        });
      }

      setCitationRail({
        requestId,
        mode: opts.mode,
        label: opts.label,
        claimText: opts.claimText,
        status: 'ready',
        quotes,
      });
    } catch (err) {
      setCitationRail({
        requestId,
        mode: opts.mode,
        label: opts.label,
        claimText: opts.claimText,
        status: 'error',
        quotes: [],
        error: err instanceof Error ? err.message : 'Could not resolve this claim.',
      });
    } finally {
      if (cacheKey) resolvingRef.current.delete(cacheKey);
    }
  }

  function requestCitationQuote(citationNumber: number, occurrence: number) {
    setFocusedSource(citationNumber - 1);
    const claimText = claimContextAroundCitation(
      message.content,
      citationNumber,
      occurrence
    );
    const knownDocumentId = citationSlots[citationNumber - 1]?.documentId || undefined;
    void resolveClaim({
      mode: 'citation',
      label: `[${citationNumber}]`,
      claimText,
      citationNumber,
      occurrence,
      knownDocumentId,
      maxQuotes: 1,
      cacheKey: occurrenceCacheKey(citationNumber, occurrence),
    });
  }

  function requestFromSourcesPanel(srcIndex: number) {
    // Panel rows map to source index; use first occurrence of that [n].
    requestCitationQuote(srcIndex + 1, 0);
  }

  function requestFromSelection(selectedText: string) {
    void resolveClaim({
      mode: 'selection',
      label: 'Selection',
      claimText: selectedText,
      maxQuotes: 3,
      cacheKey: `sel:${selectedText.slice(0, 120)}`,
    });
  }

  if (message.role === 'user') {
    return (
      <div
        className="chat-msg chat-msg-user fade-up"
        style={{ animationDelay: `${Math.min(index, 4) * 20}ms` }}
      >
        <div className="chat-user-bubble">{message.content}</div>
        <div
          className="chat-avatar chat-avatar-user"
          aria-hidden="true"
          title={user?.name ?? 'You'}
        >
          {user?.initials ?? 'YO'}
        </div>
      </div>
    );
  }

  return (
    <div
      className="chat-msg chat-msg-assistant fade-up"
      style={{ animationDelay: `${Math.min(index, 4) * 20}ms` }}
    >
      <div className="chat-avatar chat-avatar-nexus" aria-hidden="true">
        <NexusMark size={28} />
      </div>
      <div className="chat-assistant-body min-w-0 flex-1">
        {message.pending ? (
          <ThinkingBar label="Searching your sources…" />
        ) : (
          <>
            <div ref={answerRef} className="prose-chat chat-answer relative">
              <AnswerMarkdown
                content={message.content}
                sources={citationSlots}
                onCitationClick={requestCitationQuote}
              />
              <SelectionFindBar
                containerRef={answerRef}
                onFindSources={requestFromSelection}
              />
            </div>

            {citationSlots.length > 0 && (
              <SourcesPanel
                sources={citationSlots}
                focusIndex={focusedSource}
                onRequestQuote={requestFromSourcesPanel}
              />
            )}

            {(message.relatedPeopleIds?.length) ? (
              <div className="chat-related mt-5 space-y-4">
                {message.relatedPeopleIds && message.relatedPeopleIds.length > 0 && (
                  <div>
                    <div className="chat-section-label">People</div>
                    <div className="flex flex-wrap gap-1.5">
                      {message.relatedPeopleIds.map((id) => {
                        const p = getPerson(id);
                        if (!p) return null;
                        return (
                          <span
                            key={id}
                            className="chat-person-chip"
                            title={`${p.role}, ${p.team}`}
                          >
                            <Avatar initials={p.avatarInitials} color={p.avatarColor} size="xs" />
                            {p.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="chat-msg-footer">
              <MessageActions message={message} onToggleSave={onToggleSave} />
              {message.confidence !== undefined && (
                <span className="chat-confidence tabular-nums">
                  {Math.round(message.confidence * 100)}% confidence
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MessageActions({
  message,
  onToggleSave,
}: {
  message: ChatMessage;
  onToggleSave: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function copy() {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onToggleSave(message.id)}
        title={message.saved ? 'Unsave' : 'Save'}
        className={classNames(
          'chat-icon-btn',
          message.saved && 'chat-icon-btn-active'
        )}
      >
        <Bookmark className="w-3.5 h-3.5" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={copy}
        title={copied ? 'Copied' : 'Copy'}
        className={classNames('chat-icon-btn', copied && 'text-accent-green')}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5" strokeWidth={1.75} />
        ) : (
          <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
        )}
      </button>
    </div>
  );
}
