import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getMyTaskSections, type SessionUser } from "@/lib/access";
import { defaultDeadlines } from "@/lib/alerts";
import {
  normalizePhone,
  parseMessage,
  type ParsedMessage,
} from "./whatsapp-parse";

export { normalizePhone, parseMessage };
export type { ParsedMessage };

/** Verify Meta's X-Hub-Signature-256 over the raw request body. */
export function verifySignature(rawBody: string, signature: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // dev: allow when no secret configured
  if (!signature) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}

/** Extract { from, text } pairs from a Meta webhook payload. */
export function extractMessages(payload: unknown): { from: string; text: string }[] {
  const out: { from: string; text: string }[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as Array<{ changes?: unknown[] }>) {
    for (const change of entry.changes ?? []) {
      const value = (change as { value?: { messages?: unknown[] } }).value;
      for (const msg of value?.messages ?? []) {
        const m = msg as { from?: string; text?: { body?: string } };
        const body = m.text?.body;
        if (body) out.push({ from: m.from ?? "", text: body });
      }
    }
  }
  return out;
}

/** Resolve a brood by name (case-insensitive, non-archived). */
export async function resolveTab(name: string) {
  return prisma.tab.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, archivedAt: null },
  });
}

/**
 * Resolve a person token to an approved user by an EXACT match: nickname, full
 * name, or email local-part. Exact (not fuzzy) matching is important so an
 * ordinary first word doesn't accidentally route a task to a member — untagged
 * messages should fall through to the sender's own board.
 */
export async function resolvePerson(token: string) {
  const t = token.trim();
  if (!t) return null;
  return prisma.user.findFirst({
    where: {
      status: "approved",
      OR: [
        { nickname: { equals: t, mode: "insensitive" } },
        { name: { equals: t, mode: "insensitive" } },
        { email: { startsWith: `${t.toLowerCase()}@` } },
      ],
    },
    select: { id: true, name: true, nickname: true, email: true },
  });
}

type Target =
  | { kind: "brood"; tabId: string; name: string }
  | { kind: "member"; userId: string; name: string };

const label = (u: {
  name: string | null;
  nickname: string | null;
  email: string | null;
}) => u.nickname ?? u.name ?? u.email ?? "Unknown";

/**
 * Resolve a token to a destination: an admin-defined alias first, then a brood
 * name, then a member. Returns null if nothing matches.
 */
export async function resolveTarget(token: string): Promise<Target | null> {
  const key = token.trim().toLowerCase();
  if (!key) return null;

  const alias = await prisma.whatsAppAlias.findUnique({
    where: { keyword: key },
  });
  if (alias?.broodId) {
    const t = await prisma.tab.findFirst({
      where: { id: alias.broodId, archivedAt: null },
      select: { id: true, name: true },
    });
    if (t) return { kind: "brood", tabId: t.id, name: t.name };
  }
  if (alias?.userId) {
    const u = await prisma.user.findFirst({
      where: { id: alias.userId, status: "approved" },
      select: { id: true, name: true, nickname: true, email: true },
    });
    if (u) return { kind: "member", userId: u.id, name: label(u) };
  }

  const tab = await resolveTab(token);
  if (tab) return { kind: "brood", tabId: tab.id, name: tab.name };

  const person = await resolvePerson(token);
  if (person) return { kind: "member", userId: person.id, name: label(person) };

  return null;
}

export type IngestResult =
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

/**
 * Create a task from a parsed message. The first token routes it (brood →
 * BROOD task; member → PRIVATE task on their board + notify). Unrecognized first
 * token falls back to the sender's personal board. Extra @mentions are tagged.
 */
export async function ingestParsedMessage(
  parsed: ParsedMessage,
  fromPhone?: string | null,
): Promise<IngestResult> {
  const sender = fromPhone
    ? await prisma.user.findFirst({
        where: { phone: normalizePhone(fromPhone), status: "approved" },
        select: { id: true, name: true, nickname: true, email: true },
      })
    : null;

  if (!parsed.firstToken && !parsed.fullText) {
    return { ok: false, error: "Empty message" };
  }

  const target = parsed.firstToken
    ? await resolveTarget(parsed.firstToken)
    : null;

  let tabId: string | null = null;
  let scope: "BROOD" | "EVERYONE" | "PRIVATE" = "PRIVATE";
  let createdById: string | null = sender?.id ?? null;
  let notifyMemberId: string | null = null;
  let placement: string;
  let description: string;

  if (target?.kind === "brood") {
    tabId = target.tabId;
    scope = "BROOD";
    placement = target.name;
    description = parsed.description;
  } else if (target?.kind === "member") {
    scope = "PRIVATE";
    createdById = target.userId; // lands on their board
    notifyMemberId = target.userId;
    placement = target.name;
    description = parsed.description;
  } else {
    // First token isn't a destination → keep it as text, place on sender's board.
    if (!sender) {
      return {
        ok: false,
        error: "Unrecognized destination and unknown sender phone",
      };
    }
    scope = "PRIVATE";
    createdById = sender.id;
    placement = "My Tasks";
    description = parsed.fullText;
  }

  // Description column key for the brood (else "description").
  let descKey = "description";
  if (tabId) {
    const f = await prisma.fieldDef.findFirst({
      where: { tabId, OR: [{ key: "description" }, { type: "text" }] },
      orderBy: { order: "asc" },
      select: { key: true },
    });
    descKey = f?.key ?? "description";
  }

  // Resolve extra @mentions to member ids.
  const extraIds = new Set<string>();
  for (const m of parsed.extraMentions) {
    const r = await resolveTarget(m);
    if (r?.kind === "member") extraIds.add(r.userId);
  }
  const assigneeIds = [...extraIds];

  const last = await prisma.task.findFirst({
    where: tabId ? { tabId } : { scope, tabId: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const task = await prisma.task.create({
    data: {
      tabId,
      scope,
      createdById,
      source: "whatsapp",
      position: (last?.position ?? 0) + 1,
      values: { [descKey]: description, done: false } as Prisma.InputJsonObject,
      assignees: { create: assigneeIds.map((userId) => ({ userId })) },
      ...defaultDeadlines(),
    },
  });

  // Notify the placement member + any tagged extras (except the sender).
  const actorName = sender ? label(sender) : "WhatsApp";
  const notify = new Set<string>();
  if (notifyMemberId) notify.add(notifyMemberId);
  for (const id of assigneeIds) notify.add(id);
  if (sender) notify.delete(sender.id);
  if (notify.size) {
    await prisma.notification.createMany({
      data: [...notify].map((userId) => ({
        userId,
        actorName,
        taskId: task.id,
        message: `${actorName} via WhatsApp: "${description.slice(0, 80)}"`,
      })),
    });
  }

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
}

/* ---------------- Outbound: query pending tasks ---------------- */

const QUERY_WORDS = new Set(["x", "tasks", "list", "?"]);

function describe(values: Record<string, unknown>): string {
  if (typeof values.description === "string" && values.description)
    return values.description;
  const firstStr = Object.values(values).find(
    (v) => typeof v === "string" && v,
  );
  return (firstStr as string) ?? "—";
}

/**
 * If the message is a query command (e.g. "x"), build the reply text: the
 * sender's pending tasks grouped by brood + personal. Returns null if it isn't
 * a query (so the message should be ingested as a task instead).
 */
export async function handleQueryCommand(
  text: string,
  fromPhone: string,
): Promise<string | null> {
  if (!QUERY_WORDS.has(text.trim().toLowerCase())) return null;

  const sender = await prisma.user.findFirst({
    where: { phone: normalizePhone(fromPhone), status: "approved" },
    select: {
      id: true,
      name: true,
      nickname: true,
      email: true,
      role: true,
      status: true,
    },
  });
  if (!sender)
    return "Your number isn't linked to an account yet — ask an admin to add it.";

  const sections = await getMyTaskSections(sender as SessionUser);
  if (sections.length === 0) return "✅ No pending tasks — you're all caught up!";

  const blocks = sections.map((s) => {
    const lines = s.rows.map((r) => `• ${describe(r.values)}`).join("\n");
    return `*${s.tabName}*\n${lines}`;
  });
  return `📋 Your pending tasks\n\n${blocks.join("\n\n")}`;
}

/**
 * Send a WhatsApp text reply via the Cloud Send API. Returns false (no-op) when
 * outbound isn't configured (WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID).
 */
export async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId || !to) return false;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: body.slice(0, 4000) },
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** True only when all four env vars needed to send a template are present. */
export function whatsAppTemplateConfigured(): boolean {
  return !!(
    process.env.WHATSAPP_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_TASK_TEMPLATE &&
    process.env.WHATSAPP_TEMPLATE_LANG
  );
}

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

/**
 * Send an approved template message. Returns `{ ok: false, error }` (never
 * throws) when unconfigured or when Meta rejects it — the error carries Meta's
 * status + response body so failures are diagnosable from the WhatsApp log.
 */
export async function sendWhatsAppTemplate(
  to: string,
  bodyParams: string[],
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const template = process.env.WHATSAPP_TASK_TEMPLATE;
  const lang = process.env.WHATSAPP_TEMPLATE_LANG;
  if (!token || !phoneId || !template || !lang || !to)
    return { ok: false, error: "not configured" };
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
    if (res.ok) return { ok: true };
    const detail = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}: ${detail.slice(0, 600)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch error" };
  }
}
