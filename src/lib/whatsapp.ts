import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type ParsedMessage = {
  tabName: string | null;
  personTokens: string[];
  description: string;
};

/**
 * Parse inline tags from a WhatsApp message body.
 *   "#marketing @john Build the landing page"
 *   -> { tabName: "marketing", personTokens: ["john"], description: "Build the landing page" }
 */
export function parseMessage(text: string): ParsedMessage {
  const tabMatch = text.match(/#([\p{L}\p{N}_-]+)/u);
  const personTokens = [...text.matchAll(/@([\p{L}\p{N}_.-]+)/gu)].map(
    (m) => m[1],
  );
  const description = text
    .replace(/#[\p{L}\p{N}_-]+/gu, "")
    .replace(/@[\p{L}\p{N}_.-]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    tabName: tabMatch ? tabMatch[1] : null,
    personTokens,
    description,
  };
}

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

/** Extract plain-text message bodies from a Meta webhook payload. */
export function extractTextMessages(payload: unknown): string[] {
  const out: string[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as Array<{ changes?: unknown[] }>) {
    for (const change of entry.changes ?? []) {
      const value = (change as { value?: { messages?: unknown[] } }).value;
      for (const msg of value?.messages ?? []) {
        const body = (msg as { text?: { body?: string } }).text?.body;
        if (body) out.push(body);
      }
    }
  }
  return out;
}

/** Resolve a tab by name (case-insensitive). */
export async function resolveTab(name: string) {
  return prisma.tab.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      archivedAt: null,
    },
  });
}

/**
 * Resolve a person token to an approved user.
 * Matches name (case-insensitive contains) or email local-part.
 */
export async function resolvePerson(token: string) {
  return prisma.user.findFirst({
    where: {
      status: "approved",
      OR: [
        { name: { contains: token, mode: "insensitive" } },
        { email: { startsWith: token, mode: "insensitive" } },
      ],
    },
  });
}

/**
 * Turn a parsed message into a task in the resolved brood. Access is column-
 * scoped now, so messages are no longer assigned to specific people.
 */
export async function ingestParsedMessage(parsed: ParsedMessage) {
  if (!parsed.tabName) {
    return { ok: false as const, error: "No #brood tag in message" };
  }
  const tab = await resolveTab(parsed.tabName);
  if (!tab) {
    return { ok: false as const, error: `Unknown brood #${parsed.tabName}` };
  }

  // Determine the description field key.
  const fields = await prisma.fieldDef.findMany({ where: { tabId: tab.id } });
  const descKey =
    fields.find((f) => f.key === "description")?.key ??
    fields.find((f) => f.type === "text")?.key ??
    "description";

  const last = await prisma.task.findFirst({
    where: { tabId: tab.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const task = await prisma.task.create({
    data: {
      tabId: tab.id,
      position: (last?.position ?? 0) + 1,
      source: "whatsapp",
      values: { [descKey]: parsed.description } as Prisma.InputJsonObject,
    },
  });

  return { ok: true as const, taskId: task.id, tabId: tab.id };
}
