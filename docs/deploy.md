# Deploy UNU Nexus (GitHub → Vercel → Supabase → your domain)

This is the hosting manual. It assumes no prior familiarity with the vendors. By the end, staff open **`https://your.chosen.domain`**, sign in with `@unu.edu`, and the site talks to **your** database and **your** Claude key.

The current demo is already this architecture: **Vercel** builds from **GitHub `main`**, with a **personal Anthropic key** on the chat function. Institutional production means the same pattern under **UN-held accounts**, plus a **UN domain**.

---

## In plain terms

You need four accounts:

| Account | Everyday job |
|---|---|
| **GitHub** | Holds the source code. Vercel rebuilds when `main` changes. |
| **Vercel** | Puts the website on the internet and (later) on your domain. |
| **Supabase** | Sign-in emails, database, and the two server functions (`chat`, `admin`). |
| **Anthropic** | Pays for Claude. The key is stored **only** in Supabase, never in Vercel. |

Then UN ICT creates a DNS record (for example `nexus.unu.edu` → Vercel). You tell Supabase and the chat function the new address so magic links and browser security (CORS) match.

**Do not** put the Anthropic key or the Supabase **service role** key in Vercel environment variables that start with `VITE_`. Those are copied into the public website.

---

## What you will have when finished

- Website on Vercel, optionally at `https://nexus.unu.edu` (or another hostname ICT assigns)
- Magic-link sign-in that lands back on that hostname
- Database with the locked-down rules (`security.sql`)
- `chat` and `admin` functions deployed
- Claude billed to an **institutional** Anthropic workspace
- Bootstrap admin able to sign in and grant library access

Time: about **90–150 minutes** of hands-on work, plus however long DNS takes (often minutes, sometimes 24 hours).

---

## Accounts to create (or take over)

Use a **team / organisation**, not a personal hobby login, if this will outlive one staff member.

1. **GitHub** — access to [SirKaiwade/UNU_Nexus](https://github.com/SirKaiwade/UNU_Nexus) (invite UN ICT, **transfer** the repo to a UNU org, or **fork**). Forks work; you then point Vercel at the fork.
2. **Vercel** — [vercel.com](https://vercel.com) · create a team · GitHub integration allowed to that repo.
3. **Supabase** — [supabase.com](https://supabase.com) · New project (region close to users, e.g. `eu-central-1` or a region ICT prefers). Save the database password in a password manager.
4. **Anthropic** — [console.anthropic.com](https://console.anthropic.com) · organisation under UNU · billing · API key with access to **Claude Haiku**.

Optional later: Microsoft Azure AD app registration (SharePoint import only).

---

## Path A — Keep the existing live project (handover)

Use this if the current Supabase project already has data you want to keep.

1. Invite UN ICT as **Owner** on Vercel, Supabase, and GitHub (or transfer).
2. In Anthropic, create a **new institutional key**. In Supabase: **Project Settings → Edge Functions → Secrets** (or CLI `supabase secrets set ANTHROPIC_API_KEY=...`) replace the personal key. Chat starts using the new key on the next request. Revoke the personal key after a test question succeeds.
3. Skip “create a new Supabase project” and “run SQL” unless ICT wants a clean slate.
4. Jump to [Custom domain](#8-custom-domain-staff-type-this-in-the-browser) if the hostname must change, then [Keep Auth and CORS in lockstep](#9-keep-auth-and-cors-in-lockstep-easy-to-forget).

If the old database ever ran with open `using (true)` policies, still **rotate the anon key** (step 11) even on Path A.

---

## Path B — Fresh install from GitHub

Use this for a clean UN project, or if you must not reuse the demo database.

Work top to bottom. Have two browser tabs: GitHub repo, and this file.

---

### 1. Get the code on GitHub

- Preferred: UNU GitHub organisation owns `UNU_Nexus`.
- Or: ICT is collaborator on the existing repo with permission to change Vercel’s connection.

Clone is only needed on a laptop if someone will run SQL via CLI; the SQL Editor in the Supabase dashboard is enough.

```bash
git clone https://github.com/SirKaiwade/UNU_Nexus.git
cd UNU_Nexus
```

---

### 2. Create the Supabase project

1. Dashboard → **New project**.
2. Name e.g. `unu-nexus`.
3. Generate a strong database password; store it.
4. Wait until the project is **healthy**.
5. **Project Settings → API**:
   - Copy **Project URL** → this is `VITE_SUPABASE_URL`
   - Copy **anon public** key → `VITE_SUPABASE_ANON_KEY`
   - **Do not** copy `service_role` into Vercel or GitHub. Functions receive it automatically.

---

### 3. Apply the database (three scripts, in order)

Supabase → **SQL Editor → New query**. Paste **one file at a time**. Run. Confirm success before the next.

| Order | File | What it does |
|---|---|---|
| 1 | [`supabase/schema.sql`](../supabase/schema.sql) | Tables. RLS on, **no policies yet** (nobody can read via the API). |
| 2 | [`supabase/permissions.sql`](../supabase/permissions.sql) | Admin / disable / library role columns, ban table, folder ACL tables. Sets `ayhnassef@unu.edu` as bootstrap admin **when that profile already exists**. |
| 3 | [`supabase/security.sql`](../supabase/security.sql) | The lock-down: policies, triggers, grants, `app_settings`, rate-limit table. |

Safe to re-run `security.sql` (idempotent).

If the bootstrap person has **never signed in**, their profile is created on first magic link, and `handle_new_user` + `elevate_bootstrap_admins` grant admin because `app_settings` lists that email.

To add a UN ICT break-glass address **now**:

```sql
update public.app_settings
set value = 'ict-admin@unu.edu,ayhnassef@unu.edu'
where key = 'bootstrap_admin_emails';

select public.elevate_bootstrap_admins();
```

Use real `@unu.edu` addresses only.

---

### 4. Configure Auth (magic links)

Supabase → **Authentication**.

**Providers**

- **Email** enabled.
- Confirm that **magic link / OTP** is available (Email provider on). You do not need GitHub/Google login.

**URL configuration** (must match the real website)

Until Vercel gives you a URL, you can save placeholders and come back in step 9.

| Field | Example |
|---|---|
| **Site URL** | `https://unu-nexus.vercel.app` or later `https://nexus.unu.edu` |
| **Redirect URLs** | `http://localhost:5173/**` **and** `https://unu-nexus.vercel.app/**` **and** (when ready) `https://nexus.unu.edu/**` |

Do **not** add `*` as a redirect. Each extra origin you add is a place a stolen magic link could be sent.

**Email templates (optional but recommended)**

Authentication → Email templates → Magic link. Put the programme name “UNU Nexus” so staff trust the message.

**Custom SMTP (strongly recommended for production)**

Default Supabase mail is easy to filter as spam. Authentication → SMTP: use UN / Office 365 SMTP that ICT already operates. Then magic links come from a familiar UN address.

---

### 5. Install the Supabase CLI and log in

On a machine with Node.js:

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

`YOUR_PROJECT_REF` is the subdomain of the API URL: `https://YOUR_PROJECT_REF.supabase.co`.

---

### 6. Deploy Edge Functions and secrets

From the repo root:

```bash
supabase functions deploy chat
supabase functions deploy admin
```

[`supabase/config.toml`](../supabase/config.toml) sets `verify_jwt = false` for these functions. That is **intentional**: browser **OPTIONS** (CORS) preflight has no user token, and each function verifies the session JWT **itself** (and rejects the anon key as Bearer). Do not turn gateway JWT verification back on without re-testing login, chat, and admin from the real site origin.

Optional extra lock on sign-up:

```bash
supabase functions deploy before-user-created
```

Then Authentication → **Hooks → Before User Created** → that function URL, with `AUTH_HOOK_SECRET`. SQL already blocks other domains; skip the hook if ICT wants fewer moving parts.

**Secrets** (no quotes, no trailing slash on origins):

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
supabase secrets set ALLOWED_ORIGINS=https://YOUR_APP.vercel.app
```

When the custom domain is live, **replace or extend** origins (comma-separated, both if you keep the vercel.app URL):

```bash
supabase secrets set ALLOWED_ORIGINS=https://nexus.unu.edu,https://YOUR_APP.vercel.app
```

Wrong: `https://nexus.unu.edu/`  
Right: `https://nexus.unu.edu`

Preview deployments on Vercel use URLs like `unu-nexus-git-branch-team.vercel.app`. Those **will not** call chat/admin unless you add each origin (usually you do **not** — keep previews from hitting production Claude).

Confirm:

```bash
supabase secrets list
```

You should see `ANTHROPIC_API_KEY` and `ALLOWED_ORIGINS` (values hidden).

---

### 7. Connect GitHub to Vercel

1. Vercel → **Add New → Project** → import the GitHub repo.
2. Framework: **Vite** (auto-detected).
3. Root directory: `.` (repo root).
4. **Environment variables** — Production **and** Preview if you want previews to sign in to the same backend (often Production only is cleaner):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the **anon public** key |

Do **not** set:

- `VITE_ANTHROPIC_API_KEY` — the **build will fail**
- `VITE_DEV_BYPASS_AUTH` — the **build will fail** if `true`
- `SUPABASE_SERVICE_ROLE_KEY` as `VITE_*`

5. Deploy. Wait for a green build.
6. Open the `*.vercel.app` URL. You should see the Nexus login page (UN stripe, magic link).

If the build fails with a message about `VITE_ANTHROPIC_API_KEY` or `VITE_DEV_BYPASS_AUTH`, delete those variables from Vercel and redeploy.

`vercel.json` already rewrites all paths to `index.html` so `/library` and magic-link returns work.

---

### 8. Custom domain (staff type this in the browser)

**In plain terms.** Vercel already gave you a technical address (`something.vercel.app`). A custom domain is a UN hostname that points at the same website, with HTTPS.

#### 8.1 Choose a hostname

ICT typically picks a **subdomain** of an existing UNU zone, for example:

- `nexus.unu.edu`
- `nexus.globalhealth.unu.edu`

Apex (`unu.edu` itself) is unusual for an internal app and harder (A/ALIAS records). Prefer a subdomain.

#### 8.2 Add the domain in Vercel

1. Vercel → the Nexus project → **Settings → Domains**.
2. Add `nexus.unu.edu` (use the real name).
3. Vercel shows the DNS record to create. Commonly:

| Type | Name / host | Value |
|---|---|---|
| **CNAME** | `nexus` (or the subdomain prefix) | `cname.vercel-dns.com` |

If Vercel shows a different target, **use Vercel’s value**, not this table.

Some UN DNS panels want the fully qualified name `nexus.unu.edu` instead of `nexus`.

#### 8.3 Create the DNS record (UN ICT)

In the DNS host for `unu.edu` (or the delegated zone):

- Create the CNAME (or A/ALIAS if Vercel instructs).
- TTL: 300 seconds is fine while testing.
- If a **CAA** record restricts who may issue certificates, allow Let’s Encrypt / the CA Vercel uses, or HTTPS issuance will sit pending.

Do **not** also CNAME `www` unless you add `www.nexus.unu.edu` in Vercel too and decide which is canonical.

#### 8.4 Wait for HTTPS

Vercel issues a certificate automatically. Status on the Domains page: **Valid**. Until then, browsers may warn.

Check:

```bash
# Should eventually show Vercel / the site
curl -sI https://nexus.unu.edu | head
```

Or open the URL in a browser. You want the Nexus login page, padlock valid.

#### 8.5 Optional: make the custom domain primary

In Vercel Domains, set the UN hostname as **primary** so generated links prefer it. Keep `*.vercel.app` as a redirect **or** as a secondary origin — if you keep it reachable, it **must** stay on the Auth redirect list and on `ALLOWED_ORIGINS`, or that hostname’s chat will break.

---

### 9. Keep Auth and CORS in lockstep (easy to forget)

Whenever the public URL changes, update **three** places. They must list the **same origins** (scheme + host, no path, no trailing slash).

**A. Vercel** — already serving the domain (step 8).

**B. Supabase Auth → URL configuration**

- Site URL = `https://nexus.unu.edu` (the one staff should land on after the email link).
- Redirect URLs include:
  - `https://nexus.unu.edu/**`
  - `https://YOUR_APP.vercel.app/**` if that URL still works
  - `http://localhost:5173/**` for developers

**C. Supabase secret**

```bash
supabase secrets set ALLOWED_ORIGINS=https://nexus.unu.edu,https://YOUR_APP.vercel.app
```

No redeploy of functions is required for secrets; the next request reads the new value.

If chat fails in the browser with **Origin not allowed** or a CORS error, `ALLOWED_ORIGINS` does not exactly match `https://` + hostname (check `www` vs non-`www`, http vs https, trailing slash).

If the magic link opens then dumps you on login, **Redirect URLs** or **Site URL** are wrong.

---

### 10. First admin sign-in and smoke test

1. Open `https://nexus.unu.edu/login`.
2. Request a link to the bootstrap email (`ayhnassef@unu.edu` or the ICT address you put in `app_settings`).
3. Open the mail (check spam if SMTP is still default).
4. You should land **inside** Nexus, not on an error page.
5. Sidebar: **Administrator Dashboard** visible.
6. **Chat:** ask “What is Nexus?” — you should get a grounded or `noAnswer` reply, **not** “ANTHROPIC_API_KEY is not set” and **not** 401.
7. **Library:** still empty / no access for a second test user until you grant `view` or `edit`.
8. Create a second `@unu.edu` test account: confirm they **cannot** open Admin, **cannot** see library until granted, **cannot** see a folder you lock to someone else.

---

### 11. Rotate the anon key if the project was ever open

If this Supabase project (or an old copy of the anon key) was used when policies were `using (true)`:

1. Supabase → **Project Settings → API → Reset** (anon / JWT as documented in the dashboard).
2. Put the **new** anon key in Vercel `VITE_SUPABASE_ANON_KEY`.
3. **Redeploy** the Vercel project (env vars are baked into the Vite build).
4. Ask everyone to sign in again.

---

### 12. Production checklist

Print or tick in ICT’s ticket:

- [ ] GitHub repo owned or shared with UN, Vercel connected to `main`
- [ ] `schema.sql` → `permissions.sql` → `security.sql` applied
- [ ] Email provider on; Site URL + Redirect URLs include the **custom domain**
- [ ] Custom SMTP (recommended)
- [ ] `chat` and `admin` deployed (`config.toml` keeps gateway `verify_jwt` off; functions check the user JWT)
- [ ] `ANTHROPIC_API_KEY` is an **institutional** key
- [ ] `ALLOWED_ORIGINS` matches every origin staff actually use, no trailing slash, no `*`
- [ ] Vercel has **only** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- [ ] Production build succeeded (no accidental `VITE_ANTHROPIC_API_KEY`)
- [ ] Custom domain HTTPS valid
- [ ] Bootstrap / ICT admin can open Administrator Dashboard
- [ ] Test user: no library until granted; locked folder not visible
- [ ] Chat citations render; disallowed markdown links do not
- [ ] Anon key rotated if the project had old open policies
- [ ] Service role key not in Git, Vercel, or Slack
- [ ] Personal Anthropic key revoked after the institutional key works

---

## Local development (engineers, not hosting)

```bash
cp .env.example .env.local
# VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
# optional: VITE_ANTHROPIC_API_KEY and VITE_DEV_BYPASS_AUTH=true for npm run dev only
npm install
npm run dev
```

Point Auth redirect URLs at `http://localhost:5173/**` as above. Local chat can use the Edge Function (if CORS includes localhost — it does by default) **or** the local Anthropic key.

---

## Costs and sizing (order of magnitude)

For roughly 10–15 staff, light use:

| Service | Typical |
|---|---|
| Vercel | Hobby may suffice for internal traffic; **Pro** if you need team SSO, more build minutes, or institutional billing |
| Supabase | Free tier is often enough at this size; Pro if you need backups, SLA, or PITR |
| Anthropic Haiku | Cheap per question relative to larger models; watch monthly spend in the Anthropic console; rate limit is 40 chats / 10 min / user |

Exact numbers change; ICT should put billing alerts on Anthropic and Vercel.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Build fails mentioning Anthropic or `DEV_BYPASS` | Remove those `VITE_*` vars from Vercel |
| Login page but “Supabase is not configured” | Missing `VITE_*` on Vercel, or forgot **redeploy** after adding them |
| Magic link invalid / lands on wrong host | Site URL / Redirect URLs |
| Chat: Origin not allowed | `ALLOWED_ORIGINS` mismatch (slash, `www`, http) |
| Chat: Sign in required | Function got anon key as Bearer — use a build that sends the session token (current `main`) |
| Chat: ANTHROPIC_API_KEY is not set | Secret missing on the **Supabase** project, not Vercel |
| Chat: 429 | Rate limit; wait up to 10 minutes |
| Cannot create non-unu account | Expected (SQL trigger) |
| New user sees whole library | `security.sql` not applied, or they are bootstrap admin |
| Admin UI hidden but… | Non-admin; server would refuse anyway |
| Domain “Pending” | DNS not propagated, wrong CNAME, or CAA blocking certificates |
| Emails never arrive | SMTP / spam; configure custom SMTP |

---

## Related

- [Operations](operations.md) — after go-live  
- [Security](security.md) — why these settings exist  
- [Architecture](architecture.md) — what you just deployed  
