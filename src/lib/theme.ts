import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'nexus:theme';

function readStoredTheme(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' || stored === 'light' ? stored : null;
}

/** Institutional default is light; dark is opt-in via the sidebar toggle. */
function currentTheme(): Theme {
  return readStoredTheme() ?? 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

/**
 * Light by default. Once the user toggles, the choice is pinned in localStorage.
 * OS prefers-color-scheme is ignored so the app doesn't open dark unexpectedly.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggle() {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  return [theme, toggle];
}
