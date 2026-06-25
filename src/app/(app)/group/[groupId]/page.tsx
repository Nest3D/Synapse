import { notFound, redirect } from "next/navigation";
import {
  getApprovedUser,
  canViewGroup,
  getGroupTaskSections,
  getTaggableGroups,
} from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { SectionedGrid, type Section } from "@/components/sectioned-grid";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const user = await getApprovedUser();
  if (!user) redirect("/login");
  if (!(await canViewGroup(user, groupId))) notFound();

  const [group, sections, groups] = await Promise.all([
    prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true, _count: { select: { members: true } } },
    }),
    getGroupTaskSections(user, groupId),
    getTaggableGroups(),
  ]);
  if (!group) notFound();

  return (
    <div className="animate-rise">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          Group
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          {group.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Tasks tagged to this group · {group._count.members}{" "}
          {group._count.members === 1 ? "member" : "members"}
        </p>
      </header>

      <SectionedGrid
        sections={sections as unknown as Section[]}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          count: g._count.members,
        }))}
        emptyLabel="Nothing is tagged to this group yet."
      />
    </div>
  );
}
