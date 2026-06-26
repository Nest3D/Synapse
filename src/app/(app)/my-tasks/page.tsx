import { redirect } from "next/navigation";
import { getApprovedUser, getMyTaskSections } from "@/lib/access";
import { SectionedGrid, type Section } from "@/components/sectioned-grid";

export default async function MyTasksPage() {
  const user = await getApprovedUser();
  if (!user) redirect("/login");

  const sections = await getMyTaskSections(user);

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
          Every task across the broods you can access, in one place.
        </p>
      </header>

      <SectionedGrid
        sections={sections as unknown as Section[]}
        emptyLabel="Nothing scoped to you yet."
      />
    </div>
  );
}
