import { useCallback, useEffect, useRef, useState } from 'react';
import type { Conversation, ChatMessage } from '../types/chat';
import { useAuth } from './auth';
import { loadConversations, saveConversations } from './db/conversations';
import { askNexus } from './nexus';
import { getUploadedDocs } from './uploads';

function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36).slice(-4)}`;
}

function titleFromQuestion(q: string): string {
  const trimmed = q.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + '…';
}

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const aborters = useRef<AbortController[]>([]);

  useEffect(() => {
    return () => {
      aborters.current.forEach((a) => a.abort());
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      setActiveId(null);
      setHydrated(false);
      return;
    }
    let cancelled = false;
    setHydrated(false);
    loadConversations(user.id, user.email).then((data) => {
      if (!cancelled) {
        setConversations(data);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!user || !hydrated) return;
    void saveConversations(user.id, conversations, user.email);
  }, [user?.id, user?.email, hydrated, conversations]);

  const activeConversation = activeId
    ? conversations.find((c) => c.id === activeId) || null
    : null;

  const startNew = useCallback(() => {
    setActiveId(null);
  }, []);

  const openConversation = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const sendMessage = useCallback(
    (text: string, options?: { pinnedDocIds?: string[] }) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const now = new Date().toISOString();
      const userMsg: ChatMessage = {
        id: uid('m'),
        role: 'user',
        content: trimmed,
        createdAt: now,
      };
      const pendingMsg: ChatMessage = {
        id: uid('m'),
        role: 'assistant',
        content: '',
        createdAt: now,
        pending: true,
      };

      let priorMessages: ChatMessage[] = [];
      let resolvedConvId: string;
      const pinnedDocIds = options?.pinnedDocIds ?? [];

      setConversations((prev) => {
        let conv = activeId ? prev.find((c) => c.id === activeId) : null;
        let next: Conversation[];

        if (!conv) {
          conv = {
            id: uid('c'),
            title: titleFromQuestion(trimmed),
            createdAt: now,
            updatedAt: now,
            messages: [userMsg, pendingMsg],
          };
          setActiveId(conv.id);
          resolvedConvId = conv.id;
          priorMessages = [];
          next = [conv, ...prev];
        } else {
          priorMessages = conv.messages;
          resolvedConvId = conv.id;
          const updated: Conversation = {
            ...conv,
            updatedAt: now,
            messages: [...conv.messages, userMsg, pendingMsg],
            title:
              conv.messages.length === 0
                ? titleFromQuestion(trimmed)
                : conv.title,
          };
          next = prev.map((c) => (c.id === updated.id ? updated : c));
        }
        return next;
      });

      const pendingId = pendingMsg.id;
      const aborter = new AbortController();
      aborters.current.push(aborter);

      (async () => {
        try {
          const result = await askNexus(trimmed, priorMessages, getUploadedDocs(), {
            pinnedDocIds,
          });
          if (aborter.signal.aborted) return;
          const completedAt = new Date().toISOString();

          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== resolvedConvId) return c;
              const newMessages = c.messages.map((m) => {
                if (m.id !== pendingId) return m;
                return {
                  ...m,
                  pending: false,
                  content: result.answer,
                  sources: result.sources,
                  confidence: result.confidence,
                  followUps: result.followUps,
                  relatedPeopleIds: result.relatedPeopleIds,
                  noAnswer: result.noAnswer,
                  createdAt: completedAt,
                } as ChatMessage;
              });
              return { ...c, messages: newMessages, updatedAt: completedAt };
            })
          );
        } catch (err) {
          if (aborter.signal.aborted) return;
          const completedAt = new Date().toISOString();
          const errMsg =
            err instanceof Error ? err.message : 'Unknown error';
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== resolvedConvId) return c;
              const newMessages = c.messages.map((m) => {
                if (m.id !== pendingId) return m;
                return {
                  ...m,
                  pending: false,
                  noAnswer: true,
                  content: `Nexus could not complete this request.\n\n\`${errMsg}\`\n\nCheck your API key in \`.env.local\` and the browser console for details.`,
                  createdAt: completedAt,
                } as ChatMessage;
              });
              return { ...c, messages: newMessages, updatedAt: completedAt };
            })
          );
        } finally {
          aborters.current = aborters.current.filter((a) => a !== aborter);
        }
      })();
    },
    [activeId]
  );

  const toggleSave = useCallback((messageId: string) => {
    setConversations((prev) =>
      prev.map((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === messageId ? { ...m, saved: !m.saved } : m
        ),
      }))
    );
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(null);
    },
    [activeId]
  );

  return {
    conversations,
    activeConversation,
    activeId,
    startNew,
    openConversation,
    sendMessage,
    toggleSave,
    deleteConversation,
  };
}
