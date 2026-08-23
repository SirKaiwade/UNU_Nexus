import type { UploadedDoc, DocSource } from '../uploads';
import { getSupabase, supabaseConfigured } from '../supabase';
import { getOrCreateProfileId } from './profiles';

interface LibraryDocRow {
  id: string;
  filename: string;
  byte_size: number | null;
  text_content: string | null;
  source: 'upload' | 'sharepoint' | 'local';
  external_ref: string | null;
  created_at: string;
}

function fromRow(row: LibraryDocRow): UploadedDoc {
  const text = row.text_content ?? '';
  return {
    id: row.id,
    filename: row.filename,
    bytes: row.byte_size ?? text.length,
    uploadedAt: row.created_at,
    text,
    charCount: text.length,
    source: row.source,
    localRelativePath: row.external_ref ?? undefined,
  };
}

/** Every document the whole team has saved to the shared library — not user-scoped for reads. */
export async function loadSharedLibrary(): Promise<UploadedDoc[] | null> {
  if (!supabaseConfigured()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('library_documents')
    .select('id, filename, byte_size, text_content, source, external_ref, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[Nexus] Could not load shared library from Supabase:', error.message);
    return null;
  }
  return (data ?? []).map(fromRow);
}

export interface SaveToLibraryResult {
  ok: boolean;
  error?: string;
}

/** Publishes a library upload so every staff member's corpus includes it. */
export async function saveDocumentToLibrary(
  doc: UploadedDoc,
  uploaderEmail: string
): Promise<SaveToLibraryResult> {
  if (!supabaseConfigured()) {
    return { ok: false, error: 'Shared library requires Supabase to be configured.' };
  }
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Shared library requires Supabase to be configured.' };

  const profileId = await getOrCreateProfileId(uploaderEmail);
  if (!profileId) return { ok: false, error: 'Could not resolve your profile.' };

  const { canonicalizeLibraryPath } = await import('../libraryPath');
  const path = canonicalizeLibraryPath(doc.localRelativePath ?? doc.filename);
  if (path === null) return { ok: false, error: 'Invalid library path.' };

  const { error } = await sb.from('library_documents').upsert({
    id: doc.id,
    user_id: profileId,
    filename: doc.filename,
    byte_size: doc.bytes,
    text_content: doc.text,
    source: (doc.source ?? 'upload') as DocSource,
    external_ref: path || null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeDocumentFromLibrary(id: string): Promise<void> {
  if (!supabaseConfigured()) return;
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('library_documents').delete().eq('id', id);
  if (error) console.warn('[Nexus] Could not remove shared document:', error.message);
}
