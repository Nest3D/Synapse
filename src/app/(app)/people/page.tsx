import { redirect } from "next/navigation";

// People management merged into /admin/broods (People section).
export default function PeopleRedirect() {
  redirect("/admin/broods");
}
