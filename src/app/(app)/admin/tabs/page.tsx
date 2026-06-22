import { prisma } from "@/lib/prisma";
import { TabsManager } from "@/components/admin/tabs-manager";

export default async function TabsPage() {
  const [tabs, approvedUsers] = await Promise.all([
    prisma.tab.findMany({
      orderBy: { order: "asc" },
      include: {
        fields: { orderBy: { order: "asc" } },
        memberships: {
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { status: "approved" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, image: true },
    }),
  ]);

  const data = tabs.map((t) => ({
    id: t.id,
    name: t.name,
    visibilityMode: t.visibilityMode,
    fields: t.fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      options: (f.options as string[] | null) ?? [],
    })),
    members: t.memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name ?? m.user.email ?? "Unknown",
      image: m.user.image,
    })),
  }));

  const allUsers = approvedUsers.map((u) => ({
    id: u.id,
    name: u.name ?? u.email ?? "Unknown",
    image: u.image,
  }));

  return (
    <div className="animate-rise">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          Admin
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Tabs
        </h1>
        <p className="mt-1 text-sm text-muted">
          Project groups. Control who&apos;s in, what columns exist, and whether
          members see every row or only the ones they&apos;re tagged in.
        </p>
      </header>

      <TabsManager tabs={data} allUsers={allUsers} />
    </div>
  );
}
