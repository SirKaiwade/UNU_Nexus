import { Loader2, X, Eye, MapPin, AlertTriangle, Quote, Sparkles } from 'lucide-react';
import { classNames } from '../lib/format';

export interface CitationQuoteItem {
  documentId: string;
  excerpt: string;
  title: string;
  subtitle: string;
  relevanceReason?: string;
}

export type CitationRailState = {
  /** Unique id so repeat clicks remount loading UI. */
  requestId: string;
  mode: 'citation' | 'selection';
  label: string;
  claimText: string;
  status: 'loading' | 'ready' | 'error';
  quotes: CitationQuoteItem[];
  error?: string;
};

interface Props {
  state: CitationRailState | null;
  onClose: () => void;
  onOpenDocument: (documentId: string, excerpt?: string) => void;
}

export default function CitationRail({ state, onClose, onOpenDocument }: Props) {
  if (!state) return null;

  return (
    <>
      <div
        className="lg:hidden fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="cite-rail flex flex-col shrink-0 border-l border-rule bg-surface z-50 fixed inset-0 lg:relative lg:inset-auto w-full lg:w-[420px] xl:w-[460px]"
        aria-label="Source quote"
      >
        <header className="cite-rail-header shrink-0">
          <div className="cite-rail-orb" aria-hidden="true">
            {state.status === 'loading' ? (
              <Loader2 className="w-4 h-4 text-un-blue animate-spin" />
            ) : (
              <Quote className="w-4 h-4 text-un-blue" strokeWidth={1.75} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="cite-rail-kicker">
              {state.mode === 'selection' ? 'Highlighted claim' : `Citation ${state.label}`}
            </p>
            <h2 className="cite-rail-title">
              {state.status === 'loading'
                ? 'Finding supporting quote…'
                : state.status === 'error'
                  ? 'Could not resolve quote'
                  : state.quotes.length > 1
                    ? `${state.quotes.length} supporting quotes`
                    : 'Supporting quote'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cite-rail-close"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </header>

        <div className="cite-rail-claim shrink-0">
          <div className="cite-rail-claim-label">
            <Sparkles className="w-3 h-3" strokeWidth={1.75} />
            Claim being grounded
          </div>
          <p className="cite-rail-claim-text">{state.claimText}</p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto cite-rail-body">
          {state.status === 'loading' && (
            <div className="cite-rail-loading">
              <div className="cite-rail-pulse" aria-hidden="true" />
              <p>Nexus is searching your sources for an exact quote…</p>
            </div>
          )}

          {state.status === 'error' && (
            <div className="cite-rail-error">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{state.error ?? 'Something went wrong resolving this claim.'}</p>
            </div>
          )}

          {state.status === 'ready' &&
            state.quotes.map((q, i) => (
              <article
                key={`${q.documentId}-${i}`}
                className={classNames('cite-rail-card', i > 0 && 'mt-4')}
              >
                <div className="cite-rail-card-meta">
                  <span className="cite-rail-card-num">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="cite-rail-card-title truncate">{q.title}</div>
                    {q.subtitle && (
                      <div className="cite-rail-card-sub truncate">{q.subtitle}</div>
                    )}
                  </div>
                </div>
                <blockquote className="cite-rail-quote">
                  “{q.excerpt.replace(/^[“”"'\s]+|[“”"'\s]+$/g, '').trim()}”
                </blockquote>
                {q.relevanceReason && (
                  <p className="cite-rail-reason">{q.relevanceReason}</p>
                )}
                <div className="cite-rail-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onOpenDocument(q.documentId, q.excerpt)}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    Find in document
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-gray-600"
                    onClick={() => onOpenDocument(q.documentId)}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Open
                  </button>
                </div>
              </article>
            ))}
        </div>
      </aside>
    </>
  );
}
