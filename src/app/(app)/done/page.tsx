import { redirect } from "next/navigation";
import { getApprovedUser, getDoneTasks } from "@/lib/access";
import { LogList } from "@/components/log-list";

export const dynamic = "force-dynamic";

export default async function DonePage() {
  const user = await getApprovedUser();
  if (!user) redirect("/login");

  const rows = await getDoneTasks(user);

  return (
    <div className="animate-rise">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          Done
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Done
        </h1>
        <p className="mt-1 text-sm text-muted">
          Completed tasks, newest first. Uncheck to send one back.
        </p>
      </header>

      <LogList
        rows={rows}
        canUndone
        emptyLabel="No completed tasks yet."
      />
    </div>
  );
}
