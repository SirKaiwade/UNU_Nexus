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
