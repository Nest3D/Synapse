import { prisma } from "@/lib/prisma";
import { TabsManager } from "@/components/admin/tabs-manager";

export default async function TabsPage() {
  const tabs = await prisma.tab.findMany({
    orderBy: { order: "asc" },
    include: { fields: { orderBy: { order: "asc" } } },
  });

  const data = tabs.map((t) => ({
    id: t.id,
    name: t.name,
    fields: t.fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      options: (f.options as string[] | null) ?? [],
    })),
  }));

  return (
    <div className="animate-rise">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          Admin
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Brood
        </h1>
        <p className="mt-1 text-sm text-muted">
          Your broods and their columns. Manage who can see each brood and column
          on the People page.
        </p>
      </header>

      <TabsManager tabs={data} />
    </div>
  );
}
