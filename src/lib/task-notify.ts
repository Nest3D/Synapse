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
