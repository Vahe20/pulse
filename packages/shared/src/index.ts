import { z } from "zod";
export const roleNames = [
  "STUDENT",
  "LECTURER",
  "EDU_LEAD",
  "ADMIN_LEAD",
  "DIRECTOR",
  "SYSTEM_ADMIN",
] as const;
export type RoleName = (typeof roleNames)[number];
export const loginSchema = z.object({
  email: z.string().email().max(254).toLowerCase(),
  password: z.string().min(1).max(256),
});
export const questionKinds = ["RATING", "TEXT", "SINGLE", "MULTIPLE"] as const;
export const criteria = {
  lectures: "Quality of lectures",
  practice: "Quality of practical sessions",
  materials: "Quality of learning materials",
  organization: "Course organization",
} as const;
const question = z
  .object({
    kind: z.enum(questionKinds),
    prompt: z.string().trim().min(1).max(500),
    category: z.string().trim().min(1).max(80),
    criterion: z
      .enum(["lectures", "practice", "materials", "organization"])
      .nullable()
      .default(null),
    required: z.boolean().default(true),
    options: z.array(z.string().trim().min(1).max(150)).max(15).default([]),
  })
  .superRefine((q, c) => {
    if (
      q.criterion &&
      (q.kind !== "RATING" || q.prompt !== criteria[q.criterion])
    )
      c.addIssue({
        code: "custom",
        message:
          "Use the canonical rating prompt for this comparison criterion.",
      });
    const choice = q.kind === "MULTIPLE" || q.kind === "SINGLE";
    if (
      choice
        ? q.options.length < 2 || new Set(q.options).size !== q.options.length
        : q.options.length > 0
    )
      c.addIssue({
        code: "custom",
        message: "Check the choices for this question.",
      });
  });
export const surveySchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    description: z.string().max(3000).default(""),
    groupIds: z.array(z.string().uuid()).min(1).max(100),
    lecturerId: z.string().uuid(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    anonymous: z.boolean(),
    minimum: z.number().int().min(3).max(10000),
    reminderHours: z.number().int().min(1).max(720),
    maxReminders: z.number().int().min(0).max(20),
    questions: z.array(question).min(1).max(40),
  })
  .superRefine((s, c) => {
    if (s.endAt <= s.startAt)
      c.addIssue({
        code: "custom",
        message: "End date must follow start date.",
      });
    const keys = s.questions.flatMap((q) => (q.criterion ? [q.criterion] : []));
    if (
      new Set(keys).size !== keys.length ||
      new Set(s.groupIds).size !== s.groupIds.length
    )
      c.addIssue({
        code: "custom",
        message: "Duplicate comparison criterion or target group.",
      });
  });
export type SurveyInput = z.infer<typeof surveySchema>;
export type AnswerValue = string | number | string[];
export const submissionSchema = z.object({
  answers: z.record(
    z.string().uuid(),
    z.union([
      z.string().max(4000),
      z.number().int(),
      z.array(z.string().uuid()).max(15),
    ]),
  ),
});
export function validateAnswers(
  questions: {
    id: string;
    kind: (typeof questionKinds)[number];
    required: boolean;
    options: { id: string }[];
  }[],
  answers: Record<string, AnswerValue>,
) {
  if (Object.keys(answers).some((id) => !questions.some((q) => q.id === id)))
    return "Unknown question";
  for (const q of questions) {
    const v = answers[q.id];
    if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) {
      if (q.required) return "Complete every required question";
      continue;
    }
    const ids = q.options.map((o) => o.id);
    if (
      q.kind === "RATING" &&
      !(typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5)
    )
      return "Choose a rating from 1 to 5";
    if (q.kind === "TEXT" && !(typeof v === "string" && v.trim().length > 0))
      return "Enter a comment";
    if (q.kind === "SINGLE" && !(typeof v === "string" && ids.includes(v)))
      return "Choose one listed option";
    if (
      q.kind === "MULTIPLE" &&
      !(
        Array.isArray(v) &&
        new Set(v).size === v.length &&
        v.every((id) => ids.includes(id))
      )
    )
      return "Choose listed options";
  }
  return null;
}
export const issueStates = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const categories = [
  "Education",
  "Administration",
  "Technology",
] as const;
export const issueSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().max(3000),
  category: z.enum(categories),
  priority: z.enum(priorities),
  assigneeId: z.string().uuid(),
  dueAt: z.string().datetime(),
  surveyId: z.string().uuid(),
  themeId: z.string().uuid().optional(),
});
export function difference(previous: number, current: number) {
  return {
    absolute: current - previous,
    percent: previous === 0 ? null : (100 * (current - previous)) / previous,
  };
}
export function mentions(responseIds: string[]) {
  return new Set(responseIds).size;
}
