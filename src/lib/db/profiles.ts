import { getSupabase } from '../supabase';

const cache = new Map<string, string>();

/**
 * Resolve (or create) the Supabase profile row for a signed-in user's email
 * and return its uuid. Prefers the Auth user id when a session exists.
 * Rejects values that are clearly not emails (e.g. raw auth UUIDs).
 */
export async function getOrCreateProfileId(
  email: string,
  displayName?: string
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) {
    console.warn(
      '[Nexus] getOrCreateProfileId expected an email, got:',
      normalized.slice(0, 36)
    );
    return null;
  }
  const cached = cache.get(normalized);
  if (cached) return cached;

  const sb = getSupabase();
  if (!sb) return null;

  const {
    data: { user: authUser },
  } = await sb.auth.getUser();

  const { data: existing, error: selectError } = await sb
    .from('profiles')
    .select('id')
    .eq('email', normalized)
    .maybeSingle();

  if (selectError) {
    console.warn('[Nexus] Could not look up profile:', selectError.message);
    return null;
  }

  if (existing) {
    cache.set(normalized, existing.id);
    return existing.id;
  }

  if (!authUser?.id || authUser.email?.trim().toLowerCase() !== normalized) {
    console.warn('[Nexus] Refusing to create a profile that is not the signed-in user.');
    return null;
  }

  const { data: created, error: insertError } = await sb
    .from('profiles')
    .insert({
      id: authUser.id,
      email: normalized,
      display_name: displayName ?? null,
    })
    .select('id')
    .single();

  if (insertError || !created) {
    console.warn('[Nexus] Could not create profile:', insertError?.message);
    return null;
  }

  cache.set(normalized, created.id);
  return created.id;
}
