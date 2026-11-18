import { PrismaClient } from "@prisma/client";
import { roleNames } from "@pulse/shared";

import { hashPassword } from "../src/core";
import { seedFeedback } from "./demo";
const db = new PrismaClient();
async function seed() {
  for (const name of roleNames)
    await db.role.upsert({ where: { name }, create: { name }, update: {} });
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12)
    throw Error("Configure ADMIN_EMAIL and ADMIN_PASSWORD.");
  await db.user.upsert({
    where: { email },
    update: {},
    create: {
      name: "Academy administrator",
      email,
      passwordHash: await hashPassword(password),
      role: { connect: { name: "SYSTEM_ADMIN" } },
    },
  });
  if (process.env.DEMO_MODE !== "true") return;
  if (process.env.NODE_ENV === "production")
    throw Error("Development seeds require a development environment");
  if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 12)
    throw Error("Set DEMO_PASSWORD");
  const hash = await hashPassword(process.env.DEMO_PASSWORD);
  const course = await db.course.upsert({
    where: { name: "Python foundations" },
    create: { name: "Python foundations" },
    update: {},
  });
  const group = await db.studentGroup.upsert({
    where: { name: "Python 12" },
    create: { name: "Python 12", courseId: course.id },
    update: {},
  });
  for (const [alias, name, role] of [
    ["edu", "Alex Morgan", "EDU_LEAD"],
    ["ops", "Jordan Lee", "ADMIN_LEAD"],
    ["director", "Maya Thompson", "DIRECTOR"],
    ["lecturer", "Sam Rivera", "LECTURER"],
    ...["student", "student2", "student3", "student4"].map((s) => [
      s,
      s,
      "STUDENT",
    ]),
  ] as string[][]) {
    const person = await db.user.upsert({
      where: { email: alias + "@pulse.test" },
      update: {},
      create: {
        email: alias + "@pulse.test",
        name,
        passwordHash: hash,
        role: { connect: { name: roleNames.find((r) => r === role)! } },
      },
    });
    if (role === "LECTURER")
      await db.lecturer.upsert({
        where: { userId: person.id },
        create: { userId: person.id },
        update: {},
      });
    if (role === "STUDENT")
      await db.groupMembership.upsert({
        where: {
          studentId_groupId: { studentId: person.id, groupId: group.id },
        },
        create: { studentId: person.id, groupId: group.id },
        update: {},
      });
  }
  await seedFeedback(db, group.id);
}
seed()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
