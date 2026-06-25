import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin as isAdminUser } from "@/lib/access";
import { UsersTable } from "@/components/admin/users-table";
import { InviteForm } from "@/components/admin/invite-form";
import { GroupsPanel, type GroupView } from "@/components/groups/groups-panel";

export default async function PeoplePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const admin = isAdminUser(me);

  const [users, tabs, groups] = await Promise.all([
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
        createdAt: true,
        _count: { select: { accounts: true } },
        memberships: { select: { tabId: true } },
        fieldPermissions: { select: { fieldId: true } },
        groupMemberships: {
          select: { group: { select: { id: true, name: true } } },
        },
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
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        createdById: true,
        createdBy: { select: { name: true, email: true } },
        members: { select: { userId: true } },
      },
    }),
  ]);

  const pending = users.filter((u) => u.status === "pending");

  const groupsByUser: Record<string, { id: string; name: string }[]> = {};
  for (const u of users) {
    groupsByUser[u.id] = u.groupMemberships.map((m) => m.group);
  }

  const groupViews: GroupView[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    createdById: g.createdById,
    creatorLabel: g.createdBy?.name ?? g.createdBy?.email ?? "someone",
    memberIds: g.members.map((m) => m.userId),
  }));

  return (
    <div className="animate-rise">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          {admin ? "Admin" : "Team"}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          People
        </h1>
        <p className="mt-1 text-sm text-muted">
          {admin
            ? "Invite people, approve who gets in, set roles, manage groups."
            : "Everyone on the team, and the groups you can tag."}
          {admin && pending.length > 0 && (
            <span className="ml-2 rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">
              {pending.length} awaiting approval
            </span>
          )}
        </p>
      </header>

      {admin && <InviteForm tabs={tabs} />}

      <UsersTable
        users={users.map((u) => ({
          ...u,
          joined: u._count.accounts > 0,
          tabIds: u.memberships.map((m) => m.tabId),
          fieldIds: u.fieldPermissions.map((p) => p.fieldId),
        }))}
        currentUserId={me.id}
        tabs={tabs}
        isAdmin={admin}
        groupsByUser={groupsByUser}
      />

      <GroupsPanel
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          nickname: u.nickname,
          email: u.email,
          image: u.image,
        }))}
        groups={groupViews}
        currentUserId={me.id}
        isAdmin={admin}
      />
    </div>
  );
}
