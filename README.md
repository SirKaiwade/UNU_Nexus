<p align="center">
  <img src="public/nexus/logo.svg" alt="Nexus" width="88" height="88" />
</p>

<h1 align="center">UNU Nexus</h1>

<p align="center">
  <strong>Handover — United Nations University · Global Health</strong><br />
  Internal staff workspace: cited Q&amp;A, knowledge library, directory, events, and publications.
</p>

<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/Handover_Documentation-02457A?style=for-the-badge" alt="Handover Documentation" /></a>
  <a href="./TECHNICAL.md"><img src="https://img.shields.io/badge/Technical_Documentation-9ca3af?style=for-the-badge" alt="Technical Documentation" /></a>
</p>

<p align="center">
  You are on the short handover. The technical document is optional — architecture, database rules, and a full install runthrough if you ever need it.
</p>

<p align="center">
  <a href="#what-it-does">What it does</a> ·
  <a href="#what-it-does-not-do">What it does not</a> ·
  <a href="#scope">Scope</a> ·
  <a href="#handover-checklist">Handover checklist</a> ·
  <a href="#deploy-it-yourself">Deploy</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Access-%40unu.edu%20only-02457A" alt="@unu.edu only" />
  <img src="https://img.shields.io/badge/Sign--in-Magic%20link-009EDB" alt="Magic link sign-in" />
  <img src="https://img.shields.io/badge/AI-Claude%20Haiku-1a1a1a" alt="Claude Haiku" />
  <img src="https://img.shields.io/badge/Hosting-Vercel%20%2B%20Supabase-646CFF" alt="Vercel and Supabase" />
</p>

---

Nexus is an **internal staff application**. Staff sign in with an `@unu.edu` magic link (no password). It is not a public website and not a general-purpose chatbot.

If you later need system architecture, Row Level Security, Edge Functions, or a step-by-step install with every setting named, open **[Technical Documentation](TECHNICAL.md)**. You do not need that file to get Nexus working.

---

## What it does

After sign-in, staff can:

1. **Ask questions** of programme material and get **cited** answers (`[1] [2]`). Clicking a citation shows a verbatim quote.
2. **Keep a knowledge library** — folder trees of PDF, Word, Excel, and text. Administrators decide who can read or edit, and can lock folders to named people.
3. **Keep shared registers** — directory, events matrix, and publications — with spreadsheet import and inline edit.
4. **Administer access** — library roles, bans, disabled accounts, folder visibility.

Answers come from **library text the person is allowed to read**, plus the **events** and **publications** registers. Chat history is **per person**. Other people’s threads are not visible.

The site is hosted on **Vercel** (built from this GitHub repo). **Supabase** holds sign-in, the database, and the server functions. **Anthropic Claude Haiku** answers questions. The Claude API key stays on the server; it is never part of the public website.

---

## What it does not do

- Search the public internet. If the library and registers cannot support an answer, the model is instructed to say so rather than invent facts.
- Replace SharePoint or any records system. Original files stay in SharePoint / drive. Nexus stores **extracted text and metadata** for search and Q&amp;A, not a shared copy of every binary.
- OCR image-only scanned PDFs (no selectable text).
- Share one person’s chat as a team corpus.
- Let anyone outside `@unu.edu` create an account.
- Give new staff the library automatically. They can sign in and use Chat (events/publications), Directory, Events, and Publications; an administrator must grant library access.
- Ship as a UN security accreditation package. This is an internal access model. ICT should own the vendor accounts, domain, mail, and keys.

---

## Scope

| In scope | Out of scope |
|---|---|
| UNU Global Health staff (`@unu.edu`) | Public or partner-facing website |
| Chat over allowed library files + events + publications | Web search, other AI models, using chat as an open Claude proxy |
| Knowledge library with roles and folder locks | Malware scanning; legacy `.xls` / `.doc`; a Dropbox-style file store |
| Directory, 2026 events matrix, 2026 publications sheet | Approval workflows on those registers (any signed-in staff can edit them) |
| Administrator dashboard for people, bans, folder locks | Classified / accredited hosting; UN-wide identity beyond `@unu.edu` magic link |
| Optional SharePoint **import** after Azure AD approval | SharePoint as the live editor inside Nexus |

Typical scale: about **10–15 staff**, Claude Haiku, 40 chat requests per person per 10 minutes.

---

## Who uses it

| Group | What they get |
|---|---|
| Programme staff | Cited Q&amp;A, shared registers. Library only after an admin grants it. |
| Team leads | Shared library; folders can be restricted to named people. |
| Administrators | Roles, bans, disables, folder visibility. |
| Programme | One staff app instead of unofficial chatbots and scattered files. |

**Session:** open the site → enter a UNU email → open the magic link in mail → Chat is the home page. Sidebar: Chat, Knowledge library, Directory, Events, Publications; administrators also see Administrator Dashboard.

Bootstrap administrator on the current project: **`ayhnassef@unu.edu`**. ICT should add a UN-held admin address before relying on the dashboard alone.

---

## Handover checklist

This is the running product: GitHub `main`, the Vercel site, the Supabase project, and the Claude key on that project. The receiving person (usually UN ICT) should **own those accounts**, put Claude on an **institutional** key, and put the site on a **UN hostname**.

Tick these in order. Details for each item are under [Deploy it yourself](#deploy-it-yourself) if you are starting from scratch.

### Accounts and ownership

- [ ] **GitHub** — Invite the UN owner as admin, or transfer [SirKaiwade/UNU_Nexus](https://github.com/SirKaiwade/UNU_Nexus) to a UN organisation. Keep Vercel pointed at the same repo.
- [ ] **Vercel** — Transfer the project to a UN team, or recreate it against the same repo. This is where the custom domain is attached.
- [ ] **Supabase** — Invite the UN email as **Owner** (Project Settings → General → Transfer project, or Organization → Members). Do **not** send the `service_role` key over chat or email. Optional: rotate the database password after transfer.
- [ ] **Anthropic (Claude)** — Create a UN-held account at [console.anthropic.com](https://console.anthropic.com), add billing, generate a new API key, **replace** the key currently stored on Supabase, confirm Chat works, then **revoke** the old key.

### Domain and go-live

- [ ] **Domain** — Use a UNU subdomain (typical: `nexus.unu.edu`) or buy/assign another hostname. In Vercel → Project → Settings → Domains, add it. In DNS, create the CNAME Vercel shows (often `cname.vercel-dns.com`). Wait until HTTPS is **Valid**.
- [ ] **Tell sign-in about the new URL** — Supabase → Authentication → URL configuration: Site URL = `https://your-domain` (no trailing slash). Redirect URLs must include `https://your-domain/**` and the `*.vercel.app` URL if that address still works.
- [ ] **Tell Chat about the new URL** — from a machine with the [Supabase CLI](https://supabase.com/docs/guides/cli):  
      `supabase secrets set ALLOWED_ORIGINS=https://your-domain,https://YOUR_APP.vercel.app`  
      No trailing slash, no `*`.
- [ ] **Claude key replaced** — `supabase secrets set ANTHROPIC_API_KEY=sk-ant-…` using the new UN key. Ask a question in Chat. Then revoke the previous key in the old Anthropic console.
- [ ] **Admin on a UN mailbox** — Add the ICT `@unu.edu` address to bootstrap admins (see Technical Documentation) or sign in once and have the current admin promote them in Administrator Dashboard.
- [ ] **Smoke test** — Magic link lands inside the app. Chat replies (not “API key is not set”). A second test user cannot open Admin and cannot see the library until granted.

### Leave these alone unless ICT is rotating credentials

- Vercel should have **only** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Never put the Anthropic key or the Supabase **service role** key in Vercel. Production builds **fail** if `VITE_ANTHROPIC_API_KEY` is set.
- Do not add `*` to Auth redirect URLs or to `ALLOWED_ORIGINS`.

---

## Deploy it yourself

Hands-on time is about **90–150 minutes**, plus DNS. You need a GitHub account, a [Vercel](https://vercel.com) account, a [Supabase](https://supabase.com) account, and an [Anthropic](https://console.anthropic.com) account. Use organisation/team logins, not a personal account you might leave.

### A. You are taking over the app that is already running

1. Get **Owner** on GitHub, Vercel, and Supabase (checklist above).
2. Create the UN Claude account → new API key → `supabase secrets set ANTHROPIC_API_KEY=…` → test Chat → revoke the old key.
3. Add the domain in Vercel, create the DNS record, then update Auth URLs and `ALLOWED_ORIGINS` so they match.
4. Sign in as an administrator and grant library roles to staff.

You do not need to recreate the database. Staff data stays in the existing Supabase project.

### B. You are standing up a clean copy

1. **Code** — Fork or clone this repository. Vercel will build from `main`.
2. **Supabase** — New project. Copy the Project URL and the **anon public** key (not `service_role`). In SQL Editor, run these files **in order**, one at a time: `supabase/schema.sql` → `supabase/permissions.sql` → `supabase/security.sql`.
3. **Auth** — Email provider on (magic link). Site URL and Redirect URLs set to your Vercel URL (and later the custom domain). Optional but recommended: UN SMTP so magic-link mail is not treated as spam.
4. **Functions and secrets**
   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy chat
   supabase functions deploy admin
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase secrets set ALLOWED_ORIGINS=https://YOUR_APP.vercel.app
   ```
5. **Vercel** — Import the GitHub repo (Vite, repo root). Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Deploy. Open the `*.vercel.app` URL; you should see the Nexus login page.
6. **Domain** — Vercel → Domains → add hostname → DNS CNAME → wait for HTTPS. Then repeat the Auth URL and `ALLOWED_ORIGINS` updates so they include `https://your-domain`.
7. **First sign-in** — Request a magic link for the bootstrap admin email. Confirm Administrator Dashboard is visible. Ask Chat a question. Create a second `@unu.edu` user and confirm they have **no** library until you grant it.

If something fails (magic link dumps you on login, Chat says origin not allowed, build mentions Anthropic), the fix is almost always: URLs must match **exactly** (https, no trailing slash, www vs not), or a secret is on the wrong vendor. The troubleshooting table is in [Technical Documentation](TECHNICAL.md#troubleshooting).

---

## After go-live (administrators)

In **Administrator Dashboard**:

| Task | Where |
|---|---|
| Grant library **read** or **edit** | People — users appear after their first successful sign-in |
| Make another admin | People — do not remove admin from the bootstrap address |
| Ban / unban | Banned emails — they cannot sign in; sessions are revoked |
| Disable or delete | People — delete is irreversible |
| Lock a folder | Knowledge library → manage who can see this |

Directory, events, and publications are **shared**. Any signed-in staff member can edit those rows. Export the events and publications sheets from time to time if you rely on them.

Keep source files in SharePoint or a drive. Nexus is the searchable layer, not the records store.

---

## Technical Documentation

**[Technical Documentation](TECHNICAL.md)** is the long runthrough: diagrams, table-by-table access rules, how a question is answered, Edge Function behaviour, custom domain internals, break-glass SQL, and local development.

It is **not** required to get Nexus working. Keep it for ICT or a developer who has to change how the system is built.

---

## About

Built for **United Nations University · Global Health**.

Internal staff tool. Access is managed by programme administrators. Not a public open-source product.
