import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  isAdmin as isAdminUser,
  getBroodAccessConfig,
} from "@/lib/access";
import { AdminSections } from "@/components/admin/admin-sections";
import type { UserOpt } from "@/components/admin/brood-access-panel";

export default async function BroodsAdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isAdminUser(me)) redirect("/");

  const [tabs, users, accessConfig, aliases, logs] = await Promise.all([
    prisma.tab.findMany({
      where: { ownerId: null, archivedAt: null },
      orderBy: { order: "asc" },
      include: { fields: { orderBy: { order: "asc" } } },
    }),
    prisma.user.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        nickname: true,
        phone: true,
        email: true,
        image: true,
        role: true,
        status: true,
        _count: { select: { accounts: true } },
      },
    }),
    getBroodAccessConfig(),
    prisma.whatsAppAlias.findMany({
      orderBy: { keyword: "asc" },
      include: {
        brood: { select: { name: true } },
        user: { select: { name: true, nickname: true, email: true } },
      },
    }),
    prisma.whatsAppLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);

  const broods = tabs.map((t) => ({
    id: t.id,
    name: t.name,
    fields: t.fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      options: (f.options as string[] | null) ?? [],
    })),
  }));

  const userRows = users.map((u) => ({
    id: u.id,
    name: u.name,
    nickname: u.nickname,
    phone: u.phone,
    email: u.email,
    image: u.image,
    role: u.role,
    status: u.status,
    joined: u._count.accounts > 0,
  }));

  const waAliases = aliases.map((a) => ({
    id: a.id,
    keyword: a.keyword,
    kind: (a.broodId ? "brood" : "member") as "brood" | "member",
    target: a.brood
      ? a.brood.name
      : a.user
        ? (a.user.nickname ?? a.user.name ?? a.user.email ?? "Unknown")
        : "—",
  }));

  const waLogs = logs.map((l) => {
    const raw = (l.rawPayload ?? {}) as { text?: string };
    const parsed = (l.parsed ?? {}) as { placement?: string };
    return {
      id: l.id,
      text: raw.text ?? "",
      status: l.status,
      error: l.error,
      placement: parsed.placement ?? null,
      at: l.createdAt,
    };
  });

  const accessUsers: UserOpt[] = users
    .filter((u) => u.status === "approved")
    .map((u) => ({
      id: u.id,
      label: u.nickname ?? u.name ?? u.email ?? "Unknown",
    }));

  const accessBroods = accessConfig.map((b) => ({
    ...b,
    fields: b.fields.filter((f) => f.type !== "person"),
  }));

  const pending = users.filter((u) => u.status === "pending").length;

  return (
    <div className="animate-rise">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          Admin
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Broods
        </h1>
        <p className="mt-1 text-sm text-muted">
          Manage broods and columns, people, and who can access each column.
          {pending > 0 && (
            <span className="ml-2 rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">
              {pending} awaiting approval
            </span>
          )}
        </p>
      </header>

      <AdminSections
        broods={broods}
        users={userRows}
        currentUserId={me.id}
        accessBroods={accessBroods}
        accessUsers={accessUsers}
        waAliases={waAliases}
        waLogs={waLogs}
      />
    </div>
  );
}
