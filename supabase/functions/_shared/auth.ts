import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.49.1';

export type { SupabaseClient };

const ALLOWED_DOMAIN = 'unu.edu';

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) throw new Error('Supabase service env is incomplete.');
  return createClient(url, key);
}

export async function requireUser(
  req: Request
): Promise<{ user: User; email: string; admin: SupabaseClient } | { error: string; status: number }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Missing Authorization', status: 401 };
  }
  const jwt = authHeader.slice(7);
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!anonKey || jwt === anonKey) {
    return { error: 'Sign in required', status: 401 };
  }

  const admin = serviceClient();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(jwt);
  if (error || !user?.email) {
    return { error: 'Unauthorized', status: 401 };
  }

  const email = user.email.trim().toLowerCase();
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    return { error: 'Access is limited to @unu.edu accounts', status: 403 };
  }

  const { data: banned } = await admin
    .from('banned_emails')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (banned) {
    return { error: 'This account is banned', status: 403 };
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('disabled_at, is_admin, library_role')
    .eq('email', email)
    .maybeSingle();
  if (profile?.disabled_at) {
    return { error: 'This account is disabled', status: 403 };
  }

  return { user, email, admin };
}

export async function requireAdmin(
  req: Request
): Promise<{ user: User; email: string; admin: SupabaseClient } | { error: string; status: number }> {
  const result = await requireUser(req);
  if ('error' in result) return result;

  const { data: settings } = await result.admin
    .from('app_settings')
    .select('value')
    .eq('key', 'bootstrap_admin_emails')
    .maybeSingle();
  const bootstrap = new Set(
    String(settings?.value ?? 'ayhnassef@unu.edu')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );

  const { data: profile } = await result.admin
    .from('profiles')
    .select('is_admin')
    .eq('email', result.email)
    .maybeSingle();

  if (!bootstrap.has(result.email) && !profile?.is_admin) {
    return { error: 'Admin only', status: 403 };
  }
  return result;
}

export function bootstrapEmailsFrom(value: string | null | undefined): Set<string> {
  return new Set(
    String(value ?? 'ayhnassef@unu.edu')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}
