import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import ConversationsSidebar from './ConversationsSidebar';
import DocumentViewer from './DocumentViewer';
import CitationRail, { type CitationRailState } from './CitationRail';
import BrandMark from './BrandMark';
import { useConversations } from '../lib/conversations';
import { initLocalDataSync } from '../lib/localDataSync';
import { supabaseConfigured } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { Conversation } from '../types/chat';

export interface ShellContext {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  activeId: string | null;
  startNew: () => void;
  openConversation: (id: string) => void;
  sendMessage: (text: string, options?: { pinnedDocIds?: string[] }) => void;
  toggleSave: (messageId: string) => void;
  deleteConversation: (id: string) => void;
  openDocId: string | null;
  openDocument: (id: string, highlight?: string) => void;
  closeDocument: () => void;
  citationRail: CitationRailState | null;
  setCitationRail: (state: CitationRailState | null) => void;
  closeCitationRail: () => void;
}

export default function AppShell() {
  const conv = useConversations();
  const { user } = useAuth();
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  // Bumped on every open call so the viewer re-scrolls even when the user
  // clicks the same citation twice.
  const [highlightToken, setHighlightToken] = useState(0);
  const [citationRail, setCitationRail] = useState<CitationRailState | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('nexus:sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('nexus:sidebar-collapsed', next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }

  // Sync shared records + hydrate durable library (IndexedDB + optional Supabase).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { initLibraryStore, pruneLibraryByAccess, hydrateSharedDocs, syncUnsharedDocsToCloud } =
        await import('../lib/uploads');
      await initLibraryStore();
      if (cancelled) return;

      const { loadSharedLibrary } = await import('../lib/db/library');
      const { loadLibraryAccessContext, filterDocsByLibraryAccess } = await import(
        '../lib/libraryAccess'
      );
      const { canReadLibraryPath } = await import('../lib/permissions');

      const access = user?.email
        ? await loadLibraryAccessContext({
            email: user.email,
            isAdmin: Boolean(user.isAdmin),
            libraryRole: user.libraryRole ?? 'none',
            profileId: user.profileId,
          })
        : {
            isAdmin: false,
            libraryRole: 'none' as const,
            profileId: null,
            viewersByPath: new Map(),
          };

      if (cancelled) return;

      const [dataResult, sharedDocs] = await Promise.all([
        initLocalDataSync(),
        supabaseConfigured() ? loadSharedLibrary() : Promise.resolve(null),
      ]);
      if (!cancelled && dataResult.available) {
        console.info('[Nexus] Local data folder (dev only):', dataResult.path);
      }
      if (!cancelled && sharedDocs) {
        hydrateSharedDocs(filterDocsByLibraryAccess(sharedDocs, access));
      }
      if (!cancelled && !access.isAdmin) {
        pruneLibraryByAccess((doc) =>
          canReadLibraryPath(doc.localRelativePath, {
            isAdmin: false,
            libraryRole: access.libraryRole,
            profileId: access.profileId,
            viewersByPath: access.viewersByPath,
          })
        );
      }
      if (!cancelled && user?.email && supabaseConfigured()) {
        await syncUnsharedDocsToCloud(user.email);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email, user?.isAdmin, user?.libraryRole, user?.profileId]);

  const closeCitationRail = useCallback(() => {
    setCitationRail(null);
  }, []);

  const openDocument = useCallback((id: string, highlightText?: string) => {
    setCitationRail(null);
    setOpenDocId(id);
    setHighlight(highlightText ?? null);
    if (highlightText) {
      setHighlightToken((n) => n + 1);
    }
  }, []);

  const closeDocument = useCallback(() => {
    setOpenDocId(null);
    setHighlight(null);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (openDocId) {
        setOpenDocId(null);
        setHighlight(null);
        return;
      }
      if (citationRail) setCitationRail(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openDocId, citationRail]);

  const ctx: ShellContext = {
    ...conv,
    openDocId,
    openDocument,
    closeDocument,
    citationRail,
    setCitationRail,
    closeCitationRail,
  };

  const showDoc = Boolean(openDocId);
  const showRail = Boolean(citationRail) && !showDoc;

  return (
    <div className="h-screen flex flex-col bg-surface text-ink overflow-hidden">
      <div className="un-stripe shrink-0" />
      <div className="md:hidden shrink-0 h-12 px-3 border-b border-rule flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
          className="p-1.5 rounded-sm text-gray-600 hover:text-ink hover:bg-gray-100 -ml-1"
        >
          <Menu className="w-5 h-5" strokeWidth={1.75} />
        </button>
        <BrandMark
          emblemSize={34}
          org="UNU Global Health"
          nameClassName="text-[17px] font-bold leading-none tracking-tight"
          orgClassName="text-[10px]"
        />
      </div>
      <div className="flex flex-1 min-h-0">
        <ConversationsSidebar
          conversations={conv.conversations}
          activeId={conv.activeId}
          onNew={conv.startNew}
          onOpen={conv.openConversation}
          onDelete={conv.deleteConversation}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />
        <Outlet context={ctx} />
        {showRail && (
          <CitationRail
            state={citationRail}
            onClose={closeCitationRail}
            onOpenDocument={openDocument}
          />
        )}
        <DocumentViewer
          documentId={showDoc ? openDocId : null}
          highlight={highlight}
          highlightToken={highlightToken}
          onClose={closeDocument}
          onOpenDocument={openDocument}
        />
      </div>
    </div>
  );
}
