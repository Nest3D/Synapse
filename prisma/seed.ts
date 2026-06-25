import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_FIELDS = [
  {
    key: "description",
    label: "Task description",
    type: "text" as const,
    order: 0,
  },
  { key: "category", label: "Category", type: "text" as const, order: 1 },
  { key: "done", label: "Done", type: "checkbox" as const, order: 2 },
];

async function ensureTab(name: string, order: number) {
  let tab = await prisma.tab.findFirst({ where: { name } });
  if (!tab) {
    tab = await prisma.tab.create({ data: { name, order } });
    await prisma.fieldDef.createMany({
      data: BASE_FIELDS.map((f) => ({ ...f, tabId: tab!.id })),
    });
    console.log(`+ created brood "${name}" with base columns`);
  } else {
    console.log(`= brood "${name}" already exists`);
  }
  return tab;
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();

  // Promote the configured admin if they've already signed in.
  if (adminEmail) {
    const updated = await prisma.user.updateMany({
      where: { email: adminEmail },
      data: { role: "admin", status: "approved" },
    });
    console.log(
      updated.count
        ? `= promoted ${adminEmail} to approved admin`
        : `! admin ${adminEmail} not found yet — will be promoted on first Google sign-in`,
    );
  }

  await ensureTab("Marketing", 1);
  await ensureTab("Roadmap", 2);

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
