import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/access";
import { UsersTable } from "@/components/admin/users-table";
import { InviteForm } from "@/components/admin/invite-form";

export default async function UsersPage() {
  const me = await getCurrentUser();
  const [users, tabs] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        status: true,
        createdAt: true,
        _count: { select: { accounts: true } },
        memberships: { select: { tabId: true } },
        fieldPermissions: { select: { fieldId: true } },
      },
    }),
    prisma.tab.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        fields: {
          orderBy: { order: "asc" },
          select: { id: true, key: true, label: true },
        },
      },
    }),
  ]);

  const pending = users.filter((u) => u.status === "pending");

  return (
    <div className="animate-rise">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          Admin
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          People
        </h1>
        <p className="mt-1 text-sm text-muted">
          Invite people, approve who gets in, set roles, remove access.
          {pending.length > 0 && (
            <span className="ml-2 rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">
              {pending.length} awaiting approval
            </span>
          )}
        </p>
      </header>

      <InviteForm tabs={tabs} />

      <UsersTable
        users={users.map((u) => ({
          ...u,
          joined: u._count.accounts > 0,
          tabIds: u.memberships.map((m) => m.tabId),
          fieldIds: u.fieldPermissions.map((p) => p.fieldId),
        }))}
        currentUserId={me?.id ?? ""}
        tabs={tabs}
      />
    </div>
  );
}
