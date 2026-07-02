# Synapse — Permissioned Task Manager

Multi-user task board where everyone sees **only what's theirs**. Tasks can be
added from the web UI or straight from **WhatsApp**. Access is **invite-only**,
and an admin controls permissions down to the **column** level.

**Live:** https://synapse-iota-lac.vercel.app · **Repo:** github.com/Nest3D/Synapse

---

## What it does

- **Tabs** = project groups. A user sees only the tabs an admin granted them.
- **Rows** = tasks. Each tab is either `All rows` (members see everything) or
  `Tagged only` (members see only rows they're tagged in).
- **Custom fields per tab** — admin defines columns (text / select / checkbox /
  date / person). Seeded base columns: Person, Task description, Category, Done.
- **Invite-only Google sign-in** — only emails an admin has invited can log in;
  everyone else is rejected at the door. Invited users wait on a `pending`
  screen until approved.
- **Per-user page + field permissions** — admin chooses which tabs a person can
  open and which columns they can see within each.
- **Add tasks from WhatsApp** — send `#tab @person task text` to the WhatsApp
  Cloud API number and a row is appended in that tab, tagging the person.

---

## System architecture

The system has **two independent planes** that meet only at the database.

```
        WEB PLANE (humans)                      WHATSAPP PLANE (Meta)
  ┌───────────────────────────┐         ┌──────────────────────────────┐
  │ Browser                   │         │ Meta WhatsApp Cloud API       │
  │   │ Google OAuth          │         │   │ POST webhook              │
  │   ▼                       │         │   ▼                           │
  │ Auth.js signIn gate ──────┼──┐      │ /api/whatsapp (route.ts)      │
  │ (invite allowlist)        │  │      │   │ verify X-Hub-Signature    │
  │   │ session (role,status) │  │      │   │ parse #tab @person text   │
  │   ▼                       │  │      │   │ ingestParsedMessage       │
  │ Server Components +       │  │      │   ▼                           │
  │ Server Actions            │  │      │ (no user session — trusted    │
  │   │ access.ts gatekeeper  │  │      │  server ingest)               │
  │   ▼                       │  │      │                               │
  └───┼───────────────────────┘  │      └──────────────┼───────────────┘
      │                          │                     │
      ▼                          ▼                     ▼
   ┌──────────────────────────────────────────────────────┐
   │          Postgres (Neon) via Prisma                    │
   │   Users · Tabs · FieldDefs · Tasks · Memberships ·     │
   │   FieldPermissions · TaskAssignees · WhatsAppLog       │
   └──────────────────────────────────────────────────────┘
```

- **Web plane** is permissioned: every read/write goes through `src/lib/access.ts`,
  which derives what the signed-in user may see/do. The client never receives
  rows, cells, or member data it isn't allowed to see.
- **WhatsApp plane** is unauthenticated by session but verified by Meta's HMAC
  signature (`WHATSAPP_APP_SECRET`). It only *ingests* — it writes tasks, it
  never reads on behalf of a viewer, so field-permissions don't apply to it.
- The two never share request context; they only converge on the shared schema.

### Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, Server Components + Server Actions, Turbopack) |
| Language | TypeScript, React 19 |
| Auth | Auth.js v5 (`next-auth` beta) with Google provider + Prisma adapter |
| Database | PostgreSQL (Neon, pooled) via Prisma 6 |
| UI | Tailwind v4, Framer Motion, lucide-react, CVA buttons |
| Validation | Zod |
| Tests | Vitest (pure permission logic) |
| Hosting | Vercel (auto-deploy from `master`) |

---

## Access & permission model

Permissions are enforced **server-side only**. There are three nested layers.

### 1. Login gate (invite-only) — `src/auth.ts`
The Auth.js `signIn` callback returns `false` unless the email is the bootstrap
`ADMIN_EMAIL` or already has a `User` row. "Inviting" someone (admin action)
**pre-creates that `User` row** (status `pending`) with their permissions
attached; Google then links the OAuth login to it by verified email
(`allowDangerousEmailAccountLinking`). Rejected logins land on
`/login?error=AccessDenied`.

### 2. Page (tab) access — `TabMembership`
`getVisibleTabs` / `canAccessTab` decide which tabs a user can open. Admins see
all tabs.

### 3. Field (column) view — `FieldPermission`
Per `(user, tab)`: **admin sees all**; a user with **zero** `FieldPermission`
rows for the tab sees **all** columns (opt-in restriction); a user with **≥1**
sees **only** granted columns. Enforced in three places:

1. **Read** — `getVisibleTasks` strips hidden keys out of each task's `values`
   JSON, and hides assignee/member data when the `person` column isn't visible.
2. **Render** — the tab page builds its columns from `getVisibleFields` only.
3. **Write** — `updateCell` / `setAssignees` call `assertFieldVisible` and reject
   edits to hidden columns.

Row-level visibility (`TAGGED_ONLY` vs `ALL_ROWS`) is layered underneath all of
the above.

The reusable pure logic (no DB/framework) lives in `src/lib/permissions.ts` and
is unit-tested: `resolveVisibleFieldKeys`, `isLoginAllowed`,
`stripValuesToVisible`.

---

## Data model (`prisma/schema.prisma`)

```
User ─┬─< Account            (OAuth links — presence ⇒ user has logged in)
      ├─< Session
      ├─< TabMembership >─ Tab          (page access)
      ├─< FieldPermission >─ FieldDef   (column-view access)
      └─< TaskAssignee   >─ Task

Tab ─┬─< FieldDef          (custom columns; key used inside Task.values JSON)
     └─< Task              (values: Json keyed by FieldDef.key; source: manual|whatsapp)

WhatsAppLog                (audit of every inbound webhook payload + parse result)
```

- `User.role` = `admin | member`, `User.status` = `pending | approved`.
  "Invited but never logged in" is derived (`_count.accounts === 0`), shown as
  the `invited` badge.
- `Tab.visibilityMode` = `ALL_ROWS | TAGGED_ONLY`.
- `Task.values` is a JSON object keyed by `FieldDef.key`; the `person` field
  mirrors `TaskAssignee` rows.

---

## Request flows

**Web — viewing a tab** (`src/app/(app)/tab/[tabId]/page.tsx`)
1. `getApprovedUser()` → redirect if not approved.
2. `canAccessTab` → 404 if no membership.
3. `getVisibleFields` (columns) + `getVisibleTasks` (rows, values stripped) +
   members (only if person column visible) are fetched in parallel and passed to
   the client `TaskGrid`.

**Web — editing a cell** (`src/app/(app)/actions.ts`)
`updateCell` → `requireUser` → `canSeeTask` → `assertFieldVisible` → write →
`revalidatePath`.

**WhatsApp — inbound message** (`src/app/api/whatsapp/route.ts`)
`POST` → `verifySignature` (HMAC) → `extractTextMessages` → `parseMessage`
(`#tab @person text`) → `ingestParsedMessage` (resolve tab, resolve tagged
members of that tab, append `Task` with `source: whatsapp`) → log to
`WhatsAppLog`. Always returns 200 so Meta doesn't retry. `GET` handles Meta's
one-time webhook verification challenge.

---

## Key files

| Area | Path |
|------|------|
| Auth + invite gate | `src/auth.ts` |
| Pure permission logic (tested) | `src/lib/permissions.ts`, `src/lib/permissions.test.ts` |
| Permission gatekeeper (DB-backed) | `src/lib/access.ts` |
| Task mutations | `src/app/(app)/actions.ts` |
| Admin mutations (invite, roles, perms, tabs, fields) | `src/app/(app)/admin/actions.ts` |
| Editable grid | `src/components/task-grid.tsx` |
| People admin + invite/edit-access UI | `src/app/(app)/admin/users/page.tsx`, `src/components/admin/*` |
| WhatsApp parse + ingest | `src/lib/whatsapp.ts`, `src/app/api/whatsapp/route.ts` |
| Schema | `prisma/schema.prisma` |
| Design & plan docs | `docs/superpowers/` |

---

## Environment variables

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Postgres (Neon pooled) connection string |
| `AUTH_SECRET` | Auth.js token signing secret (`npx auth secret`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client credentials |
| `ADMIN_EMAIL` | Auto-promoted to approved admin on first login; bypasses the invite gate |
| `WHATSAPP_VERIFY_TOKEN` | Must match the token set in Meta's webhook config |
| `WHATSAPP_APP_SECRET` | Meta App Secret; validates inbound webhook signatures (empty ⇒ check skipped — dev only) |

`.env` is gitignored. In production these live in Vercel project settings.

---

## Local development

```bash
# 1. Install
npm install                 # runs `prisma generate` via postinstall

# 2. Configure
cp .env.example .env        # fill in DATABASE_URL, AUTH_*, ADMIN_EMAIL, WHATSAPP_*

# 3. Database
npm run db:push             # sync schema   (or: npm run db:migrate)
npm run db:seed             # seed Marketing (Tagged only) + Roadmap (All rows)

# 4. Run
npm run dev                 # http://localhost:3000
npm test                    # run unit tests
```

Sign in with the `ADMIN_EMAIL` Google account → you're admin. Invite others from
**People**; they sign in, land on `pending`, you approve.

Google OAuth redirect URI for local dev:
`http://localhost:3000/api/auth/callback/google`.

---

## Deployment (Vercel)

Pushing to `master` triggers a Vercel deploy. `postinstall` regenerates the
Prisma client during the build. Set all environment variables in the Vercel
project. After the first deploy, add the production callback to the Google OAuth
client:
`https://<your-domain>/api/auth/callback/google`.

### WhatsApp (Meta Cloud API)
In the Meta app's WhatsApp config, set the webhook callback to
`https://<your-domain>/api/whatsapp`, the **Verify token** to
`WHATSAPP_VERIFY_TOKEN`, and subscribe to the **messages** field. Set
`WHATSAPP_APP_SECRET` to validate signatures. Because the app is already public
HTTPS, no tunnel is needed.

**Message format — first word routes the task.** The first word is a
destination *alias* (set up under **Broods → WhatsApp** in the app): a brood
nickname drops the task into that brood; a member shortcut puts it on that
member's board (and notifies them). The rest of the message is the task.

- `mkt fix the landing page` → new task "fix the landing page" in **Marketing**
- `sara call the client` → task on **Sara's** board, she's notified
- extra `@mentions` after the first word tag more people:
  `mkt fix logo @jon`

The sender is matched to a member by the **phone number** an admin stores on
**Broods → People**; that becomes the task's creator. If the first word matches
nothing, the task lands on the sender's own board. Aliases fall back to brood
names and member names/nicknames when no explicit alias is defined. See
**Broods → WhatsApp → Recent activity** for what came in.

**Query your tasks:** text **`x`** (or `tasks` / `list` / `?`) and the bot
replies with your pending tasks grouped by brood + Personal. This reply needs
outbound enabled: set `WHATSAPP_TOKEN` (a system-user/permanent access token)
and `WHATSAPP_PHONE_NUMBER_ID` (the business number ID) from Meta. Replies to a
message you sent within the last 24h need no template. Without these vars the
bot stays ingest-only (no reply).

**Task notifications (push):** when a task is created, handed off, or tagged,
everyone linked to it (plus the actor) gets a WhatsApp message — if they have a
phone on file. Because this is business-initiated, it uses a **Meta-approved
template**, not free-form text. Setup:

1. Meta Business Manager → **WhatsApp Manager → Message Templates → Create**;
   category **Utility**; pick a name and language.
2. Body: `{{1}} linked you to a task in {{2}}: {{3}}` (actor, brood, task text);
   add a static **URL button** to the app.
3. Once **Approved**, set `WHATSAPP_TASK_TEMPLATE` (the template name) and
   `WHATSAPP_TEMPLATE_LANG` (its language code, e.g. `en_US` or `he`).

Unset ⇒ no push is sent (safe no-op). Outbound sends are logged under
**Broods → WhatsApp → Recent activity** (`direction: outbound`).
