/** Bootstrap admins + library access helpers. */

import { canonicalizeLibraryPath } from './libraryPath';

export const BOOTSTRAP_ADMIN_EMAILS = ['ayhnassef@unu.edu'] as const;

export type LibraryRole = 'none' | 'view' | 'edit';

export const LIBRARY_ROLE_LABELS: Record<LibraryRole, string> = {
  none: 'No access',
  view: 'Read only',
  edit: 'Can edit',
};

export function isBootstrapAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (BOOTSTRAP_ADMIN_EMAILS as readonly string[]).includes(normalized);
}

export function normalizeLibraryRole(raw: string | null | undefined): LibraryRole {
  if (raw === 'none' || raw === 'view' || raw === 'edit') return raw;
  return 'none';
}

/** Folder containing a library file path (`Finance/2024/a.pdf` → `Finance/2024`). */
export function folderPathFromDocPath(relativePath: string | null | undefined): string {
  if (!relativePath) return '';
  const normalized = canonicalizeLibraryPath(relativePath);
  if (!normalized) return '';
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return '';
  return normalized.slice(0, idx);
}

/**
 * Among restricted folder paths that cover `folderPath`, pick the longest
 * (most specific). Returns null when no restriction covers the path.
 */
export function mostSpecificRestrictedPath(
  folderPath: string,
  restrictedPaths: Iterable<string>
): string | null {
  const folder = folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  let best: string | null = null;
  for (const raw of restrictedPaths) {
    const g = raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const covers =
      g === '' ? true : folder === g || folder.startsWith(`${g}/`);
    if (!covers) continue;
    if (best === null || g.length > best.length) best = g;
  }
  return best;
}

export function canAccessLibrary(opts: {
  isAdmin: boolean;
  libraryRole: LibraryRole;
}): boolean {
  if (opts.isAdmin) return true;
  return opts.libraryRole === 'view' || opts.libraryRole === 'edit';
}

export function canEditLibrary(opts: {
  isAdmin: boolean;
  libraryRole: LibraryRole;
}): boolean {
  if (opts.isAdmin) return true;
  return opts.libraryRole === 'edit';
}

/**
 * Can this user see a document under `docRelativePath`?
 * - Admins: yes
 * - No library access: no
 * - Folder unrestricted (not in viewers map): yes
 * - Folder restricted: only if their profile_id is listed on the most-specific path
 */
export function canReadLibraryPath(
  docRelativePath: string | null | undefined,
  opts: {
    isAdmin: boolean;
    libraryRole: LibraryRole;
    profileId: string | null;
    /** folder_path → profile ids allowed to see it (only restricted folders) */
    viewersByPath: ReadonlyMap<string, ReadonlySet<string>>;
  }
): boolean {
  if (opts.isAdmin) return true;
  if (!canAccessLibrary(opts)) return false;
  if (docRelativePath != null && canonicalizeLibraryPath(docRelativePath) === null) {
    return false;
  }
  if (opts.viewersByPath.size === 0) return true;

  const folder = folderPathFromDocPath(docRelativePath);
  const matched = mostSpecificRestrictedPath(folder, opts.viewersByPath.keys());
  if (matched === null) return true;

  const allowed = opts.viewersByPath.get(matched);
  if (!opts.profileId) return false;
  if (!allowed) return false;
  return allowed.has(opts.profileId);
}

export function canSeeLibraryFolder(
  folderPath: string,
  opts: {
    isAdmin: boolean;
    libraryRole: LibraryRole;
    profileId: string | null;
    viewersByPath: ReadonlyMap<string, ReadonlySet<string>>;
  }
): boolean {
  if (opts.isAdmin) return true;
  if (!canAccessLibrary(opts)) return false;
  if (canonicalizeLibraryPath(folderPath) === null) return false;
  if (opts.viewersByPath.size === 0) return true;

  const folder = folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const matched = mostSpecificRestrictedPath(folder, opts.viewersByPath.keys());
  if (matched === null) return true;
  const allowed = opts.viewersByPath.get(matched);
  if (!opts.profileId) return false;
  if (!allowed) return false;
  return allowed.has(opts.profileId);
}
