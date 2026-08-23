/**
 * Optional Auth Hook: Authentication → Hooks → Before User Created.
 * Pair with supabase/security.sql (auth.users trigger) for defense in depth.
 *
 * Dashboard: send the hook secret as Authorization: Bearer <HOOK_SECRET>
 * supabase secrets set AUTH_HOOK_SECRET=...
 */
const ALLOWED_DOMAIN = 'unu.edu';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secret = Deno.env.get('AUTH_HOOK_SECRET');
  if (secret) {
    const header = req.headers.get('Authorization') ?? '';
    if (header !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const payload = await req.json().catch(() => ({}));
  const email = String(payload?.user?.email ?? payload?.email ?? '')
    .trim()
    .toLowerCase();

  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    return new Response(
      JSON.stringify({
        error: {
          http_code: 400,
          message: 'Access is limited to @unu.edu accounts',
        },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
