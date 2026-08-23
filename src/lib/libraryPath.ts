/** Reject `.` / `..` / NUL. Returns null when the path is unsafe. */
export function canonicalizeLibraryPath(path: string): string | null {
  const out: string[] = [];
  for (const raw of path.replace(/\\/g, '/').split('/')) {
    const seg = raw.trim();
    if (!seg) continue;
    if (seg === '.' || seg === '..' || seg.includes('\0')) return null;
    out.push(seg);
  }
  return out.join('/');
}

/** Canonical path, or empty string when the input is empty/safe-empty. Invalid → empty AND callers must check canonicalize for ACL. */
export function normalizeLibraryPath(path: string): string {
  return canonicalizeLibraryPath(path) ?? '';
}
