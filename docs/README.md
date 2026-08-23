# Documentation

This folder is the full technical and operational record of **UNU Nexus**, written so a UN supervisor can read it, and so ICT can host it.

Start at the [repository README](../README.md) for the architecture diagram and a ten-minute briefing. Use the pages below when you need depth.

| Document | Read it when you need to… |
|---|---|
| [Overview](overview.md) | Explain what Nexus *is*, what staff can do, and what it is not |
| [Architecture](architecture.md) | See how the website, database, functions, and Claude fit together |
| [Features](features.md) | Walk every page, file type, and permission |
| [Security](security.md) | Judge whether the lock-down is adequate for an internal UNU tool |
| [Deploy](deploy.md) | Put Nexus on GitHub + Vercel + Supabase, including a **custom domain** |
| [Operations](operations.md) | Run it day to day, add a break-glass admin, hand over from the current personal setup |

## Suggested reading order

1. **Leadership (30 minutes):** README → Overview → Security (the “In plain terms” sections) → Features (the tables).
2. **ICT hosting (half a day + DNS wait):** Deploy, start to finish, then Operations § Handover.
3. **Engineers:** Architecture → Security (technical sections) → `supabase/security.sql` and `supabase/functions/`.

## Voice of these docs

Each major topic is stated twice:

- **In plain terms** — what a non-engineer should take away.
- **How it actually works** — the precise mechanism, named in the code and SQL.

If those two disagree, the SQL and Edge Functions are the source of truth, not the website UI.
