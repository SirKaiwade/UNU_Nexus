import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileText, Quote } from 'lucide-react';
import type { SourceReference } from '../types';
import { getDocument } from '../data/documents';
import { getEvent } from '../data/events';
import { getPublication } from '../data/publications';
import { eventDateLabel } from '../lib/corpusText';
import { getUploadedDocs } from '../lib/uploads';
import { classNames } from '../lib/format';

interface Props {
  sources: SourceReference[];
  focusIndex?: number | null;
  /** Click a source row → resolve / show quote on demand. */
  onRequestQuote: (index: number) => void;
}

function docLabel(documentId: string): { title: string; subtitle: string } | null {
  if (!documentId) return null;
  const seed = getDocument(documentId);
  if (seed) {
    return { title: seed.title, subtitle: `${seed.type} · ${seed.team}` };
  }
  const event = getEvent(documentId);
  if (event) {
    return {
      title: event.title,
      subtitle: `Event · ${eventDateLabel(event)}`,
    };
  }
  const pub = getPublication(documentId);
  if (pub) {
    return {
      title: pub.title,
      subtitle: `Publication${pub.type ? ` · ${pub.type}` : ''}`,
    };
  }
  const uploaded = getUploadedDocs().find((d) => d.id === documentId);
  if (uploaded) {
    return { title: uploaded.filename, subtitle: 'Library upload' };
  }
  return null;
}

export default function SourcesPanel({
  sources,
  focusIndex = null,
  onRequestQuote,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (focusIndex == null) return;
    setExpanded(true);
    const el = rowRefs.current.get(focusIndex);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }, [focusIndex]);

  if (sources.length === 0) return null;

  return (
    <div className="chat-sources mt-5 fade-in">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="chat-sources-toggle"
        aria-expanded={expanded}
      >
        <FileText className="w-3.5 h-3.5 text-un-blue shrink-0" strokeWidth={1.75} />
        <span className="font-semibold text-ink">
          {sources.length} source{sources.length === 1 ? '' : 's'}
        </span>
        <span className="text-gray-500 hidden sm:inline">· click for quote</span>
        <ChevronDown
          className={classNames(
            'w-3.5 h-3.5 text-gray-400 ml-auto shrink-0 transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {expanded && (
        <div className="chat-sources-list">
          {sources.map((source, i) => {
            const meta = docLabel(source.documentId);
            const index = i + 1;
            const title = meta?.title ?? `Source ${index}`;
            const subtitle = meta?.subtitle
              ?? (source.relevanceReason || 'Click to produce supporting quote');
            const hasQuote = Boolean(source.excerpt?.trim());

            return (
              <div
                key={`${source.documentId || 'slot'}-${i}`}
                ref={(el) => {
                  if (el) rowRefs.current.set(i, el);
                  else rowRefs.current.delete(i);
                }}
                className={classNames(
                  'chat-source-row',
                  focusIndex === i && 'chat-source-row-focus'
                )}
              >
                <button
                  type="button"
                  onClick={() => onRequestQuote(i)}
                  className="w-full text-left flex items-start gap-2.5 group"
                >
                  <span className="chat-cite-num">{index}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-ink truncate group-hover:text-un-blue-dark transition-colors">
                      {title}
                    </span>
                    <span className="block text-[11px] text-gray-500 truncate mt-0.5">
                      {subtitle}
                    </span>
                  </span>
                  <span className="shrink-0 mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-un-blue opacity-70 group-hover:opacity-100">
                    <Quote className="w-3 h-3" strokeWidth={1.75} />
                    {hasQuote ? 'View' : 'Quote'}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
