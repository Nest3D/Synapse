import { redirect } from "next/navigation";
import { getApprovedUser, getBoardTasks } from "@/lib/access";
import { WeekBoard } from "@/components/week-board";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const user = await getApprovedUser();
  if (!user) redirect("/login");

  const tasks = await getBoardTasks(user);

  return (
    <div className="animate-rise">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          Plan
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Board
        </h1>
        <p className="mt-1 text-sm text-muted">
          Drag tasks into a day. Move and resize the windows however you like.
        </p>
      </header>

      <WeekBoard initialTasks={tasks} />
    </div>
  );
}
