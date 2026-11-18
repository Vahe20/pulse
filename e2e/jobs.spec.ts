import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import client from "../apps/api/node_modules/@prisma/client/default.js";
test("persistent scheduling, SMTP reminders, anonymous aggregation and closing analysis", async ({
  request,
}) => {
  if (process.env.DEMO_MODE !== "true")
    throw Error("Dedicated demo database required");
  const db = new client.PrismaClient();
  try {
    const base = "http://localhost:4100/api/v1/";
    const sign = async (email: string, password: string) => {
      const r = await request.post(base + "auth/login", {
        headers: { "x-pulse-client": "web" },
        data: { email, password },
      });
      expect(r.status()).toBe(200);
      return { authorization: "Bearer " + (await r.json()).accessToken };
    };
    const admin = await sign(
      process.env.ADMIN_EMAIL!,
      process.env.ADMIN_PASSWORD!,
    );
    const group = await db.studentGroup.findUniqueOrThrow({
      where: { name: "Python 12" },
    });
    const lecturer = await db.lecturer.findFirstOrThrow({
      where: { user: { email: "lecturer@pulse.test" } },
    });
    const course = await request.post(base + "surveys", {
      headers: admin,
      data: {
        title: "Anonymous scheduler check " + randomUUID(),
        description: "Local acceptance fixture",
        groupIds: [group.id],
        lecturerId: lecturer.id,
        startAt: new Date(Date.now() + 600000).toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
        minimum: 3,
        reminderHours: 1,
        maxReminders: 1,
        anonymous: true,
        questions: [
          {
            kind: "RATING",
            category: "Practice",
            criterion: "practice",
            prompt: "Quality of practical sessions",
            required: true,
          },
          {
            kind: "TEXT",
            category: "Practice",
            prompt: "What would help?",
            required: true,
          },
          {
            kind: "TEXT",
            category: "Practice",
            prompt: "Any further thoughts?",
            required: false,
          },
          {
            kind: "RATING",
            category: "Materials",
            criterion: "materials",
            prompt: "Quality of learning materials",
            required: false,
          },
        ],
      },
    });
    expect(course.status()).toBe(201);
    const { id } = await course.json();
    await request.post(base + "surveys/" + id + "/publish", {
      headers: admin,
      data: {},
    });
    expect(await db.surveyInvitation.count({ where: { surveyId: id } })).toBe(
      0,
    );
    await db.survey.update({
      where: { id },
      data: { startAt: new Date(Date.now() - 3600000) },
    });
    await expect
      .poll(
        () =>
          db.notification.count({
            where: {
              invitation: { surveyId: id },
              sequence: 0,
              status: "DELIVERED",
            },
          }),
        { timeout: 30000 },
      )
      .toBe(4);
    const qs = await db.surveyQuestion.findMany({
      where: { surveyId: id },
      orderBy: { position: "asc" },
    });
    const submit = async (email: string) => {
      const headers = await sign(email, process.env.DEMO_PASSWORD!);
      const answers = {
        [qs[0].id]: 4,
        [qs[1].id]: "More practice",
        [qs[2].id]: "More exercises",
        ...(email === "student@pulse.test" ? { [qs[3].id]: 1 } : {}),
      };
      return request.post(base + "surveys/" + id + "/responses", {
        headers,
        data: { answers },
      });
    };
    expect((await submit("student@pulse.test")).status()).toBe(201);
    await db.surveyInvitation.updateMany({
      where: { surveyId: id },
      data: { nextReminder: new Date(Date.now() - 1000) },
    });
    await expect
      .poll(
        () =>
          db.notification.count({
            where: {
              invitation: { surveyId: id },
              sequence: 1,
              status: "DELIVERED",
            },
          }),
        { timeout: 30000 },
      )
      .toBe(3);
    expect(
      await db.notification.count({
        where: { invitation: { surveyId: id, completed: true }, sequence: 1 },
      }),
    ).toBe(0);
    expect((await submit("student2@pulse.test")).status()).toBe(201);
    expect((await submit("student3@pulse.test")).status()).toBe(201);
    expect(
      await db.surveyResponse.count({
        where: { surveyId: id, studentId: { not: null } },
      }),
    ).toBe(0);
    expect(
      (
        await (
          await request.get(base + "reports?surveyId=" + id, { headers: admin })
        ).json()
      ).score,
    ).toBeNull();
    await db.survey.update({
      where: { id },
      data: { endAt: new Date(Date.now() - 1) },
    });
    expect((await submit("student4@pulse.test")).status()).toBe(409);
    await expect
      .poll(
        async () =>
          (await db.aIAnalysis.findFirst({ where: { surveyId: id } }))?.status,
        { timeout: 30000 },
      )
      .toBe("REVIEW");
    const r = await (
      await request.get(base + "reports?surveyId=" + id, { headers: admin })
    ).json();
    expect(r.score).toBe(4);
    expect(r.responseRate).toBe(75);
    expect(r.categories).toEqual([{ category: "Practice", score: 4 }]);
    const midcourseId = "1e83587e-b686-48cd-8a5b-ffe06a663012";
    const previous = await (
      await request.get(base + "reports?surveyId=" + midcourseId, {
        headers: admin,
      })
    ).json();
    expect(previous.trends).toContainEqual(
      expect.objectContaining({
        criterion: "practice",
        absolute: expect.closeTo(-1),
        alert: true,
      }),
    );
    const issue = await db.issue.findFirstOrThrow({
      where: {
        surveyId: midcourseId,
        title: "Add a practice session before exams",
      },
    });
    const followup = await (
      await request.get(base + "issues/" + issue.id + "/followup", {
        headers: admin,
      })
    ).json();
    expect(followup).toContainEqual(
      expect.objectContaining({
        criterion: "practice",
        before: expect.closeTo(10 / 3),
        after: 4,
      }),
    );
    const analysis = await db.aIAnalysis.findFirstOrThrow({
      where: { surveyId: id },
      include: { themes: { include: { comments: true } } },
    });
    expect(analysis.source).toBe("DEMO");
    expect(analysis.themes[0].mentions).toBe(3);
    expect(analysis.themes[0].comments).toHaveLength(6);
    const stats = await request.get(
      "http://localhost:58025/api/v1/messages?limit=1",
    );
    expect(stats.ok()).toBeTruthy();
  } finally {
    await db.$disconnect();
  }
});
