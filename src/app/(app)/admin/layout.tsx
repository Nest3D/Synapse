import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/access";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");
  return <>{children}</>;
}
