import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { getDocument } from '../data/documents';
import { getUploadedDocs } from '../lib/uploads';
import { getEvent } from '../data/events';
import { getPublication } from '../data/publications';
import { normalizeCitationMarkers } from '../lib/citations';
import { isSafeHref } from '../lib/safeUrl';

export interface InlineSource {
  documentId: string;
  excerpt: string;
}

interface Props {
  content: string;
  sources: InlineSource[];
  /** citationNumber is 1-based; occurrence is 0-based among matching [n] markers. */
  onCitationClick: (citationNumber: number, occurrence: number) => void;
}

const CITE_PREFIX = '#nexus-cite-';

/**
 * Turn [1] markers into links that encode occurrence:
 * first [1] → #nexus-cite-1.0, second [1] → #nexus-cite-1.1, …
 */
function preprocessCitations(text: string): string {
  const counts = new Map<number, number>();
  return normalizeCitationMarkers(text).replace(/\[(\d+)\](?!\()/g, (_m, nStr: string) => {
    const n = parseInt(nStr, 10);
    const occ = counts.get(n) ?? 0;
    counts.set(n, occ + 1);
    return `[${n}](${CITE_PREFIX}${n}.${occ})`;
  });
}

function docTitle(documentId: string): string {
  if (!documentId) return 'Source';
  const seed = getDocument(documentId);
  if (seed) return seed.title;
  const event = getEvent(documentId);
  if (event) return event.title;
  const pub = getPublication(documentId);
  if (pub) return pub.title;
  const uploaded = getUploadedDocs().find((d) => d.id === documentId);
  return uploaded?.filename ?? 'Source';
}

function isLibraryDeepLink(href: string | undefined): boolean {
  if (!href) return false;
  try {
    if (href.startsWith('/library')) return true;
    const url = new URL(href, window.location.origin);
    return url.origin === window.location.origin && url.pathname === '/library';
  } catch {
    return false;
  }
}

function libraryLinkTo(href: string): string {
  try {
    const url = new URL(href, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

export default function AnswerMarkdown({ content, sources, onCitationClick }: Props) {
  const components: Components = {
    a: ({ href, children }) => {
      if (href?.startsWith(CITE_PREFIX)) {
        const payload = href.slice(CITE_PREFIX.length);
        const [nStr, occStr] = payload.split('.');
        const n = parseInt(nStr, 10);
        const occ = parseInt(occStr ?? '0', 10);
        if (!Number.isFinite(n) || n < 1) return <span>{children}</span>;
        const occurrence = Number.isFinite(occ) && occ >= 0 ? occ : 0;
        const src = sources[n - 1];
        const title = src?.documentId
          ? docTitle(src.documentId)
          : `Source ${n}`;
        return (
          <button
            type="button"
            onClick={() => onCitationClick(n, occurrence)}
            title={`Ground citation ${n} from surrounding claim${src?.documentId ? ` · ${title}` : ''}`}
            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 mx-0.5 -mt-0.5 align-middle rounded-sm bg-un-blue-bg text-un-blue text-[10px] font-bold font-mono hover:bg-un-blue hover:text-white transition-colors"
          >
            {n}
          </button>
        );
      }
      if (isLibraryDeepLink(href) && href) {
        return (
          <Link
            to={libraryLinkTo(href)}
            className="text-un-blue font-medium underline underline-offset-2 decoration-un-blue/40 hover:decoration-un-blue"
          >
            {children}
          </Link>
        );
      }
      if (!href || !isSafeHref(href)) {
        return <span>{children}</span>;
      }
      const external = href.startsWith('http://') || href.startsWith('https://');
      return (
        <a
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {children}
        </a>
      );
    },
    pre: ({ children }) => <pre>{children}</pre>,
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {preprocessCitations(content)}
    </ReactMarkdown>
  );
}
