import { redirect } from "next/navigation";
import { getApprovedUser, getVisibleTabs, isAdmin } from "@/lib/access";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function BoardHome() {
  const user = await getApprovedUser();
  if (!user) redirect("/login");

  const tabs = await getVisibleTabs(user);
  if (tabs.length > 0) redirect(`/tab/${tabs[0].id}`);

  return (
    <div className="animate-rise flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
        No tasks
      </p>
      <h2 className="mt-4 max-w-md font-display text-3xl font-bold tracking-tight">
        Nothing scoped to you yet
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
        {isAdmin(user)
          ? "Create a tab and add fields to get started."
          : "When an admin gives you a tab — or tags you in one — it shows up here."}
      </p>
      {isAdmin(user) && (
        <Link href="/admin/tabs" className="mt-7">
          <Button>Create your first tab</Button>
        </Link>
      )}
    </div>
  );
}
