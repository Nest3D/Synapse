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

  const [tabs, users, accessConfig] = await Promise.all([
    prisma.tab.findMany({
      where: { ownerId: null },
      orderBy: { order: "asc" },
      include: { fields: { orderBy: { order: "asc" } } },
    }),
    prisma.user.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        nickname: true,
        email: true,
        image: true,
        role: true,
        status: true,
        _count: { select: { accounts: true } },
      },
    }),
    getBroodAccessConfig(),
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
    email: u.email,
    image: u.image,
    role: u.role,
    status: u.status,
    joined: u._count.accounts > 0,
  }));

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
      />
    </div>
  );
}
