const CITE_PREFIX = '#nexus-cite-';

export function isSafeHref(href: string | undefined | null): boolean {
  if (!href) return false;
  if (href.startsWith(CITE_PREFIX)) return true;
  if (href.startsWith('/')) return !href.startsWith('//');
  return href.startsWith('https://') || href.startsWith('http://');
}
