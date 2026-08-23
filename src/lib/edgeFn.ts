import { getSupabase, supabaseConfigured } from './supabase';

export async function callEdgeFunction<T>(
  name: string,
  body: unknown
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const sb = getSupabase();
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!sb || !url || !anonKey || !supabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { ok: false, error: 'Sign in required.' };

  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    return {
      ok: false,
      error: typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`,
    };
  }
  return { ok: true, data };
}
