import type { UploadedDoc } from './uploads';
import {
  canAccessLibrary,
  canReadLibraryPath,
  type LibraryRole,
} from './permissions';
import { fetchViewersByPath } from './db/admin';
import { getOrCreateProfileId } from './db/profiles';

export interface LibraryAccessContext {
  isAdmin: boolean;
  libraryRole: LibraryRole;
  profileId: string | null;
  viewersByPath: ReadonlyMap<string, ReadonlySet<string>>;
}

export async function loadLibraryAccessContext(opts: {
  email: string;
  isAdmin: boolean;
  libraryRole: LibraryRole;
  profileId?: string | null;
}): Promise<LibraryAccessContext> {
  if (opts.isAdmin) {
    return {
      isAdmin: true,
      libraryRole: 'edit',
      profileId: opts.profileId ?? null,
      viewersByPath: new Map(),
    };
  }

  if (!canAccessLibrary({ isAdmin: false, libraryRole: opts.libraryRole })) {
    return {
      isAdmin: false,
      libraryRole: 'none',
      profileId: opts.profileId ?? null,
      viewersByPath: new Map(),
    };
  }

  const profileId = opts.profileId ?? (await getOrCreateProfileId(opts.email));
  const viewersByPath = await fetchViewersByPath();

  return {
    isAdmin: false,
    libraryRole: opts.libraryRole,
    profileId,
    viewersByPath,
  };
}

export function filterDocsByLibraryAccess(
  docs: UploadedDoc[],
  access: LibraryAccessContext
): UploadedDoc[] {
  if (access.isAdmin) return docs;
  if (!canAccessLibrary(access)) return [];
  return docs.filter((doc) =>
    canReadLibraryPath(doc.localRelativePath, {
      isAdmin: false,
      libraryRole: access.libraryRole,
      profileId: access.profileId,
      viewersByPath: access.viewersByPath,
    })
  );
}
