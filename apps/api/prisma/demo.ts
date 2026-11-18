import { PrismaClient } from "@prisma/client";
import { criteria } from "@pulse/shared";
export async function seedFeedback(db: PrismaClient, groupId: string) {
  const instructor = await db.lecturer.findFirstOrThrow({
    where: { user: { email: "lecturer@pulse.test" } },
  });
  const lead = await db.user.findUniqueOrThrow({
    where: { email: "edu@pulse.test" },
  });
  const students = await db.user.findMany({
    where: {
      email: {
        in: [
          "student@pulse.test",
          "student2@pulse.test",
          "student3@pulse.test",
          "student4@pulse.test",
        ],
      },
    },
    orderBy: { email: "asc" },
  });
  for (const [index, title] of [
    "Python foundations · First course pulse",
    "Python foundations · Mid-course feedback",
    "Python foundations · Follow-up",
  ].entries()) {
    const id = [
      "1e83587e-b686-48cd-8a5b-ffe06a663011",
      "1e83587e-b686-48cd-8a5b-ffe06a663012",
      "1e83587e-b686-48cd-8a5b-ffe06a663013",
    ][index];
    await db.$transaction(async (tx) => {
      if (await tx.survey.findUnique({ where: { id } })) return;
      const startAt = new Date(Date.now() + [-40, -15, -1][index] * 86400000),
        endAt = new Date(+startAt + 7 * 86400000);
      const survey = await tx.survey.create({
        data: {
          id,
          title,
          description: "Student feedback on lectures and practical sessions.",
          creatorId: lead.id,
          lecturerId: instructor.id,
          anonymous: true,
          minimum: 3,
          startAt,
          endAt,
          status: index === 2 ? "SCHEDULED" : "CLOSED",
          targets: { create: { groupId } },
          questions: {
            create: [
              {
                kind: "RATING",
                criterion: "practice",
                category: "Practice",
                position: 0,
                prompt: criteria.practice,
                required: true,
              },
              {
                kind: "RATING",
                criterion: "lectures",
                category: "Lectures",
                position: 1,
                prompt: criteria.lectures,
                required: true,
              },
              {
                kind: "TEXT",
                category: "Education",
                position: 2,
                prompt: "What should we improve?",
                required: false,
              },
            ],
          },
        },
        include: { questions: { orderBy: { position: "asc" } } },
      });
      if (index === 2) return;
      const answerIds: string[] = [];
      for (const [i, student] of students.entries()) {
        await tx.surveyInvitation.create({
          data: { surveyId: id, studentId: student.id, completed: i < 3 },
        });
        if (i >= 3) continue;
        const response = await tx.surveyResponse.create({
          data: {
            surveyId: id,
            answers: {
              create: [
                {
                  questionId: survey.questions[0].id,
                  value: (index === 0 ? [4, 5, 4] : [3, 4, 3])[i],
                },
                { questionId: survey.questions[1].id, value: [5, 4, 5][i] },
                {
                  questionId: survey.questions[2].id,
                  value: [
                    "More exercises before exams.",
                    "I would like more hands-on practice.",
                    "The lectures are clear.",
                  ][i],
                },
              ],
            },
          },
          include: { answers: true },
        });
        if (i < 2)
          answerIds.push(
            response.answers.find(
              (a) => a.questionId === survey.questions[2].id,
            )!.id,
          );
      }
      if (index === 1) {
        const analysis = await tx.aIAnalysis.create({
          data: {
            surveyId: id,
            status: "PUBLISHED",
            source: "DEMO",
            summary:
              "Students value clear lectures and request more practice before exams.",
            themes: {
              create: {
                title: "More hands-on practice",
                description: "Two respondents asked for additional exercises.",
                suggestedAction: "Schedule a practice session before the exam.",
                sentiment: "NEUTRAL",
                mentions: 2,
                comments: {
                  create: answerIds.map((answerId) => ({ answerId })),
                },
              },
            },
          },
          include: { themes: true },
        });
        await tx.issue.create({
          data: {
            title: "Add a practice session before exams",
            description: "Prepare exercises for the next cohort workshop.",
            category: "Education",
            priority: "HIGH",
            status: "ASSIGNED",
            assigneeId: instructor.userId,
            creatorId: lead.id,
            surveyId: id,
            themeId: analysis.themes[0].id,
            dueAt: new Date(Date.now() + 3 * 86400000),
            history: {
              create: {
                actorId: lead.id,
                event: "Created",
                detail: { status: "ASSIGNED" },
              },
            },
          },
        });
      }
    });
  }
}
