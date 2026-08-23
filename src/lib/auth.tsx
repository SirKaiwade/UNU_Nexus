import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase, supabaseConfigured } from './supabase';
import {
  isBootstrapAdmin,
  normalizeLibraryRole,
  type LibraryRole,
} from './permissions';
import {
  ensureBootstrapAdmin,
  fetchProfileByEmail,
  isEmailBanned,
} from './db/admin';

export const ALLOWED_EMAIL_DOMAIN = 'unu.edu';

/**
 * Local UI testing only. Requires both:
 * - Vite DEV mode (`npm run dev`)
 * - `VITE_DEV_BYPASS_AUTH=true` in `.env.local`
 * Never active in production builds, even if the env var is set.
 */
export function isDevAuthBypass(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';
}

export function isAllowedEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  provider: 'supabase' | 'dev';
  /** Platform admin (bootstrap email and/or profiles.is_admin). */
  isAdmin: boolean;
  /** Knowledge library privilege for non-admins. */
  libraryRole: LibraryRole;
  profileId: string | null;
}

const DEV_BYPASS_USER: AuthUser = {
  id: 'dev-bypass-user',
  name: 'Local Dev (Admin)',
  email: 'ayhnassef@unu.edu',
  initials: 'AN',
  provider: 'dev',
  isAdmin: true,
  libraryRole: 'edit',
  profileId: null,
};

function initialsFrom(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function toAuthUser(
  user: User,
  extras?: {
    isAdmin?: boolean;
    libraryRole?: LibraryRole;
    profileId?: string | null;
  }
): AuthUser | null {
  const email = (user.email ?? '').trim().toLowerCase();
  if (!email || !isAllowedEmail(email)) return null;
  const name =
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    (user.user_metadata?.name as string | undefined)?.trim() ||
    email.split('@')[0];
  const isAdmin = Boolean(extras?.isAdmin) || isBootstrapAdmin(email);
  return {
    id: user.id,
    name,
    email,
    initials: initialsFrom(name, email),
    provider: 'supabase',
    isAdmin,
    libraryRole: isAdmin ? 'edit' : normalizeLibraryRole(extras?.libraryRole),
    profileId: extras?.profileId ?? user.id,
  };
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /** True when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set. */
  supabaseReady: boolean;
  /**
   * Send a magic link to an @unu.edu address.
   * Does not set `user` until the link is opened (or an OTP verified).
   */
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function resolveSessionUser(session: Session | null): Promise<AuthUser | null> {
  if (!session?.user) return null;

  const email = (session.user.email ?? '').trim().toLowerCase();
  if (!email || !isAllowedEmail(email)) {
    const sb = getSupabase();
    await sb?.auth.signOut();
    throw new Error(
      `Access is limited to @${ALLOWED_EMAIL_DOMAIN} accounts. Signed in as ${session.user.email ?? 'unknown'}.`
    );
  }

  if (await isEmailBanned(email)) {
    const sb = getSupabase();
    await sb?.auth.signOut();
    throw new Error('This email is banned from Nexus. Contact an administrator.');
  }

  await ensureBootstrapAdmin(email);
  const profile = await fetchProfileByEmail(email);

  if (profile?.disabled_at) {
    const sb = getSupabase();
    await sb?.auth.signOut();
    throw new Error(
      profile.disabled_reason?.trim() ||
        'This account has been disabled. Contact an administrator.'
    );
  }

  return toAuthUser(session.user, {
    isAdmin: Boolean(profile?.is_admin) || isBootstrapAdmin(email),
    libraryRole: profile?.library_role,
    profileId: profile?.id ?? session.user.id,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const bypass = isDevAuthBypass();
  const [user, setUser] = useState<AuthUser | null>(bypass ? DEV_BYPASS_USER : null);
  const [loading, setLoading] = useState(!bypass);
  const ready = supabaseConfigured();

  useEffect(() => {
    if (bypass) {
      setUser(DEV_BYPASS_USER);
      setLoading(false);
      console.info(
        '[Nexus] Dev auth bypass on — signed in as',
        DEV_BYPASS_USER.email,
        '(admin).'
      );
      return;
    }

    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data } = await sb.auth.getSession();
        if (cancelled) return;
        try {
          const next = await resolveSessionUser(data.session);
          setUser(next);
        } catch {
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        try {
          const next = await resolveSessionUser(session);
          if (!cancelled) setUser(next);
        } catch {
          if (!cancelled) setUser(null);
        }
      })();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [bypass]);

  const sendMagicLink = useCallback(async (email: string) => {
    if (isDevAuthBypass()) {
      setUser(DEV_BYPASS_USER);
      return;
    }

    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      throw new Error('Enter your UNU email address.');
    }
    if (!isAllowedEmail(normalized)) {
      throw new Error(
        `Access is limited to @${ALLOWED_EMAIL_DOMAIN} addresses. Use your institutional email.`
      );
    }

    if (await isEmailBanned(normalized)) {
      throw new Error(
        'This email cannot sign in to Nexus. If you believe this is a mistake, contact an administrator.'
      );
    }

    const profile = await fetchProfileByEmail(normalized);
    if (profile?.disabled_at) {
      throw new Error(
        'This account has been removed. Contact an administrator if you need access restored.'
      );
    }

    const sb = getSupabase();
    if (!sb) {
      throw new Error(
        'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local (and Vercel).'
      );
    }

    const { error } = await sb.auth.signInWithOtp({
      email: normalized,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        shouldCreateUser: true,
      },
    });

    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    if (isDevAuthBypass()) {
      console.info(
        '[Nexus] Dev auth bypass — sign out ignored. Remove VITE_DEV_BYPASS_AUTH to test real auth.'
      );
      return;
    }
    const sb = getSupabase();
    await sb?.auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      supabaseReady: ready || bypass,
      sendMagicLink,
      signOut,
    }),
    [user, loading, ready, bypass, sendMagicLink, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
