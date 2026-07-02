# WhatsApp Task Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send an approved-template WhatsApp message to everyone linked to a task (plus the actor) whenever a task is created, handed off, or tagged.

**Architecture:** A pure payload builder + a `sendWhatsAppTemplate` wrapper in `whatsapp.ts`; a `notifyTaskLinked` helper in a new `task-notify.ts` that resolves phones and sends the template, logging each send. The four trigger sites schedule the send via Next's `after()` so it never blocks or fails the mutation. The WhatsApp-inbound path returns its recipient set from `ingestParsedMessage` and the route handler fires the notification (avoiding a `whatsapp.ts ↔ task-notify.ts` import cycle).

**Tech Stack:** Next.js 16 (`after` from `next/server`), Prisma 6, WhatsApp Cloud API (Graph v21.0), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-02-whatsapp-task-notifications-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/whatsapp.ts` | Add pure `buildTemplatePayload` + `sendWhatsAppTemplate`; extend `ingestParsedMessage` to return its WhatsApp recipient set. |
| `src/lib/whatsapp.test.ts` | Unit tests for `buildTemplatePayload`. |
| `src/lib/task-notify.ts` | **New.** `notifyTaskLinked(recipientUserIds, ctx)` — resolve phones, send template, log. |
| `src/app/(app)/actions.ts` | Fire `notifyTaskLinked` via `after()` in `createTask`, `moveTask`, `tagTask`. |
| `src/app/api/whatsapp/route.ts` | Fire `notifyTaskLinked` via `after()` for the inbound path using the ingest result. |
| `.env.example` | Document `WHATSAPP_TASK_TEMPLATE` + `WHATSAPP_TEMPLATE_LANG`. |

---

## Task 1: Template sender + pure payload builder (TDD)

**Files:**
- Modify: `src/lib/whatsapp.ts` (add after the existing `sendWhatsApp`, ~line 319)
- Test: `src/lib/whatsapp.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/whatsapp.test.ts` (keep existing imports/tests; add `buildTemplatePayload` to the import from `./whatsapp` and append this block):

```ts
describe("buildTemplatePayload", () => {
  it("builds a template message with body text parameters", () => {
    expect(
      buildTemplatePayload("15551234567", "task_linked", "en_US", [
        "Dana",
        "Marketing",
        "Buy milk",
      ]),
    ).toEqual({
      messaging_product: "whatsapp",
      to: "15551234567",
      type: "template",
      template: {
        name: "task_linked",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Dana" },
              { type: "text", text: "Marketing" },
              { type: "text", text: "Buy milk" },
            ],
          },
        ],
      },
    });
  });

  it("handles an empty parameter list (no body params)", () => {
    const payload = buildTemplatePayload("15550000000", "t", "he", []);
    expect(
      (payload.template as { components: { parameters: unknown[] }[] })
        .components[0].parameters,
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- whatsapp`
Expected: FAIL — `buildTemplatePayload is not exported` / not a function.

- [ ] **Step 3: Implement the builder + sender**

In `src/lib/whatsapp.ts`, immediately after the existing `sendWhatsApp` function (which ends around line 319), add:

```ts
/** Graph API body for a template message with a text body (static button, if any,
 * is baked into the approved template so it needs no send-time component). */
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- whatsapp`
Expected: PASS — both `buildTemplatePayload` tests green (plus the existing whatsapp tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp.ts src/lib/whatsapp.test.ts
git commit -m "feat: WhatsApp template sender + pure payload builder"
```

---

## Task 2: `notifyTaskLinked` helper

**Files:**
- Create: `src/lib/task-notify.ts`

No unit test (it does Prisma + network I/O — verified via typecheck + manual). Verify with `npx tsc --noEmit`.

- [ ] **Step 1: Create the helper**

Create `src/lib/task-notify.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

export type TaskLinkContext = {
  actorName: string;
  tabId: string | null;
  taskText: string;
  taskId: string;
};

/**
 * WhatsApp-notify each linked user about a task. Resolves phones (skips users
 * without one), resolves the brood name, sends the approved template, and logs
 * each outbound to WhatsAppLog. Never throws — call inside `after()` so it runs
 * after the response and cannot break the mutation.
 */
export async function notifyTaskLinked(
  recipientUserIds: string[],
  ctx: TaskLinkContext,
): Promise<void> {
  const ids = [...new Set(recipientUserIds)];
  if (ids.length === 0) return;

  const [users, tab] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids }, phone: { not: null } },
      select: { phone: true },
    }),
    ctx.tabId
      ? prisma.tab.findUnique({
          where: { id: ctx.tabId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);
  if (users.length === 0) return;

  const brood = tab?.name?.trim() ? tab.name : "—";
  const body = [ctx.actorName, brood, ctx.taskText.slice(0, 300)];

  for (const u of users) {
    const to = u.phone as string;
    const ok = await sendWhatsAppTemplate(to, body);
    try {
      await prisma.whatsAppLog.create({
        data: {
          rawPayload: { to, body } as Prisma.InputJsonObject,
          parsed: {
            direction: "outbound",
            taskId: ctx.taskId,
            to,
          } as Prisma.InputJsonObject,
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors from `task-notify.ts`. (`sendWhatsAppTemplate` resolves from Task 1; `prisma.whatsAppLog`/`prisma.tab` exist.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/task-notify.ts
git commit -m "feat: notifyTaskLinked helper (resolve phones, send template, log)"
```

---

## Task 3: Wire the three web trigger sites

**Files:**
- Modify: `src/app/(app)/actions.ts` (imports; `createTask` ~line 108; `moveTask` ~lines 213-225; `tagTask` ~line 335)

- [ ] **Step 1: Add imports**

At the top of `src/app/(app)/actions.ts`, after the existing imports (the `defaultDeadlines` import on line 14), add:

```ts
import { after } from "next/server";
import { notifyTaskLinked } from "@/lib/task-notify";
```

- [ ] **Step 2: Wire `createTask`**

In `createTask`, the in-app notification block ends at line 107 (`}`), immediately before `refreshTaskSurfaces(tabId);`. Insert between them:

```ts
  after(() =>
    notifyTaskLinked([...validTagged, user.id], {
      actorName,
      tabId,
      taskText: text,
      taskId: task.id,
    }),
  );
```

(`actorName`, `validTagged`, `user`, `tabId`, `text`, `task` are all already in scope.)

- [ ] **Step 3: Wire `moveTask`**

Replace the existing person-handoff notification block (currently lines 213-225):

```ts
  if (notifyUserId && notifyUserId !== user.id) {
    const v = task.values as Record<string, unknown>;
    const text = typeof v.description === "string" ? v.description : "a task";
    const actorName = user.name ?? user.email ?? "Someone";
    await prisma.notification.create({
      data: {
        userId: notifyUserId,
        actorName,
        taskId,
        message: `${actorName} handed off to you: "${text.slice(0, 80)}"`,
      },
    });
  }
```

with:

```ts
  if (notifyUserId) {
    const v = task.values as Record<string, unknown>;
    const text = typeof v.description === "string" ? v.description : "a task";
    const actorName = user.name ?? user.email ?? "Someone";
    if (notifyUserId !== user.id) {
      await prisma.notification.create({
        data: {
          userId: notifyUserId,
          actorName,
          taskId,
          message: `${actorName} handed off to you: "${text.slice(0, 80)}"`,
        },
      });
    }
    after(() =>
      notifyTaskLinked([notifyUserId, user.id], {
        actorName,
        tabId: null, // person handoff makes the task PRIVATE (no brood)
        taskText: text,
        taskId,
      }),
    );
  }
```

- [ ] **Step 4: Wire `tagTask`**

In `tagTask`, the in-app notification block ends at line 335 (`}`), immediately before `refreshTaskSurfaces(task.tabId);`. Insert between them:

```ts
  after(() =>
    notifyTaskLinked([...toAdd, user.id], {
      actorName,
      tabId: task.tabId,
      taskText: text,
      taskId,
    }),
  );
```

(`toAdd`, `user`, `actorName`, `task`, `text`, `taskId` are all already in scope.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/actions.ts"
git commit -m "feat: WhatsApp-notify linked users on create/handoff/tag"
```

---

## Task 4: Wire the WhatsApp-inbound path

**Files:**
- Modify: `src/lib/whatsapp.ts` (`IngestResult` type ~lines 124-126; `ingestParsedMessage` return ~line 239)
- Modify: `src/app/api/whatsapp/route.ts` (imports; ingest success handling ~lines 75-86)

The inbound notification is fired from the route (not from `whatsapp.ts`) so `whatsapp.ts` never imports `task-notify.ts` — avoiding an import cycle (`task-notify.ts` imports `whatsapp.ts`).

- [ ] **Step 1: Extend the `IngestResult` success shape**

In `src/lib/whatsapp.ts`, the type is currently:

```ts
type IngestResult =
  | { ok: true; taskId: string; tabId: string | null; placement: string }
  | { ok: false; error: string };
```

Replace the `ok: true` branch so it also carries the recipients + message fields:

```ts
type IngestResult =
  | {
      ok: true;
      taskId: string;
      tabId: string | null;
      placement: string;
      recipientIds: string[];
      actorName: string;
      description: string;
    }
  | { ok: false; error: string };
```

- [ ] **Step 2: Return the recipient set from `ingestParsedMessage`**

The success `return` is currently (line ~239):

```ts
  return { ok: true, taskId: task.id, tabId, placement };
```

Replace it with (compute the WhatsApp recipient set = the in-app `notify` set plus the sender):

```ts
  const waRecipients = new Set<string>(notify);
  if (sender) waRecipients.add(sender.id);

  return {
    ok: true,
    taskId: task.id,
    tabId,
    placement,
    recipientIds: [...waRecipients],
    actorName,
    description,
  };
```

(`notify`, `sender`, `actorName`, `description`, `tabId`, `task` are all in scope from the surrounding function.)

- [ ] **Step 3: Import `after` + the helper in the route**

In `src/app/api/whatsapp/route.ts`, the first import is:

```ts
import { NextRequest, NextResponse } from "next/server";
```

Change it to add `after`, and add the helper import below the `@/lib/whatsapp` import block:

```ts
import { NextRequest, NextResponse, after } from "next/server";
```

and after the existing `} from "@/lib/whatsapp";` block add:

```ts
import { notifyTaskLinked } from "@/lib/task-notify";
```

- [ ] **Step 4: Fire the notification on a successful ingest**

In the route's ingest `try` block, the WhatsAppLog write ends around line 86 (`});`), before the `} catch (err) {`. Insert immediately after that log write, still inside the `try`:

```ts
      if (result.ok && result.recipientIds.length) {
        after(() =>
          notifyTaskLinked(result.recipientIds, {
            actorName: result.actorName,
            tabId: result.tabId,
            taskText: result.description,
            taskId: result.taskId,
          }),
        );
      }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors. (`result.recipientIds`/`actorName`/`description` are known because the success branch was widened in Step 1.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp.ts "src/app/api/whatsapp/route.ts"
git commit -m "feat: WhatsApp-notify linked users on inbound-created tasks"
```

---

## Task 5: Env docs + full verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document the new env vars**

Read `.env.example`. In the WhatsApp section (near `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`, ~lines 14-22), append:

```
# Task-notification template (Meta-approved, Utility category). Unset = no push.
WHATSAPP_TASK_TEMPLATE=      # approved template name, e.g. task_linked
WHATSAPP_TEMPLATE_LANG=      # its language code, e.g. en_US or he
```

- [ ] **Step 2: Run the unit tests**

Run: `npm run test`
Expected: PASS — `whatsapp` (incl. new `buildTemplatePayload`), `brood-access`, `permissions` suites all green.

- [ ] **Step 3: Production build (typecheck + bundle)**

Run: `npm run build`
Expected: Compiles successfully, no type errors. Confirms the `after` import and all wiring typecheck end-to-end.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs: document WhatsApp task-notification env vars"
```

- [ ] **Step 5: Operator manual steps (record, do out-of-band)**

These are done by the user in Meta + Vercel — list them in the completion summary; they are NOT code:

1. Meta Business Manager → WhatsApp Manager → Message Templates → **Create template**.
2. Category **Utility**; name e.g. `task_linked`; pick a language (e.g. `en_US` or `he`).
3. Body: `{{1}} linked you to a task in {{2}}: {{3}}` — supply sample values for the 3 variables.
4. Button → **Visit website (static URL)** → `https://synapse-iota-lac.vercel.app`.
5. Submit; wait for **Approved**.
6. Vercel → project env: `WHATSAPP_TASK_TEMPLATE` = template name, `WHATSAPP_TEMPLATE_LANG` = language code. Redeploy.
7. Ensure each recipient has a phone on the People page (admin, digits-only).

- [ ] **Step 6: Manual smoke test (after template approved + env set)**

- Web: create a task tagging a user who has a phone → that user receives the WhatsApp template; the creator (if they have a phone) also receives it.
- Handoff: use a person-column move → the target + actor receive it.
- WhatsApp inbound: message the bot to create a task routed to a member → member + sender receive it.
- Negative: a tagged user without a phone is silently skipped; an outbound row (`parsed.direction = "outbound"`) appears under Admin → Broods → WhatsApp → recent activity.

---

## Self-Review Notes

- **Spec coverage:** template sender (Task 1) ✓; `notifyTaskLinked` resolve-phone/brood/log (Task 2) ✓; four trigger sites — create/handoff/tag (Task 3) + WhatsApp inbound (Task 4) ✓; recipients = linked ∪ actor (Task 3 `[...tagged, user.id]`; Task 4 `notify ∪ sender`) ✓; brood-name fallback `—` (Task 2) ✓; env-driven, no-op when unset (Task 1 sender guard, Task 5 docs) ✓; WhatsAppLog outbound reuse, no schema change (Task 2) ✓; `after()` non-blocking (Tasks 3-4) ✓; unit test on pure builder (Task 1) ✓; manual Meta steps (Task 5) ✓.
- **Cycle avoidance:** `whatsapp.ts` does NOT import `task-notify.ts`; the inbound send is fired from `route.ts` using the widened `IngestResult`. Confirmed no `whatsapp ↔ task-notify` edge.
- **Type consistency:** `notifyTaskLinked(recipientUserIds: string[], ctx: TaskLinkContext)` and `TaskLinkContext = { actorName, tabId, taskText, taskId }` used identically at all call sites; `sendWhatsAppTemplate(to, bodyParams: string[])` matches `buildTemplatePayload` param order (actor, brood, taskText).
- **Deploy safety:** unset env ⇒ every send no-ops (returns false) and is logged `status:"error"`; no crash, task mutations unaffected.
