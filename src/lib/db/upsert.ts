import type { SupabaseClient } from '@supabase/supabase-js';

const MISSING_COL = /Could not find the '([^']+)' column/i;

/**
 * Upsert rows, stripping columns the live DB doesn't have yet (PGRST204).
 * Lets the app keep working when schema.sql ALTERs haven't been applied.
 */
export async function upsertWithSchemaFallback(
  sb: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[]
): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true };

  let payload = rows.map((r) => ({ ...r }));
  for (let attempt = 0; attempt < 12; attempt++) {
    const { error } = await sb.from(table).upsert(payload);
    if (!error) return { ok: true };

    const match = error.message.match(MISSING_COL);
    if (!match) {
      return { ok: false, error: error.message };
    }

    const missing = match[1];
    console.warn(
      `[Nexus] Supabase ${table} is missing column "${missing}" — syncing without it. Apply supabase/schema.sql ALTER statements.`
    );
    payload = payload.map((row) => {
      const next = { ...row };
      delete next[missing];
      return next;
    });
  }

  return { ok: false, error: `Too many missing columns on ${table}` };
}
