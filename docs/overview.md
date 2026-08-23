# Overview — what Nexus is, and what is possible

This page is for a supervisor who needs the product, not the source code. Technical mechanisms are named only when they change what is *possible*.

---

## One sentence

Nexus is a **private, cited knowledge workspace** for UNU Global Health staff: ask questions of programme documents, keep a shared library with folder-level visibility, and maintain directory, events, and publications in the same place.

---

## Who it is for

| Audience | What they get |
|---|---|
| Researchers and programme staff | Fast answers grounded in *our* reports, briefs, spreadsheets, events, and publications — with sources they can open |
| Team leads | A shared library that can be opened to the team or locked to named people |
| Administrators | Who may enter, who may see which folders, and who is banned — without relying on “please don’t click that” |
| Leadership | One staff tool instead of a scatter of drives, inboxes, and unofficial chatbots |

It is **not** for the public, partners without an `@unu.edu` address, or anonymous internet users.

---

## What using it feels like

1. Staff open the site and enter their UNU email.
2. They receive a **magic link** (one-time sign-in, no password to remember).
3. Inside: a sidebar with Chat, Knowledge library, Directory, Events, Publications, and — if they are an admin — Administrator Dashboard.
4. Chat is the default home. They type a question the way they would ask a colleague.
5. Nexus answers in a briefing tone, with **[1] [2]** citations. Clicking a citation fetches a verbatim quote. Links into the library use folder breadcrumbs (`Finance > 2024 > budget.xlsx`).
6. If the material is not there, Nexus is instructed to say so rather than invent dates, names, or findings.

Conversations live in the left rail and are **only that person’s**. Clearing someone else’s chat is not possible from the product.

---

## Breadth of the site

Nexus is five applications sharing one sign-in and one visual shell.

### 1. Chat (institutional Q&A)

**Possible today**

- Ask about uploaded library files (“Where is the 2024 budget workbook?” / “What did the workshop in Nairobi conclude?”).
- Ask across the **events matrix** and **publications** register (upcoming convenings, who leads what, counts where the spreadsheet has numbers).
- Attach a PDF or spreadsheet to *this question* so it is always included in retrieval.
- Click citations, open the source, save a reply, continue the thread.

**Not possible today**

- Web search. Nexus does not browse the public internet.
- Guaranteeing an answer from a *scanned* PDF with no selectable text (those need OCR, which is out of scope).
- Using a staff member’s private chat as a team knowledge base (chats are not shared).

### 2. Knowledge library

**Possible today**

- Upload one file or drop a whole folder tree; folder structure is preserved.
- Types: PDF, Word (`.docx`), Excel (`.xlsx`, CSV), plain text and Markdown.
- Search by filename, path, or extracted text.
- Share into the team library (extracted text + path), subject to role and folder locks.
- Restrict a folder to named people (or admins only). Unauthorized users **do not receive those files from the database** — they are not merely hidden in the menu.

**Not possible today**

- Uploading legacy `.xls` (pre-2007 Excel). Save as `.xlsx` or CSV.
- Antivirus / malware scanning of uploads.
- Storing the original PDF binary in the cloud for every colleague. What is shared is **extracted text and metadata**; the original bytes stay in the uploader’s browser storage for local preview.

### 3. Directory

A shared contact book: UNU, government, NGO, partners, other. Name, role, organisation, email, phone, country, expertise, tags, notes. Search and filter. Add / edit / remove. Empty until staff fill it (nothing ships as dummy people).

Any **signed-in, active** staff member can edit directory rows. That is a programme choice: it behaves like a shared spreadsheet, not a CMS with an approvals workflow.

### 4. Events

The 2026 events matrix as a first-class register: conferences, webinars, workshops, policy dialogues, consultations, partnership meetings, side events, and other. Fields cover strategic purpose, work package, partners, funder, modality, geographic level, participant counts (including Global South / gender / youth where recorded), outputs, and comms links.

Import a mastersheet (`.xlsx` / CSV). Expand a row and **double-click to edit**; changes save. Events are part of what Chat can cite (`ev-…` ids).

### 5. Publications

The 2026 publications mastersheet: title, authors, type, outlet, DOI, collections and external links, Pelikan project id, ISBN, work package, audience, Global South flag, purpose.

Same import and inline-edit pattern. Chat can cite publications (`pub-…` ids).

### 6. Administrator Dashboard

Visible only to admins. The important part: **hiding the page is not the security boundary**. Privilege changes are performed by a server function that checks “is this person an admin?” before it will:

- Grant or revoke admin
- Set library role: no access / read only / can edit
- Ban or unban an email (including locking the Auth user and signing them out everywhere)
- Disable an account
- Delete a user
- (From the library UI) lock a folder and set viewers

New people who sign in get **no library access** until an admin grants it. They can still use Chat against events/publications and whatever the programme has made generally available, and they can use Directory / Events / Publications as signed-in staff.

---

## How it works, without the jargon

Think of three rooms:

1. **The shopfront (Vercel)** — the pages staff see. Pretty, but not in charge of secrets or privileges.
2. **The registry (Supabase)** — who is signed in, and every row of data. It has rules printed on each cabinet: “only the owner may open this drawer.”
3. **The specialist (Claude, via a guarded door)** — reads a *packet* of relevant text and writes a cited answer. Staff never hold the specialist’s key.

When someone asks a question, Nexus does **not** send the entire library. It:

1. Lists every file path (so “where is X?” still works).
2. Scores files by name, folder path, and word overlap with the question.
3. Sends the best few (plus any files attached to the chat) up to a size budget.
4. Also includes the current events and publications registers.
5. Instructs the model: only use this packet; cite; if it is not there, say so.

That is why a well-named folder tree matters as much as the file contents.

---

## What leadership should expect

| Expectation | Reality |
|---|---|
| “Staff can find things faster” | Yes, if the library is populated and named clearly. Empty library → Chat still helps with events/publications, but document Q&A will honestly return “not in the corpus.” |
| “It replaces SharePoint” | No. Optional SharePoint *import* exists if Azure AD is approved. Nexus is a knowledge layer on top of files, not a records system of record. |
| “The AI cannot leak our key” | The Anthropic key is a server secret. Production will not build if someone tries to put it in the website. |
| “Only UNU can get in” | Accounts must be `@unu.edu`. Banned/disabled people are blocked at sign-in, at the database, and at the chat/admin doors. |
| “Admins control the library” | Yes. Default for new users is no library access. Folders can be locked. |
| “It is certified to a UN security standard” | This repo implements a **serious internal lock-down**. It is not a formal accreditation package. ICT should still own accounts, domain, SMTP, and key rotation — see [Deploy](deploy.md) and [Security](security.md). |
| “Cost is unbounded ChatGPT use” | The model is **Claude Haiku** (fast, inexpensive). Chat is rate-limited per user. Hosting is Vercel + Supabase, typically modest at 10–15 staff. |

---

## Honest boundaries

- **No malware scanning** of uploads.
- **Retrieval is assembled in the browser**, then sent to the chat function, which **caps** size, tools, and rate. A determined user cannot pick another model or turn the function into an open Claude proxy; they can still influence *which text* is in the packet from files they are allowed to read.
- **Original file binaries** are not a shared cloud file store.
- **Directory / events / publications** are editable by any active signed-in user (shared-register model).
- The optional **Before User Created** Auth hook is extra belt-and-braces; SQL already rejects non-`@unu.edu` and banned emails.

---

## Where to go next

- [Architecture](architecture.md) — the diagram in engineering detail  
- [Features](features.md) — field lists, file types, permission matrix  
- [Security](security.md) — controls and residual risk  
- [Deploy](deploy.md) — host it on a UN domain  
