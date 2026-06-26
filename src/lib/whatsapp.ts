import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
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

/** Resolve a person token to an approved user (name / nickname / email-prefix). */
export async function resolvePerson(token: string) {
  return prisma.user.findFirst({
    where: {
      status: "approved",
      OR: [
        { name: { contains: token, mode: "insensitive" } },
        { nickname: { contains: token, mode: "insensitive" } },
        { email: { startsWith: token, mode: "insensitive" } },
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
  | { ok: true; taskId: string; tabId: string | null; placement: string }
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

  return { ok: true, taskId: task.id, tabId, placement };
}
