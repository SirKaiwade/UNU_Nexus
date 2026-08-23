import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

interface Props {
  /** Root element that contains the answer text. */
  containerRef: React.RefObject<HTMLElement | null>;
  onFindSources: (selectedText: string) => void;
}

/**
 * When the user highlights text inside an answer, show a floating
 * “Find sources” control near the selection.
 */
export default function SelectionFindBar({ containerRef, onFindSources }: Props) {
  const [sel, setSel] = useState<{ text: string; top: number; left: number } | null>(
    null
  );
  const barRef = useRef<HTMLDivElement>(null);

  const clear = useCallback(() => setSel(null), []);

  useEffect(() => {
    function update() {
      const root = containerRef.current;
      if (!root) {
        clear();
        return;
      }
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        clear();
        return;
      }
      const text = selection.toString().replace(/\s+/g, ' ').trim();
      if (text.length < 12) {
        clear();
        return;
      }
      const range = selection.getRangeAt(0);
      const common = range.commonAncestorContainer;
      const node = common.nodeType === Node.ELEMENT_NODE ? (common as Node) : common.parentNode;
      if (!node || !root.contains(node)) {
        clear();
        return;
      }
      const rect = range.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      setSel({
        text,
        top: rect.top - rootRect.top - 40,
        left: Math.min(
          Math.max(rect.left - rootRect.left + rect.width / 2, 72),
          rootRect.width - 72
        ),
      });
    }

    function onMouseUp() {
      // Defer so the selection is finalized.
      window.setTimeout(update, 10);
    }

    document.addEventListener('selectionchange', update);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [containerRef, clear]);

  if (!sel) return null;

  return (
    <div
      ref={barRef}
      className="answer-find-bar"
      style={{ top: Math.max(sel.top, 4), left: sel.left }}
    >
      <button
        type="button"
        className="answer-find-btn"
        onMouseDown={(e) => {
          // Keep selection from clearing before click fires.
          e.preventDefault();
        }}
        onClick={() => {
          onFindSources(sel.text);
          clear();
          window.getSelection()?.removeAllRanges();
        }}
      >
        <Search className="w-3.5 h-3.5" strokeWidth={1.75} />
        Find sources
      </button>
    </div>
  );
}
