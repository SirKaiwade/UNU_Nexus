import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(url?.trim() && anonKey?.trim());
}

// Untyped client: supabase-js v2's generated-types shape (Relationships,
// Views, Functions, Enums, CompositeTypes) is meant to come from
// `supabase gen types typescript` run against a real deployed project, not
// hand-maintained. src/lib/db/types.ts still defines the row shapes used at
// every call site in src/lib/db/*.ts, so application code stays type-safe —
// only the raw query builder itself is untyped until real codegen runs.
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
  }
  return client;
}
