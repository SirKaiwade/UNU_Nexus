import { getSupabase, supabaseConfigured } from '../supabase';
import { callEdgeFunction } from '../edgeFn';
import {
  BOOTSTRAP_ADMIN_EMAILS,
  isBootstrapAdmin,
  normalizeLibraryRole,
  type LibraryRole,
} from '../permissions';
import { getOrCreateProfileId } from './profiles';
import { canonicalizeLibraryPath } from '../libraryPath';

export interface ProfileRecord {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  library_role: LibraryRole;
  disabled_at: string | null;
  disabled_reason: string | null;
  created_at: string;
}

export interface BannedEmailRecord {
  email: string;
  reason: string | null;
  banned_by: string | null;
  banned_at: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapProfile(row: {
  id: string;
  email: string;
  display_name: string | null;
  is_admin?: boolean | null;
  library_role?: string | null;
  disabled_at?: string | null;
  disabled_reason?: string | null;
  created_at: string;
}): ProfileRecord {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    is_admin: Boolean(row.is_admin) || isBootstrapAdmin(row.email),
    library_role: normalizeLibraryRole(row.library_role),
    disabled_at: row.disabled_at ?? null,
    disabled_reason: row.disabled_reason ?? null,
    created_at: row.created_at,
  };
}

export async function fetchProfileByEmail(email: string): Promise<ProfileRecord | null> {
  if (!supabaseConfigured()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('profiles')
    .select('id, email, display_name, is_admin, library_role, disabled_at, disabled_reason, created_at')
    .eq('email', normalizeEmail(email))
    .maybeSingle();
  if (error) {
    const { data: basic } = await sb
      .from('profiles')
      .select('id, email, display_name, created_at')
      .eq('email', normalizeEmail(email))
      .maybeSingle();
    if (!basic) return null;
    return mapProfile({
      ...basic,
      is_admin: isBootstrapAdmin(basic.email),
      library_role: 'none',
      disabled_at: null,
      disabled_reason: null,
    });
  }
  if (!data) return null;
  return mapProfile(data);
}

export async function ensureBootstrapAdmin(email: string): Promise<void> {
  if (!isBootstrapAdmin(email) || !supabaseConfigured()) return;
  await getOrCreateProfileId(email);
}

export async function isEmailBanned(email: string): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  const sb = getSupabase();
  if (!sb) return false;
  const { data, error } = await sb.rpc('email_is_blocked', {
    p_email: normalizeEmail(email),
  });
  if (error) return false;
  return Boolean(data);
}

export async function listProfiles(): Promise<ProfileRecord[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('profiles')
    .select('id, email, display_name, is_admin, library_role, disabled_at, disabled_reason, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[Nexus] listProfiles:', error.message);
    return [];
  }
  return (data ?? []).map(mapProfile);
}

export async function setLibraryRole(
  profileId: string,
  role: LibraryRole
): Promise<{ ok: boolean; error?: string }> {
  const result = await callEdgeFunction('admin', {
    action: 'set_library_role',
    profile_id: profileId,
    role,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function setProfileAdmin(opts: {
  profileId: string;
  email: string;
  isAdmin: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  if (!opts.isAdmin && isBootstrapAdmin(opts.email)) {
    return { ok: false, error: 'Cannot remove admin from the primary administrator account.' };
  }
  const result = await callEdgeFunction('admin', {
    action: 'set_admin',
    profile_id: opts.profileId,
    email: normalizeEmail(opts.email),
    is_admin: opts.isAdmin,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function listBannedEmails(): Promise<BannedEmailRecord[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('banned_emails')
    .select('email, reason, banned_by, banned_at')
    .order('banned_at', { ascending: false });
  if (error) {
    console.warn('[Nexus] listBannedEmails:', error.message);
    return [];
  }
  return data ?? [];
}

export async function banEmail(
  email: string,
  opts: { reason?: string; bannedBy?: string }
): Promise<{ ok: boolean; error?: string }> {
  const normalized = normalizeEmail(email);
  if ((BOOTSTRAP_ADMIN_EMAILS as readonly string[]).includes(normalized)) {
    return { ok: false, error: 'Cannot ban the bootstrap admin.' };
  }
  const result = await callEdgeFunction('admin', {
    action: 'ban_email',
    email: normalized,
    reason: opts.reason,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function unbanEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const result = await callEdgeFunction('admin', {
    action: 'unban_email',
    email: normalizeEmail(email),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function disableProfile(
  profileId: string,
  reason?: string,
  email?: string
): Promise<{ ok: boolean; error?: string }> {
  const result = await callEdgeFunction('admin', {
    action: 'disable_profile',
    profile_id: profileId,
    email: email ? normalizeEmail(email) : '',
    reason,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function removeUserAccess(opts: {
  profileId: string;
  email: string;
  ban: boolean;
  reason?: string;
  actorEmail: string;
}): Promise<{ ok: boolean; error?: string; hardDeleted?: boolean }> {
  if (isBootstrapAdmin(opts.email)) {
    return { ok: false, error: 'Cannot remove the bootstrap admin.' };
  }

  const disabled = await disableProfile(opts.profileId, opts.reason, opts.email);
  if (!disabled.ok) return disabled;

  if (opts.ban) {
    const banned = await banEmail(opts.email, {
      reason: opts.reason,
      bannedBy: opts.actorEmail,
    });
    if (!banned.ok) return banned;
  }

  const deleted = await callEdgeFunction<{ hard_deleted?: boolean }>('admin', {
    action: 'delete_user',
    user_id: opts.profileId,
    email: normalizeEmail(opts.email),
  });
  return { ok: true, hardDeleted: deleted.ok && Boolean(deleted.data.hard_deleted) };
}

/** Paths that are locked, with optional allow-listed profile ids. */
export async function fetchViewersByPath(): Promise<Map<string, Set<string>>> {
  const sb = getSupabase();
  if (!sb) return new Map();

  const map = new Map<string, Set<string>>();

  const { data: locks, error: lockError } = await sb
    .from('library_folder_locks')
    .select('folder_path');
  if (!lockError) {
    for (const row of locks ?? []) {
      map.set(row.folder_path ?? '', new Set());
    }
  }

  const { data, error } = await sb
    .from('library_folder_viewers')
    .select('folder_path, profile_id');
  if (error) return map;

  for (const row of data ?? []) {
    const path = row.folder_path ?? '';
    let set = map.get(path);
    if (!set) {
      set = new Set();
      map.set(path, set);
    }
    set.add(row.profile_id);
  }
  return map;
}

export async function listFolderViewers(
  folderPath: string
): Promise<{
  openToEveryone: boolean;
  viewers: { profile_id: string; email: string; display_name: string | null }[];
}> {
  const sb = getSupabase();
  if (!sb) return { openToEveryone: true, viewers: [] };
  const path = folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

  const { data: lock } = await sb
    .from('library_folder_locks')
    .select('folder_path')
    .eq('folder_path', path)
    .maybeSingle();

  if (!lock) return { openToEveryone: true, viewers: [] };

  const { data, error } = await sb
    .from('library_folder_viewers')
    .select('profile_id, profiles(email, display_name)')
    .eq('folder_path', path);
  if (error) {
    console.warn('[Nexus] listFolderViewers:', error.message);
    return { openToEveryone: false, viewers: [] };
  }
  return {
    openToEveryone: false,
    viewers: (data ?? []).map((row) => {
      const profile = row.profiles as unknown as
        | { email: string; display_name: string | null }
        | null;
      return {
        profile_id: row.profile_id,
        email: profile?.email ?? '',
        display_name: profile?.display_name ?? null,
      };
    }),
  };
}

/**
 * Save folder visibility.
 * - `openToEveryone: true` unlocks the folder.
 * - otherwise locks it and sets the allow-list (empty = admins only).
 */
export async function setFolderViewers(opts: {
  folderPath: string;
  openToEveryone: boolean;
  profileIds: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const path = canonicalizeLibraryPath(opts.folderPath);
  if (path === null) return { ok: false, error: 'Invalid folder path.' };
  const result = await callEdgeFunction('admin', {
    action: 'set_folder_viewers',
    folder_path: path,
    open_to_everyone: opts.openToEveryone,
    profile_ids: opts.profileIds,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function isFolderRestricted(folderPath: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const path = folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const { data, error } = await sb
    .from('library_folder_locks')
    .select('folder_path')
    .eq('folder_path', path)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}
