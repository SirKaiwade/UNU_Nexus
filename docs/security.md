# Security

Nexus is an **internal UNU Global Health tool**. This page states what is locked down, what that means in ordinary language, and what we do **not** claim.

The website is **not** the security boundary. **Postgres Row Level Security** and the **chat / admin Edge Functions** are.

---

## In plain terms (for a supervisor)

Imagine the old version as filing cabinets with the keys taped to the door: anyone who found the public API key could read and write almost everything.

The current version:

1. **The door only opens for `@unu.edu`.** Other emails cannot create an account.
2. **Guests with only the public key see empty cabinets.** Signed-out callers have no table access.
3. **Your chats are yours.** Another staff member’s threads are not readable through the API.
4. **The library starts closed.** New people cannot see files until an admin grants read or edit. Locked folders are not sent to people who are not on the list — not just greyed out in the menu.
5. **Staff cannot make themselves admin.** Those fields are frozen. Only the admin server function, after checking the caller, can change them.
6. **Claude is behind a guarded hatch.** You must be signed in. Banned and disabled people are refused. The hatch will not accept “use any model” or “run any tool.” It only talks to browsers on localhost or the listed production origin — not every website on the internet.
7. **The Claude key is not in the website.** If someone tries to put it there, the production build fails.

That is a serious internal lock-down. It is **not** a UN-wide accreditation, a pentest report, or a classified system. ICT should still own the GitHub/Vercel/Supabase/Anthropic accounts, the custom domain, mail delivery, and key rotation.

---

## What changed (before → after)

| Area | Before | After |
|---|---|---|
| Database policies | Almost every table `using (true)` — the **anon key could read and write everything** | Anon denied. Authenticated, scoped policies. `FORCE ROW LEVEL SECURITY` |
| New users | Could get library **edit** | Default library role **`none`** |
| Profile privileges | Client could attempt updates | Trigger freezes `is_admin`, `library_role`, `disabled_*`, id, email for user JWTs |
| Bans / folder ACL writes | Open to the client | No client grants; **admin function + service role** |
| Chat | Public Anthropic proxy if you had the URL/key pattern | User JWT required; anon Bearer rejected; domain/ban/disable checks; CORS allow-list; forced model; tool allow-list; size caps; per-user rate limit |
| Admin actions | Went through PostgREST from the browser | JWT + admin check in the **admin** function |
| Frontend calls | Easy to send the anon key as Bearer | Session **access token** for chat and admin |
| Markdown links | Unrestricted hrefs | Only `http(s):`, in-app `/` paths, citation hashes |
| Uploads | Weaker path/type handling | Canonical paths; magic-byte sniff; no `.xls`; ExcelJS; size/text caps in browser **and** SQL |
| Production env | Key could be bundled | Build fails if `VITE_ANTHROPIC_API_KEY` or `VITE_DEV_BYPASS_AUTH=true` |

---

## Authentication

**How it actually works**

1. Magic link (`signInWithOtp`) to the typed address.
2. Trigger `enforce_auth_email_policy` on `auth.users` **before insert/update of email**: domain must be `unu.edu`; address must not be in `banned_emails`.
3. Trigger `handle_new_user` **after insert**: creates `profiles` with `library_role = none`, `is_admin = false`, unless the email is in `bootstrap_admin_emails`.
4. Optional HTTP hook `before-user-created` — same domain rule; not required if SQL is applied.
5. Client `resolveSessionUser`: domain, ban, disabled → sign out.
6. Edge Functions: `getUser(jwt)`; reject if jwt equals `SUPABASE_ANON_KEY`; domain; ban; disabled.

**`is_active_user()`** (used by most table policies): role `authenticated`, has uid, JWT email present, email like `%@unu.edu`, not banned, not disabled.

**Bootstrap / break-glass:** `public.app_settings` key `bootstrap_admin_emails` (comma-separated). `is_admin()` is true if the JWT email is on that list **or** `profiles.is_admin` (and not disabled). UN ICT can add an address in SQL and run `select public.elevate_bootstrap_admins();` — no code deploy.

---

## Database (Row Level Security)

Policies live in `supabase/security.sql`. Highlights:

| Policy intent | Mechanism |
|---|---|
| Fail closed | RLS enabled in `schema.sql` with no policies until `security.sql` |
| No anon data | `revoke all` on tables/sequences/functions from `anon` and `public`; only named grants to `authenticated` |
| Conversations | `user_id = current_profile_id()` |
| Messages | Parent conversation owned by current profile |
| Library read | `can_read_library_path(external_ref or filename)` — role + most-specific folder lock + allow-list |
| Library write | `can_edit_library()` **and** can read that path |
| Registers | `is_active_user()` for all operations |
| Bans | `select` for admins only; no insert/update/delete grant to `authenticated` |
| Folder ACL | Locks: select if active. Viewers: admin or own `profile_id`. No writes for clients |
| Rate buckets / app_settings | RLS forced; no client grants |

**Profile freeze** — `protect_profile_privileges`:

- Insert as a user: id = `auth.uid()`, email from JWT, admin false, role none, not disabled (then bootstrap emails elevated).
- Update as a user: cannot change id, email, admin, library_role, disabled fields.
- `auth.uid() is null` (service role) may change those columns — that is how the admin function works.

**Library ingest trigger** — `enforce_library_document_limits`: canonical path or exception; text clipped to 1,500,000 chars; size > 40 MB rejected.

---

## Edge Functions

### CORS

Allowed origins: `http://localhost:5173`, `http://localhost:4173`, `127.0.0.1` equivalents, plus every origin in secret `ALLOWED_ORIGINS`.

- Comma-separated  
- **No trailing slash** (`https://nexus.unu.edu` not `https://nexus.unu.edu/`)  
- **No `*`**  
- Unknown `Origin` → **403** (preflight and JSON)

After you add a custom domain, this secret **must** include `https://your.domain` or browsers will fail chat/admin with “Origin not allowed.”

### Chat

| Check | Value |
|---|---|
| Method | POST (OPTIONS for CORS) |
| Auth | `requireUser` |
| Rate | 40 / 10 minutes / user |
| Model | `claude-haiku-4-5` only |
| Tokens | ≤ 4096 |
| System | ≤ 400,000 characters |
| Messages | last 40, ≤ 20,000 chars each |
| Tools | `answer`, `source_quotes` only |

### Admin

`requireAdmin` then action switch. Ban also sets Auth `ban_duration` and `signOut(..., 'global')`. Folder paths run through `canonicalizeLibraryPath`.

---

## Frontend hardening (supporting, not sufficient)

- Chat and admin: **session access token**, not anon key as Bearer (`src/lib/edgeFn.ts`).
- Admin route redirects non-admins; **server** is authoritative.
- `isSafeHref` on markdown.
- Upload canonicalization + magic-byte sniff + ExcelJS + no `.xls`.
- Production Vite plugin: refuse `VITE_ANTHROPIC_API_KEY` and `VITE_DEV_BYPASS_AUTH=true`.
- SharePoint: read-only scopes, sessionStorage tokens, Confidential label blocked — **optional**, Azure AD review required.

---

## Secrets — where they belong

| Secret | Where | Never |
|---|---|---|
| Anthropic API key | Supabase secret `ANTHROPIC_API_KEY` | Vercel `VITE_*`, GitHub, the browser |
| Service role key | Supabase (injected into functions) | Any `VITE_*`, the client |
| Anon key | Vercel `VITE_SUPABASE_ANON_KEY` (public) | Treated as a “password” — it is not; RLS must stay tight |
| `ALLOWED_ORIGINS` | Supabase secrets | Wildcard |
| `AUTH_HOOK_SECRET` | Supabase secrets, if the Auth hook is enabled | Client |

If the project was **public under the old open policies**, **rotate the anon key** in the Supabase dashboard after `security.sql`. Anyone who copied the old key had data access; rotation invalidates that key. Sessions may need to sign in again.

---

## Residual risk (honest)

| Topic | Status |
|---|---|
| Malware in uploads | **Not scanned.** Type/size/path only. Treat the library as trusted-staff content. |
| Retrieval in the browser | The client chooses which allowed text to send (within caps). A user cannot read locked files; they can stuff the packet with files they *can* read. |
| Shared registers | Any active staff can edit directory, events, publications. Insider vandalism is a process issue (backups, admin culture), not an extra RLS role. |
| Original files | Binaries in IndexedDB on the device — lost if the person clears site data; not a central file archive. |
| Auth hook | Optional. Domain lock does **not** depend on it if SQL is applied. |
| Formal audit | No claim of ISO/UN DSS certification in this repo. |
| Model leakage | Claude sees retrieved text for that request. Anthropic’s data-use terms for API traffic are a **procurement** issue (use an institutional API account, not a personal hobby key, for production). |
| Magic-link email | Default Supabase mail can land in spam. Production should use **UN SMTP** (see [Deploy](deploy.md)). |
| SharePoint | Off unless configured; still needs tenant admin consent. |

---

## What ICT should still do

1. Hold the GitHub, Vercel, Supabase, and Anthropic organisations (not a personal account).
2. Custom domain + `ALLOWED_ORIGINS` + Auth Site URL / Redirect URLs kept in lockstep.
3. Rotate the anon key if it was ever exposed under open RLS.
4. Restrict who can open the Supabase SQL editor and who has the service role.
5. Configure custom SMTP for magic links.
6. Decide whether directory/events/publications should stay “any staff may edit.”
7. Optional: enable the Before User Created hook for defense in depth.

Day-to-day admin steps: [Operations](operations.md). Hosting: [Deploy](deploy.md).
