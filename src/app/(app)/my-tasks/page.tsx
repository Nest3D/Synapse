import { redirect } from "next/navigation";
import {
  getApprovedUser,
  getMyTaskSections,
  getTaggableGroups,
} from "@/lib/access";
import { SectionedGrid, type Section } from "@/components/sectioned-grid";

export default async function MyTasksPage() {
  const user = await getApprovedUser();
  if (!user) redirect("/login");

  const [sections, groups] = await Promise.all([
    getMyTaskSections(user),
    getTaggableGroups(),
  ]);

  return (
    <div className="animate-rise">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          You
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          My Tasks
        </h1>
        <p className="mt-1 text-sm text-muted">
          Everything tagged to you — directly or through a group you belong to.
        </p>
      </header>

      <SectionedGrid
        sections={sections as unknown as Section[]}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          count: g._count.members,
        }))}
        emptyLabel="Nothing is tagged to you yet."
      />
    </div>
  );
}
