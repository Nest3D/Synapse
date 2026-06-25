import { redirect } from "next/navigation";

// People management moved to /people (visible to all members; admin controls
// are gated there). Keep this path working for old links.
export default function AdminUsersRedirect() {
  redirect("/people");
}
