import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default async function PendingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.status === "approved") redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="animate-rise w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <Brand size="md" />
        </div>

        <div className="glass rounded-[--radius-xl] border border-border p-10">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-warn/30 bg-warn/10">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-warn shadow-[0_0_12px_2px] shadow-warn/50" />
          </div>

          <h1 className="font-display text-2xl font-bold tracking-tight">
            Waiting on approval
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            You&apos;re signed in as{" "}
            <span className="font-mono text-ink">{session.user.email}</span>.
            <br />
            An admin needs to grant you access before you can see any tabs.
          </p>

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
            className="mt-8"
          >
            <Button variant="secondary" className="w-full" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
