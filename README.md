# Synapse — Permissioned Task Manager

Multi-user task board where everyone sees **only what's theirs**:

- **Tabs** = project groups. Users see only tabs an admin gave them.
- **Rows** = tasks. Each tab is either `All rows` (members see everything) or
  `Tagged only` (members see only rows they're tagged in).
- **Custom fields per tab** — admin defines columns (text / select / checkbox /
  date / person). Base columns seeded: Person, Task description, Category, Done.
- **Google sign-in + admin approval** — first login is `pending`; an admin must
  approve before access. Admins can change roles and remove people.
- **Add tasks from WhatsApp** — send `#tab @person task text` to your WhatsApp
  Cloud API number and a row is appended in that tab, tagging the person.

## Stack

Next.js 16 (App Router) · Postgres + Prisma · Auth.js (Google) ·
TanStack-style editable grid · Tailwind v4 · Framer Motion.
Permissions are enforced **server-side** in `src/lib/access.ts`; the client never
receives rows a user may not see.

## Setup

### 1. Database (Postgres)

Spin up Postgres and put the URL in `.env` (copy from `.env.example`):

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/taskmanager?schema=public"
```

Then create the schema and seed sample tabs:

```bash
npm run db:push      # or: npm run db:migrate
npm run db:seed      # creates Marketing (Tagged only) + Roadmap (All rows)
```

### 2. Google OAuth

Create OAuth credentials at
<https://console.cloud.google.com/apis/credentials>.
Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`.
Fill in `.env`:

```
AUTH_SECRET="..."        # npx auth secret
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."
ADMIN_EMAIL="you@example.com"   # auto-promoted to approved admin on first login
```

### 3. Run

```bash
npm run dev
```

Sign in with the `ADMIN_EMAIL` Google account → you're admin. Other people who
sign in land on a **pending** screen until you approve them in **People**.

### 4. WhatsApp (Meta Cloud API)

In the Meta app's WhatsApp config, set the webhook callback to
`https://YOUR_HOST/api/whatsapp` and the **Verify token** to
`WHATSAPP_VERIFY_TOKEN` from `.env`. Set `WHATSAPP_APP_SECRET` to validate
signatures. Locally, expose port 3000 with a tunnel (e.g. cloudflared/ngrok).

Message format: `#marketing @john Build the landing page`
→ new row in **Marketing**, description "Build the landing page", tagging John
(only if John is a member of that tab).

## Key files

| Area | Path |
|------|------|
| Permission helpers | `src/lib/access.ts` |
| Auth + approval | `src/auth.ts` |
| Task mutations | `src/app/(app)/actions.ts` |
| Admin mutations | `src/app/(app)/admin/actions.ts` |
| Editable grid | `src/components/task-grid.tsx` |
| WhatsApp parse + ingest | `src/lib/whatsapp.ts`, `src/app/api/whatsapp/route.ts` |
| Schema | `prisma/schema.prisma` |
