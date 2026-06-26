import { redirect } from "next/navigation";

// Merged into /admin/broods (People section).
export default function AdminUsersRedirect() {
  redirect("/admin/broods");
}
