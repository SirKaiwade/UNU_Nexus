# Features

What each part of UNU Nexus does, who can use it, and the rules that go with it.

---

## Sign-in

**In plain terms.** You do not pick a password. You enter your UNU email; Nexus emails a one-time link. Only `@unu.edu` works.

| Behaviour | Detail |
|---|---|
| Allowed domain | `unu.edu` — checked in the form, in Auth (SQL trigger), in session handling, and again in Edge Functions |
| Banned emails | Cannot request a link; if they somehow have a session, they are signed out |
| Disabled accounts | Same: signed out with the admin’s reason when present |
| Redirect after link | Back to the site origin (production URL or custom domain) |
| Theme | Light by default; dark if the person previously chose it (`localStorage`) |
| Dev bypass | `VITE_DEV_BYPASS_AUTH=true` **and** `npm run dev` only. Production build fails if that flag is set |

---

## Shell (every signed-in page)

- UN stripe, brand mark, collapsible sidebar (remembered), mobile drawer
- Navigation: Chat, Knowledge library, Directory, Events, Publications
- Administrator Dashboard — only if `user.isAdmin` (UI). Server still enforces admin on every privileged action
- Conversation list (your threads only), new chat, delete thread
- Sign out
- Light / dark toggle
- Document viewer and citation rail slide in from the right

---

## Chat

**In plain terms.** Ask a colleague-style question. Get a cited briefing. Click a number to see the quote. Open the file or the events/publications row.

| Capability | Notes |
|---|---|
| Threaded history | Stored per user in Postgres; titles from the first question |
| Grounding | Library (allowed files) + events + publications. Instructed not to invent |
| Citations | `[1]`, `[2]` → click → `source_quotes` tool → verbatim excerpt. Phantom ids stripped |
| Library deep links | Answers may link to `/library?path=…&file=…`. Only `http(s)`, in-app `/` paths, and citation hashes render |
| Attachments | PDF / Word / Excel / text on the composer; those ids are always retrieved first |
| Save a reply | Flag on the message in your thread |
| Follow-ups | Model asked for three concrete next questions |
| “I don’t know” | `noAnswer` when the packet cannot support a confident answer |
| Rate limit | 40 chat calls / 10 minutes / person (server) |
| Model | Claude Haiku, forced server-side |

Chat cannot be used as an open Anthropic proxy: no arbitrary model, no extra tools, no huge paste beyond caps.

---

## Knowledge library

**In plain terms.** A team file cabinet with folders. Admins decide who may open the cabinet, and can lock individual drawers.

### Files

| Allowed | Not allowed |
|---|---|
| `.pdf` | `.doc` (old Word) |
| `.docx` | `.xls` (old Excel) — save as `.xlsx` or CSV |
| `.xlsx`, `.csv` | Random binaries, executables |
| `.txt`, `.md`, `.markdown` | Image-only PDFs with no extractable text (practical failure, not a type ban) |

Limits: 40 MB per file; extracted text capped at 1.5 million characters; path cannot contain `.` or `..`.

Magic-byte sniff: a file named `.pdf` that is not a PDF is rejected; Office files must look like ZIP/OOXML; text/CSV must not look like PDF or ZIP.

### Library roles (non-admins)

| Role | Label in UI | Meaning |
|---|---|---|
| `none` | No access | Default for **new** users. Library hidden / unusable |
| `view` | Read only | See allowed folders; no upload/delete |
| `edit` | Can edit | Upload and organise in folders they can see |

Admins always have full library access regardless of `library_role`.

### Folder locks

- Unrestricted folder: everyone with library access can see it.
- Locked folder: only people on the allow-list, plus admins.
- Locked with **empty** allow-list: **admins only**.
- Nested paths: the **most specific** lock wins.

Unauthorized users: the SQL policy `can_read_library_path` is false, so **those rows are not returned**. The UI also prunes local copies.

Editors with access use: upload, folder drop, new folder, delete file/folder, SharePoint import if configured, “Manage who can see this” (calls `admin` → `set_folder_viewers`).

### What colleagues actually receive

Shared library rows are **extracted text + filename + folder path + size**, not a Dropbox-style original-file CDN. Preview of the original bytes is from **this browser’s IndexedDB** when the file was ingested here.

---

## Directory

Categories: UNU Directory, Government, NGO, Partners, Other.

Typical fields: name, role, team, organisation, email, phone, country, location, expertise, tags, notes, avatar initials/colour.

Search across name, organisation, role, expertise, country, tags. Sort by name, organisation, or category. Add / edit / delete. Any **active signed-in** staff member may change rows (shared register, not approval workflow).

---

## Events

Programme events matrix (2026). Types include conference/symposium, webinar/seminar, workshop, policy dialogue, consultation/roundtable, coordination/partnership meeting, side event, other.

Also tracked (when filled): dates, strategic purpose, work package, owner, partners, funder, programme, location, modality (in person / virtual / hybrid), geographic level, participant numbers and percentages, Global South / gender / youth, south–south exchange, outputs, file/article/media links, high-level participants, status, staff count.

**Import** `.xlsx` / CSV. **Inline edit** after expanding a row. Chat can cite an event as a source (`ev-…`).

---

## Publications

Mastersheet fields include title, date, first/other authors, type, outlet, link, DOI, collections link, external link, URL, full citation, Pelikan project id, in-collections flag, ISBN, files, work package, target audience, Global South, purpose.

Same import and inline-edit pattern. Chat can cite (`pub-…`).

---

## Administrator Dashboard

Tabs: **People** and **Banned emails**.

| Action | Effect |
|---|---|
| Set library role | `none` / `view` / `edit` |
| Make / remove admin | Cannot strip admin from the bootstrap account |
| Disable | Soft-disable, library role none, global sign-out |
| Ban | Row in `banned_emails` + Auth `ban_duration` ~ 100 years + global sign-out |
| Unban | Remove row; clear Auth ban |
| Delete user | Auth delete (profile cascade where FK allows) |

Bootstrap email: `ayhnassef@unu.edu` (also listed in `app_settings.bootstrap_admin_emails`). Cannot be banned, disabled, demoted, or deleted through the admin function.

---

## Permissions matrix

| | Signed out | Signed in, library `none` | `view` | `edit` | Admin |
|---|---|---|---|---|---|
| Open the app | Login only | Yes | Yes | Yes | Yes |
| Own chats | — | Yes | Yes | Yes | Yes |
| Other people’s chats | — | No | No | No | No |
| Directory / events / publications | — | Read/write | Read/write | Read/write | Read/write |
| See unrestricted library files | — | No | Yes | Yes | Yes |
| See locked folder | — | No | If on allow-list | If on allow-list | Always |
| Upload / delete library | — | No | No | Where they can see | Yes |
| Change roles / bans / locks | — | No | No | No | Yes (server) |
| Call `chat` | No | Yes* | Yes* | Yes* | Yes* |
| Call `admin` | No | No | No | No | Yes |

\*Active `@unu.edu`, not banned, not disabled; then rate limits apply.

---

## Optional: SharePoint

If Microsoft Graph is configured, editors can sign in to Microsoft and import from drives/sites. Read-only Graph scopes. Items with retention label **Confidential** are blocked. This is off until `VITE_AZURE_CLIENT_ID` is set and Azure AD is approved.

---

## What Chat can see vs what a person can see

Chat retrieval uses **the same library set already loaded for that user**. It cannot search locked folders that RLS hid. Events and publications are included for every active user because those tables are shared registers.

---

## Related

- [Overview](overview.md) — narrative for leadership  
- [Architecture](architecture.md) — how retrieval and storage work  
- [Operations](operations.md) — how admins actually grant access  
