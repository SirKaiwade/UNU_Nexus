import type { Conversation, ChatMessage } from '../../types/chat';
import { getSupabase, supabaseConfigured } from '../supabase';
import { getOrCreateProfileId } from './profiles';
import type { Json } from './types';

const STORAGE_PREFIX = 'nexus:conversations:';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function readLocal(userId: string): Conversation[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(userId: string, conversations: Conversation[]): void {
  localStorage.setItem(storageKey(userId), JSON.stringify(conversations));
}

interface MessageMetadata {
  sources?: ChatMessage['sources'];
  confidence?: number;
  followUps?: string[];
  relatedPeopleIds?: string[];
  saved?: boolean;
  noAnswer?: boolean;
}

function rowsToConversations(
  convRows: { id: string; title: string; created_at: string; updated_at: string }[],
  msgRows: {
    id: string;
    conversation_id: string;
    role: 'user' | 'assistant';
    content: string;
    metadata: Json;
    created_at: string;
  }[]
): Conversation[] {
  const messagesByConv = new Map<string, ChatMessage[]>();
  for (const row of msgRows) {
    const meta = (row.metadata ?? {}) as MessageMetadata;
    const msg: ChatMessage = {
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
      sources: meta.sources,
      confidence: meta.confidence,
      followUps: meta.followUps,
      relatedPeopleIds: meta.relatedPeopleIds,
      saved: meta.saved,
      noAnswer: meta.noAnswer,
    };
    const list = messagesByConv.get(row.conversation_id) ?? [];
    list.push(msg);
    messagesByConv.set(row.conversation_id, list);
  }

  return convRows.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    messages: messagesByConv.get(c.id) ?? [],
  }));
}

async function loadFromSupabase(profileId: string): Promise<Conversation[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: convRows, error: convError } = await sb
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .eq('user_id', profileId)
    .order('updated_at', { ascending: false });

  if (convError) {
    console.warn('[Nexus] Could not load conversations from Supabase:', convError.message);
    return null;
  }
  if (!convRows || convRows.length === 0) return [];

  const { data: msgRows, error: msgError } = await sb
    .from('messages')
    .select('id, conversation_id, role, content, metadata, created_at')
    .in(
      'conversation_id',
      convRows.map((c) => c.id)
    )
    .order('created_at', { ascending: true });

  if (msgError) {
    console.warn('[Nexus] Could not load messages from Supabase:', msgError.message);
    return null;
  }

  return rowsToConversations(convRows, msgRows ?? []);
}

async function saveToSupabase(profileId: string, conversations: Conversation[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  if (conversations.length > 0) {
    const { error: upsertConvError } = await sb.from('conversations').upsert(
      conversations.map((c) => ({
        id: c.id,
        user_id: profileId,
        title: c.title,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
      }))
    );
    if (upsertConvError) {
      console.warn('[Nexus] Could not save conversations to Supabase:', upsertConvError.message);
      return;
    }
  }

  // Full-snapshot sync: drop any conversation for this user that's no longer
  // in the local snapshot (e.g. deleted), then replace each kept
  // conversation's messages wholesale — small threads, simplest to reason
  // about, and avoids diffing bugs on edited/saved messages.
  const { data: existingRows } = await sb
    .from('conversations')
    .select('id')
    .eq('user_id', profileId);
  const keepIds = new Set(conversations.map((c) => c.id));
  const staleIds = (existingRows ?? []).map((r) => r.id).filter((id) => !keepIds.has(id));
  if (staleIds.length > 0) {
    await sb.from('conversations').delete().in('id', staleIds);
  }

  for (const conv of conversations) {
    const persistable = conv.messages.filter((m) => !m.pending && m.content.trim().length > 0);
    await sb.from('messages').delete().eq('conversation_id', conv.id);
    if (persistable.length === 0) continue;
    const { error: msgError } = await sb.from('messages').insert(
      persistable.map((m) => ({
        id: m.id,
        conversation_id: conv.id,
        role: m.role,
        content: m.content,
        metadata: {
          sources: m.sources,
          confidence: m.confidence,
          followUps: m.followUps,
          relatedPeopleIds: m.relatedPeopleIds,
          saved: m.saved,
          noAnswer: m.noAnswer,
        } satisfies MessageMetadata as Json,
        created_at: m.createdAt,
      }))
    );
    if (msgError) {
      console.warn('[Nexus] Could not save messages to Supabase:', msgError.message);
    }
  }
}

/** Load conversations — Supabase when configured, otherwise localStorage. */
export async function loadConversations(
  userId: string,
  email?: string
): Promise<Conversation[]> {
  if (supabaseConfigured()) {
    const profileId = await getOrCreateProfileId(email ?? userId);
    if (profileId) {
      const remote = await loadFromSupabase(profileId);
      if (remote) return remote;
    }
    // Supabase configured but unreachable/failed — fall back so the app stays usable.
  }
  return readLocal(userId);
}

/** Persist conversations — Supabase when configured (with a local mirror), localStorage otherwise. */
export async function saveConversations(
  userId: string,
  conversations: Conversation[],
  email?: string
): Promise<void> {
  writeLocal(userId, conversations);
  if (!supabaseConfigured()) return;
  const profileId = await getOrCreateProfileId(email ?? userId);
  if (!profileId) return;
  await saveToSupabase(profileId, conversations);
}

export function dbBackend(): 'supabase' | 'local' {
  return supabaseConfigured() ? 'supabase' : 'local';
}
