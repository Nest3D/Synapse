import { redirect } from "next/navigation";

// Brood management merged into /admin/broods (with People + Access sections).
export default function AdminTabsRedirect() {
  redirect("/admin/broods");
}
