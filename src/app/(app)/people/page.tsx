import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  isAdmin as isAdminUser,
  getBroodAccessConfig,
} from "@/lib/access";
import { UsersTable } from "@/components/admin/users-table";
import { InviteForm } from "@/components/admin/invite-form";
import {
  BroodAccessPanel,
  type UserOpt,
} from "@/components/admin/brood-access-panel";

export default async function PeoplePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  // People tab is admin-only.
  if (!isAdminUser(me)) redirect("/");

  const [users, broods] = await Promise.all([
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

  const pending = users.filter((u) => u.status === "pending");

  const approvedUsers: UserOpt[] = users
    .filter((u) => u.status === "approved")
    .map((u) => ({
      id: u.id,
      label: u.nickname ?? u.name ?? u.email ?? "Unknown",
    }));

  // Legacy person columns aren't part of the access model.
  const accessBroods = broods.map((b) => ({
    ...b,
    fields: b.fields.filter((f) => f.type !== "person"),
  }));

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
          Invite people, approve who gets in, set roles, and grant brood/column
          access.
          {pending.length > 0 && (
            <span className="ml-2 rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">
              {pending.length} awaiting approval
            </span>
          )}
        </p>
      </header>

      <InviteForm />

      <UsersTable
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          nickname: u.nickname,
          email: u.email,
          image: u.image,
          role: u.role,
          status: u.status,
          joined: u._count.accounts > 0,
        }))}
        currentUserId={me.id}
        isAdmin
      />

      <BroodAccessPanel broods={accessBroods} users={approvedUsers} />
    </div>
  );
}
