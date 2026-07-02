# WhatsApp Task Notifications — Design

**Date:** 2026-07-02
**Status:** Approved (pending spec review)

## Problem

When a task is created (or someone is linked to it via handoff/tag), the app
creates an in-app `Notification` (the bell). There is no push to the person's
phone. We want a WhatsApp message sent to everyone linked to a task whenever
that linkage happens, so people hear about tasks without opening the app.

## Hard constraint (drives the whole design)

WhatsApp blocks **business-initiated** messages unless the recipient messaged
the business number within the last 24h **or** the message uses a
Meta-**approved template**. A "new task" push is business-initiated and must
therefore use an approved **template** message (`type: "template"`). The existing
`sendWhatsApp()` sends `type: "text"`, which only works inside the 24h window —
insufficient. We add template sending.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Delivery | **Approved Meta template** (Utility category). Reliable, any time. |
| Recipients | **Every linked person PLUS the actor**, always. (= the in-app recipient set, but *without* excluding self, and with the actor unioned in.) |
| Triggers | **All four linkage events** that already create an in-app notification: task created (web + WhatsApp inbound), handoff (`moveTask`), tag (`tagTask`). |
| Template body | `{{1}} linked you to a task in {{2}}: {{3}}` → actor name, brood name (fallback `—`), task text. |
| Button | Static **URL button** → the app root. |
| Language | Fully **env-driven** (`WHATSAPP_TEMPLATE_LANG`), no hardcoded default. |
| Recipients without a phone | Silently skipped. |
| Send failure | Logged, never throws — task creation always succeeds. |

## Architecture

Three pieces, isolated:

1. **`sendWhatsAppTemplate(to, params)`** — new export in `src/lib/whatsapp.ts`,
   next to `sendWhatsApp`. Builds and POSTs a `type: "template"` message. No-ops
   (returns `false`) when any of `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_TASK_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG` is unset.
2. **`buildTemplatePayload(...)`** — pure function (unit-tested) that returns the
   exact JSON body sent to the Graph API. Keeps the network wrapper thin.
3. **`notifyTaskLinked(recipientUserIds, ctx)`** — new module
   `src/lib/task-notify.ts`. Resolves phones, sends the template to each, logs
   each outbound. Called from the four trigger sites via Next 16 `after()` so it
   runs after the response and never blocks or fails the mutation.

### Pure payload builder — `src/lib/whatsapp.ts`

```ts
/** Graph API body for a template message with a text body + one static URL button. */
export function buildTemplatePayload(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[],
): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: "body",
          parameters: bodyParams.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };
}
```

Note: a **static** URL button (fixed URL, no per-message variable) needs NO
`button` component in the send payload — the URL is baked into the approved
template. So the payload only carries body parameters. (Only a *dynamic* URL
button would need a components entry.) This keeps the builder simple and is
covered by a unit test asserting the exact shape.

### Sender wrapper — `src/lib/whatsapp.ts`

```ts
/** Send an approved template message. No-op (false) unless fully configured. */
export async function sendWhatsAppTemplate(
  to: string,
  bodyParams: string[],
): Promise<boolean> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const template = process.env.WHATSAPP_TASK_TEMPLATE;
  const lang = process.env.WHATSAPP_TEMPLATE_LANG;
  if (!token || !phoneId || !template || !lang || !to) return false;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildTemplatePayload(to, template, lang, bodyParams),
        ),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}
```

### Notification helper — `src/lib/task-notify.ts` (new)

```ts
import { prisma } from "@/lib/prisma";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

export type TaskLinkContext = {
  actorName: string;
  broodName: string | null;
  taskText: string;
  taskId: string;
};

/**
 * WhatsApp-notify each linked user about a task. Resolves phones (skips users
 * without one), sends the approved template, logs each outbound. Never throws.
 * Call inside Next's `after()` so it runs post-response.
 */
export async function notifyTaskLinked(
  recipientUserIds: string[],
  ctx: TaskLinkContext,
): Promise<void> {
  const ids = [...new Set(recipientUserIds)];
  if (ids.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, phone: { not: null } },
    select: { phone: true },
  });
  const brood = ctx.broodName && ctx.broodName.trim() ? ctx.broodName : "—";
  const body = [ctx.actorName, brood, ctx.taskText.slice(0, 300)];
  for (const u of users) {
    const ok = await sendWhatsAppTemplate(u.phone as string, body);
    try {
      await prisma.whatsAppLog.create({
        data: {
          rawPayload: { to: u.phone, body } as object,
          parsed: {
            direction: "outbound",
            taskId: ctx.taskId,
            to: u.phone,
          } as object,
          status: ok ? "ok" : "error",
          error: ok ? null : "send failed",
        },
      });
    } catch {
      /* logging must never break the caller */
    }
  }
}
```

Reuses `WhatsAppLog` (Json `rawPayload`/`parsed`) — **no schema change**.

### Trigger wiring

At each site, alongside the existing in-app `Notification` write, compute the
**full linked set including the actor**, resolve the brood name, and schedule the
send with `after()`. Import: `import { after } from "next/server";`.

| Site | File:approx line | Recipient set (incl. actor) |
|---|---|---|
| `createTask` | `src/app/(app)/actions.ts:~99` | `validTagged ∪ { creatorId }` |
| `moveTask` (handoff) | `actions.ts:~217` | `{ targetUserId, actorId }` |
| `tagTask` | `actions.ts:~327` | `newlyTaggedIds ∪ { actorId }` |
| `ingestParsedMessage` (WhatsApp) | `src/lib/whatsapp.ts:~229` | `notifyMemberId ∪ assignees ∪ { senderId }` |

Each site already has `actorName` (or the user record) and the task. `broodName`
comes from the tab: where a `tabId` exists, `prisma.tab.findUnique({ where:{id}, select:{name:true} })`; for `EVERYONE`/`PRIVATE` (no tab) pass `null`
(helper renders `—`). `taskText` = the description value already computed at each
site.

Example (inside `createTask`, after the task + in-app notifications):

```ts
const recipients = [...validTagged, user.id];
const broodName = tabId
  ? (await prisma.tab.findUnique({
      where: { id: tabId },
      select: { name: true },
    }))?.name ?? null
  : null;
after(() =>
  notifyTaskLinked(recipients, {
    actorName,
    broodName,
    taskText: text,
    taskId: task.id,
  }),
);
```

(For the WhatsApp inbound path in `whatsapp.ts`, which runs in a route handler,
`after()` is likewise available; if any site is not in a request scope, fall back
to a fire-and-forget `void notifyTaskLinked(...).catch(() => {})`.)

## Configuration

New env vars (add to `.env.example` with comments):

```
# WhatsApp task-notification template (Meta-approved, Utility category)
WHATSAPP_TASK_TEMPLATE=      # e.g. task_linked
WHATSAPP_TEMPLATE_LANG=      # e.g. en_US or he — must match the approved template
```

Unset ⇒ template sending no-ops (dev-safe, same as the existing WhatsApp vars).

## Manual steps (operator, one-time)

1. Meta Business Manager → **WhatsApp Manager → Message Templates → Create**.
2. Category **Utility**, a name (e.g. `task_linked`), language (e.g. `en_US`).
3. Body: `{{1}} linked you to a task in {{2}}: {{3}}` — provide sample values for
   the three variables when prompted.
4. Add a **Button → Visit website (static URL)** → `https://synapse-iota-lac.vercel.app`.
5. Submit; wait for status **Approved**.
6. In Vercel project env: set `WHATSAPP_TASK_TEMPLATE` = the template name and
   `WHATSAPP_TEMPLATE_LANG` = the language code. Redeploy.
7. Ensure each person who should receive pushes has a phone set on the People
   page (admin, digits-only — already supported).

## Error handling / edges

- **Not configured** (missing env/template): `sendWhatsAppTemplate` returns false;
  `notifyTaskLinked` still logs `status:"error"`. No exceptions.
- **No phone on file**: user filtered out of the send (query `phone: { not: null }`).
- **Empty recipient set**: helper returns immediately.
- **Duplicate ids** across linked + actor: de-duped via `Set`.
- **Send/log failure**: caught; the task mutation already committed and is
  unaffected (runs in `after()`).
- **Long task text**: truncated to 300 chars for the template variable.

## Testing

- **Unit (vitest, `src/lib/whatsapp.test.ts` idiom):** `buildTemplatePayload` —
  asserts exact JSON: `type:"template"`, template name, `language.code`, and body
  `parameters` mapping `["a","b","c"] → [{type:"text",text:"a"}, ...]`.
- **Not unit-tested** (no harness): the `fetch` network call, `after()`
  scheduling, and Prisma writes — verified manually.
- **Manual:** with env set to a test template + a test phone, create a web task
  tagging a user with a phone → confirm WhatsApp template arrives; create one via
  WhatsApp inbound → confirm; verify a user without a phone is skipped and an
  outbound `WhatsAppLog` row appears under Admin → WhatsApp.

## Files touched

| File | Change |
|---|---|
| `src/lib/whatsapp.ts` | Add `buildTemplatePayload` + `sendWhatsAppTemplate`. |
| `src/lib/whatsapp.test.ts` | Add `buildTemplatePayload` tests. |
| `src/lib/task-notify.ts` | **New.** `notifyTaskLinked` helper + `TaskLinkContext`. |
| `src/app/(app)/actions.ts` | Call helper via `after()` in `createTask`, `moveTask`, `tagTask`; resolve brood name. |
| `src/lib/whatsapp.ts` (ingest) | Call helper in `ingestParsedMessage`. |
| `.env.example` | Document the two new vars. |

## Out of scope

- Deep-linking the button to the specific task (button opens app root).
- Per-user WhatsApp opt-out toggle (all users with a phone receive pushes).
- Text/24h-window fallback (template only).
- Delivery-status callbacks / read receipts.
- Batching/rate-limit handling beyond sequential sends (recipient counts are small).
