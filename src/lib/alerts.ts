import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const HOUR = 3_600_000;
const LEAD_HOURS = Number(process.env.DEFAULT_ALERT_LEAD_HOURS ?? "4");
const APP_URL = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "";

/**
 * Default deadline + reminder for a new task: due in 24h ("within a day"),
 * remind a few hours before (configurable via DEFAULT_ALERT_LEAD_HOURS).
 */
export function defaultDeadlines(now: Date = new Date()) {
  const dueAt = new Date(now.getTime() + 24 * HOUR);
  const alertAt = new Date(dueAt.getTime() - LEAD_HOURS * HOUR);
  return { dueAt, alertAt };
}

function isDone(values: unknown): boolean {
  return (values as Record<string, unknown>)?.["done"] === true;
}

function describe(values: unknown): string {
  const v = (values as Record<string, unknown>) ?? {};
  if (typeof v.description === "string" && v.description) return v.description;
  const s = Object.values(v).find((x) => typeof x === "string" && x);
  return (s as string) ?? "a task";
}

function emailHtml(opts: {
  title: string;
  where: string;
  kind: "soon" | "overdue";
  dueAt: Date;
}) {
  const head =
    opts.kind === "overdue"
      ? "A task is overdue"
      : "A task is due soon";
  const due = opts.dueAt.toLocaleString("en", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const link = APP_URL
    ? `<p><a href="${APP_URL}">Open Synapse</a></p>`
    : "";
  return `
    <div style="font-family:system-ui,sans-serif;line-height:1.5">
      <h2 style="margin:0 0 8px">${head}</h2>
      <p style="margin:0 0 4px"><strong>${escapeHtml(opts.title)}</strong></p>
      <p style="margin:0;color:#555">In ${escapeHtml(opts.where)} · ${
        opts.kind === "overdue" ? "was due" : "due"
      } ${due}</p>
      ${link}
    </div>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Cron worker: send the due-soon reminder and the overdue notice for tasks that
 * aren't done — each once. Returns counts. Flags are set even when there are no
 * recipients, so a task is never re-scanned forever.
 */
export async function processAlerts(now: Date = new Date()) {
  const tasks = await prisma.task.findMany({
    where: {
      dueAt: { not: null },
      OR: [
        { dueSoonAlertedAt: null, alertAt: { lte: now }, dueAt: { gt: now } },
        { overdueAlertedAt: null, dueAt: { lte: now } },
      ],
    },
    include: {
      tab: { select: { name: true } },
      creator: { select: { email: true } },
      assignees: { include: { user: { select: { email: true } } } },
    },
  });

  let soon = 0;
  let overdue = 0;
  for (const t of tasks) {
    if (isDone(t.values) || !t.dueAt) continue;
    const to = [
      t.creator?.email ?? null,
      ...t.assignees.map((a) => a.user.email),
    ].filter((e): e is string => !!e);
    const title = describe(t.values);
    const where = t.tab
      ? t.tab.name
      : t.scope === "EVERYONE"
        ? "All Tasks"
        : "My Tasks";

    if (!t.overdueAlertedAt && t.dueAt <= now) {
      if (to.length)
        await sendEmail(
          to,
          `Overdue: ${title}`,
          emailHtml({ title, where, kind: "overdue", dueAt: t.dueAt }),
        );
      await prisma.task.update({
        where: { id: t.id },
        data: { overdueAlertedAt: now },
      });
      overdue++;
    } else if (
      !t.dueSoonAlertedAt &&
      t.alertAt &&
      t.alertAt <= now &&
      t.dueAt > now
    ) {
      if (to.length)
        await sendEmail(
          to,
          `Due soon: ${title}`,
          emailHtml({ title, where, kind: "soon", dueAt: t.dueAt }),
        );
      await prisma.task.update({
        where: { id: t.id },
        data: { dueSoonAlertedAt: now },
      });
      soon++;
    }
  }
  return { scanned: tasks.length, soon, overdue };
}
