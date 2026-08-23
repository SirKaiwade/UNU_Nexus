# UNU Nexus

**Institutional knowledge for UNU Global Health — grounded, citable, and shared.**

Nexus helps staff find answers in reports, briefs, and project material, keep a structured knowledge library, and manage directory, events, and publications in one place.

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20Data-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![License](https://img.shields.io/badge/Access-%40unu.edu%20staff-02457F)](#)

<p align="center">
  <img src="public/nexus/logo.svg" alt="Nexus mark" width="72" height="72" />
</p>

---

## What it does

| Area | Purpose |
|------|---------|
| **Chat** | Ask Nexus questions grounded in your uploaded sources, with citations |
| **Knowledge library** | Upload folder trees (PDF, Word, Excel, text); search by path or content |
| **Directory** | Contacts across UNU, government, NGO, and partners |
| **Events & publications** | Shared programme registers with import and inline edit |
| **Administrator Dashboard** | People, library roles, bans, and folder visibility |

Access is limited to **`@unu.edu`** accounts (magic-link sign-in).

---

## Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide
- **Auth & data:** Supabase (Auth, Postgres, Edge Functions)
- **AI:** Anthropic Claude via Supabase Edge Function (or local key for development)
- **Optional:** Microsoft Graph / SharePoint connector

---

## Quick start

```bash
git clone https://github.com/SirKaiwade/UNU_Nexus.git
cd UNU_Nexus
npm install
cp .env.example .env.local
```

Fill in `.env.local` (see `.env.example`):

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `VITE_ANTHROPIC_API_KEY` | Local `npm run dev` chat fallback only — never set in production |
| `VITE_DEV_BYPASS_AUTH=true` | Skip magic link while running `npm run dev` |

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Database

1. Run `supabase/schema.sql` in the Supabase SQL Editor (base tables).
2. Run `supabase/permissions.sql` (admins, bans, library roles, folder access).
3. Run `supabase/security.sql` (scoped RLS, auth domain trigger, grants).

Then deploy functions (JWT is verified inside each function):

```bash
supabase functions deploy chat
supabase functions deploy admin
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set ALLOWED_ORIGINS=https://YOUR_APP.vercel.app
```

If this project was ever reachable with the old open RLS policies, rotate the anon key in the Supabase dashboard after applying `security.sql`.

---

## Permissions (high level)

- **Library access per person:** No access · Read only · Can edit  
- **Folders:** Right-click → *Manage who can see this*  
- **Admins:** Full dashboard + all folders. Bootstrap admin emails live in `public.app_settings` (`bootstrap_admin_emails`), not only in the client. UN ICT can add a break-glass address there and run `select public.elevate_bootstrap_admins();`.

---

## Scripts

```bash
npm run dev          # local development
npm run build        # production build
npm run typecheck    # TypeScript
npm run lint         # ESLint
```

---

## Project layout

```
src/
  components/     # Chat, library, admin, registers
  lib/            # Auth, permissions, Supabase, Nexus retrieval
  pages/          # Login
supabase/
  schema.sql
  permissions.sql
  functions/      # chat + admin Edge Functions
```

---

## Deploy

Configured for **Vercel** (or similar). Set the same `VITE_*` variables in the host’s environment. Do **not** put the Supabase service role key in any `VITE_*` variable.

---

## About

Built for **United Nations University · Global Health**.

Internal staff tool — not a public open-source product. Contributions and access are managed by UNU Global Health administrators.
