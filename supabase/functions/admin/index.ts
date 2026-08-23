import { corsPreflight, json } from '../_shared/cors.ts';
import { bootstrapEmailsFrom, requireAdmin } from '../_shared/auth.ts';
import { canonicalizeLibraryPath } from '../_shared/path.ts';

async function findAuthUserIdByEmail(
  supabaseUrl: string,
  serviceKey: string,
  email: string
): Promise<string | null> {
  const res = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    }
  );
  if (!res.ok) return null;
  const body = await res.json();
  const users: Array<{ id?: string; email?: string }> = Array.isArray(body.users)
    ? body.users
    : body.id
      ? [body]
      : [];
  const match = users.find((u) => u.email?.toLowerCase() === email);
  return match?.id ?? null;
}

async function bootstrapSet(admin: Awaited<ReturnType<typeof requireAdmin>> extends infer R
  ? R extends { admin: infer A }
    ? A
    : never
  : never) {
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'bootstrap_admin_emails')
    .maybeSingle();
  return bootstrapEmailsFrom(data?.value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const auth = await requireAdmin(req);
  if ('error' in auth) return json(req, { error: auth.error }, auth.status);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const bootstrap = await bootstrapSet(auth.admin);

  try {
    const body = await req.json();
    const action = String(body?.action ?? '');

    if (action === 'set_admin') {
      const profileId = String(body.profile_id ?? '');
      const targetEmail = String(body.email ?? '').trim().toLowerCase();
      const isAdmin = Boolean(body.is_admin);
      if (!profileId) return json(req, { error: 'profile_id required' }, 400);
      if (!isAdmin && bootstrap.has(targetEmail)) {
        return json(req, { error: 'Cannot remove admin from the bootstrap account.' }, 400);
      }
      const patch: Record<string, unknown> = { is_admin: isAdmin };
      if (isAdmin) patch.library_role = 'edit';
      const { error } = await auth.admin.from('profiles').update(patch).eq('id', profileId);
      if (error) return json(req, { error: error.message }, 500);
      return json(req, { ok: true });
    }

    if (action === 'set_library_role') {
      const profileId = String(body.profile_id ?? '');
      const role = String(body.role ?? '');
      if (!profileId || !['none', 'view', 'edit'].includes(role)) {
        return json(req, { error: 'profile_id and a valid role are required' }, 400);
      }
      const { error } = await auth.admin
        .from('profiles')
        .update({ library_role: role })
        .eq('id', profileId);
      if (error) return json(req, { error: error.message }, 500);
      return json(req, { ok: true });
    }

    if (action === 'ban_email') {
      const targetEmail = String(body.email ?? '').trim().toLowerCase();
      if (!targetEmail) return json(req, { error: 'email required' }, 400);
      if (bootstrap.has(targetEmail)) {
        return json(req, { error: 'Cannot ban the bootstrap admin.' }, 400);
      }
      const { error } = await auth.admin.from('banned_emails').upsert({
        email: targetEmail,
        reason: String(body.reason ?? '').trim() || null,
        banned_by: auth.email,
        banned_at: new Date().toISOString(),
      });
      if (error) return json(req, { error: error.message }, 500);

      const userId =
        (await findAuthUserIdByEmail(supabaseUrl, serviceKey, targetEmail)) ??
        String(body.user_id ?? '');
      if (userId) {
        await auth.admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
        await auth.admin.auth.admin.signOut(userId, 'global');
      }
      return json(req, { ok: true });
    }

    if (action === 'unban_email') {
      const targetEmail = String(body.email ?? '').trim().toLowerCase();
      if (!targetEmail) return json(req, { error: 'email required' }, 400);
      const { error } = await auth.admin.from('banned_emails').delete().eq('email', targetEmail);
      if (error) return json(req, { error: error.message }, 500);
      const userId = await findAuthUserIdByEmail(supabaseUrl, serviceKey, targetEmail);
      if (userId) {
        await auth.admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
      }
      return json(req, { ok: true });
    }

    if (action === 'disable_profile') {
      const profileId = String(body.profile_id ?? '');
      const targetEmail = String(body.email ?? '').trim().toLowerCase();
      if (!profileId) return json(req, { error: 'profile_id required' }, 400);
      if (bootstrap.has(targetEmail)) {
        return json(req, { error: 'Cannot disable the bootstrap admin.' }, 400);
      }
      const { error } = await auth.admin
        .from('profiles')
        .update({
          disabled_at: new Date().toISOString(),
          disabled_reason: String(body.reason ?? '').trim() || 'Removed by admin',
          library_role: 'none',
        })
        .eq('id', profileId);
      if (error) return json(req, { error: error.message }, 500);
      const userId =
        (await findAuthUserIdByEmail(supabaseUrl, serviceKey, targetEmail)) || profileId;
      await auth.admin.auth.admin.signOut(userId, 'global').catch(() => undefined);
      return json(req, { ok: true });
    }

    if (action === 'set_folder_viewers') {
      const folderPath = canonicalizeLibraryPath(String(body.folder_path ?? ''));
      if (folderPath === null) return json(req, { error: 'Invalid folder path' }, 400);
      const openToEveryone = Boolean(body.open_to_everyone);
      const profileIds: string[] = Array.isArray(body.profile_ids)
        ? body.profile_ids.map((id: unknown) => String(id))
        : [];

      await auth.admin.from('library_folder_viewers').delete().eq('folder_path', folderPath);
      if (openToEveryone) {
        const { error } = await auth.admin
          .from('library_folder_locks')
          .delete()
          .eq('folder_path', folderPath);
        if (error) return json(req, { error: error.message }, 500);
        return json(req, { ok: true });
      }

      const { error: lockError } = await auth.admin
        .from('library_folder_locks')
        .upsert({ folder_path: folderPath });
      if (lockError) return json(req, { error: lockError.message }, 500);
      if (profileIds.length > 0) {
        const { error: insError } = await auth.admin.from('library_folder_viewers').insert(
          profileIds.map((profile_id) => ({ folder_path: folderPath, profile_id }))
        );
        if (insError) return json(req, { error: insError.message }, 500);
      }
      return json(req, { ok: true });
    }

    if (action === 'delete_user') {
      const targetEmail = String(body.email ?? '').trim().toLowerCase();
      const userId = String(body.user_id ?? '');
      if (!targetEmail) return json(req, { error: 'email required' }, 400);
      if (bootstrap.has(targetEmail)) {
        return json(req, { error: 'Cannot delete bootstrap admin' }, 400);
      }

      let deleted = false;
      if (userId) {
        const { error: delError } = await auth.admin.auth.admin.deleteUser(userId);
        if (!delError) deleted = true;
      }
      if (!deleted) {
        const matchId = await findAuthUserIdByEmail(supabaseUrl, serviceKey, targetEmail);
        if (matchId) {
          const { error: del2 } = await auth.admin.auth.admin.deleteUser(matchId);
          if (del2) return json(req, { error: del2.message }, 500);
          deleted = true;
        }
      }
      return json(req, { ok: true, deleted: targetEmail, hard_deleted: deleted });
    }

    return json(req, { error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[Nexus admin function]', err);
    return json(req, { error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
