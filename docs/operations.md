# Operations

Running UNU Nexus after it is hosted: people, folders, keys, and handing over from the current personal setup.

For the first install and custom domain, use **[Deploy](deploy.md)**.

---

## In plain terms

A small number of **admins** decide who may use the knowledge library and which folders are private. Everyone with an `@unu.edu` magic link can sign in; they do **not** automatically see files.

The first admin is **`ayhnassef@unu.edu`**. UN ICT can add another “break-glass” admin in the database without waiting for a code change.

---

## Daily admin tasks (in the product)

Open **Administrator Dashboard** (sidebar, admins only).

### Grant library access

People → find the person (they appear after **first successful sign-in**) → set role:

| Role | When to use |
|---|---|
| No access | Default. Sign-in only: chats, directory, events, publications |
| Read only | Needs to search and cite the library, not upload |
| Can edit | Uploads, organises folders, may manage folder visibility |

### Promote another admin

People → make admin. They get full library access. **Do not** remove admin from the bootstrap address; the server will refuse.

### Ban someone

Banned emails tab → email + reason. Effects:

- They cannot sign in
- Auth session is invalidated everywhere
- Auth user is banned for a very long duration
- SQL also rejects new accounts for that email

Unban reverses the list and the Auth ban.

### Disable vs ban vs delete

| Action | Meaning |
|---|---|
| **Disable** | Profile marked disabled, library role none, signed out. Email might still exist in Auth. |
| **Ban** | Email blocked from the product and from creating a new account. |
| **Delete user** | Removes the Auth user (and cascaded profile data where the schema says so). Irreversible. Cannot delete the bootstrap admin. |

### Lock a folder

Knowledge library → right-click folder → **Manage who can see this**.

- Everyone with library access (unlock)
- Selected people
- Nobody except admins (lock + empty list)

Nested folders: the **longest matching** lock path wins.

These writes go to the **admin** function, not straight to the database from the browser.

---

## Break-glass admin (UN ICT)

If every dashboard admin is unavailable, someone with **SQL Editor** access on the Supabase project can do this:

```sql
update public.app_settings
set value = 'ict-admin@unu.edu,ayhnassef@unu.edu'
where key = 'bootstrap_admin_emails';

select public.elevate_bootstrap_admins();
```

That person must then **sign in once** (magic link) so a profile exists; `elevate_bootstrap_admins` sets `is_admin` and `library_role = edit` on matching emails.

Keep this list short. It bypasses the “make admin” button by design.

---

## Handover from the current personal production

Today: GitHub `main` → **personal Vercel**, **personal Anthropic key** on Supabase, locked-down SQL and functions already applied.

| Item | What to do |
|---|---|
| GitHub | Invite ICT / transfer repo to a UN org. Vercel’s Git connection must follow the repo. |
| Vercel | Transfer project to a UN **team**, or recreate the project pointing at the same repo and the same `VITE_*` values. Custom domain lives here. |
| Anthropic | New org + key → `supabase secrets set ANTHROPIC_API_KEY=...` → test chat → **revoke** the personal key. |
| Supabase | Invite ICT as owner. Do not paste service role into Slack. Optional: rotate database password and anon key (anon rotation requires Vercel env update + **redeploy**). |
| Domain | ICT DNS CNAME → Vercel; then Auth URLs + `ALLOWED_ORIGINS` ([Deploy §8–9](deploy.md#8-custom-domain-staff-type-this-in-the-browser)). |
| SMTP | Move magic link mail onto UN SMTP so staff trust the sender. |

After Vercel rebuilds from current `main`, the **website matches** this security model. Functions and SQL must already be the versions in this repo (they were applied/deployed for the lock-down).

---

## Changing secrets later

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set ALLOWED_ORIGINS=https://nexus.unu.edu,https://YOUR_APP.vercel.app
```

No function redeploy needed for secrets. **Do** redeploy Vercel if you change `VITE_SUPABASE_*` (they are compiled in).

Redeploy functions after pulling code changes:

```bash
supabase functions deploy chat
supabase functions deploy admin
```

(`supabase/config.toml` already sets `verify_jwt = false`; functions still authenticate the user JWT themselves.)

Re-run `security.sql` after pulling SQL changes (it is written to be re-runnable).

---

## Backups and registers

- **Supabase** Pro: enable daily backups / point-in-time recovery if the events and publications matrices are operationally critical.
- Directory, events, publications are **shared and editable by all active staff**. Accidental wipes are possible. Export `.xlsx` periodically from the Events/Publications pages if you rely on those matrices.
- Chat history is per user; there is no product-wide “export all chats” button.
- Original uploaded **binaries** live in each browser’s IndexedDB — not a UN records store. Keep source files in SharePoint/drive as the system of record; Nexus holds searchable text.

---

## What not to do

- Do not set `VITE_ANTHROPIC_API_KEY` or `VITE_DEV_BYPASS_AUTH` on Vercel.
- Do not put `ALLOWED_ORIGINS=*`
- Do not add `*` to Auth redirect URLs
- Do not grant the service role to the frontend
- Do not demote or ban the bootstrap admin from the dashboard (the API will refuse; do not try to “fix” that in SQL unless ICT is replacing bootstrap emails in `app_settings` first)
- Do not assume hiding `/admin` is enough — it is not; keep the admin function deployed

---

## Optional: SharePoint

Only after UN Azure AD review. Add `VITE_AZURE_CLIENT_ID` (and tenant if required) on Vercel, redeploy, then use the connector in the library. Scopes are read-only. **Confidential** retention-labelled files are not imported.

---

## Related

- [Deploy](deploy.md) — domain, DNS, first install  
- [Security](security.md) — why these procedures exist  
- [Features](features.md) — permission matrix  
