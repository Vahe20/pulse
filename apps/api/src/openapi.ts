import type { OpenAPIObject } from "@nestjs/swagger";
import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import {
  categories,
  issueStates,
  priorities,
  questionKinds,
  roleNames,
} from "@pulse/shared";

const text: SchemaObject = { type: "string" };
const id: SchemaObject = { type: "string", format: "uuid" };
const date: SchemaObject = { type: "string", format: "date-time" };
const integer: SchemaObject = { type: "integer" };
const bool: SchemaObject = { type: "boolean" };
const list = (items: SchemaObject): SchemaObject => ({ type: "array", items });
const enumeration = (values: readonly string[]): SchemaObject => ({
  type: "string",
  enum: [...values],
});
const object = (
  properties: Record<string, SchemaObject>,
  required = Object.keys(properties),
): SchemaObject => ({ type: "object", properties, required });
const question = object(
  {
    kind: enumeration(questionKinds),
    prompt: text,
    category: text,
    criterion: { ...text, nullable: true },
    required: bool,
    options: list(text),
  },
  ["kind", "prompt", "category"],
);
const survey = object({
  title: text,
  description: text,
  lecturerId: id,
  groupIds: list(id),
  anonymous: bool,
  startAt: date,
  endAt: date,
  minimum: { type: "integer", minimum: 3 },
  reminderHours: integer,
  maxReminders: integer,
  questions: list(question),
});
const issue = object(
  {
    title: text,
    description: text,
    category: enumeration(categories),
    priority: enumeration(priorities),
    surveyId: id,
    themeId: id,
    assigneeId: id,
    dueAt: date,
  },
  [
    "title",
    "description",
    "category",
    "priority",
    "surveyId",
    "assigneeId",
    "dueAt",
  ],
);
const user = object(
  {
    name: text,
    email: { ...text, format: "email" },
    role: enumeration(roleNames),
    password: { ...text, format: "password", minLength: 12 },
    groupId: id,
  },
  ["name", "email", "role", "password"],
);
export function documentContracts(doc: OpenAPIObject) {
  const schemas: Record<string, SchemaObject> = {
    "auth/login": object({
      email: { ...text, format: "email" },
      password: { ...text, format: "password" },
    }),
    users: user,
    "users/{id}": { ...user, required: ["name", "email", "role"] },
    groups: object({ name: text, courseId: id }),
    courses: object({ name: text }),
    "groups/{id}": object({ name: text }),
    "courses/{id}": object({ name: text }),
    "groups/{id}/members": object({ studentId: id }),
    settings: object({
      threshold: {
        type: "number",
        exclusiveMinimum: true,
        minimum: 0,
        maximum: 4,
      },
    }),
    surveys: survey,
    "surveys/{id}": survey,
    "surveys/{id}/responses": object({
      answers: {
        type: "object",
        additionalProperties: { oneOf: [text, integer, list(id)] },
      },
    }),
    "analyses/{id}": object({
      publish: bool,
      summary: text,
      themes: list(
        object({
          id,
          title: text,
          sentiment: enumeration(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
        }),
      ),
    }),
    issues: issue,
    "issues/{id}": object(
      {
        updatedAt: date,
        status: enumeration(issueStates),
        priority: enumeration(priorities),
        dueAt: date,
        assigneeId: id,
        relatedId: id,
        comment: text,
      },
      ["updatedAt"],
    ),
  };
  for (const [path, item] of Object.entries(doc.paths)) {
    const route = path.replace(/^\/api\/v1\//, "");
    for (const method of ["get", "post", "put"] as const) {
      const op = item[method];
      if (!op) continue;
      op.tags = [route.split("/")[0]];
      if (route !== "health" && !route.startsWith("auth/"))
        op.security = [{ bearer: [] }];
      if (route.startsWith("auth/"))
        op.parameters = [
          ...(op.parameters ?? []),
          {
            in: "header",
            name: "X-Pulse-Client",
            required: true,
            schema: { type: "string", enum: ["web"], default: "web" },
          },
        ];
      if (method !== "get" && schemas[route])
        op.requestBody = {
          required: true,
          content: { "application/json": { schema: schemas[route] } },
        };
      if (
        method === "get" &&
        [
          "users",
          "groups",
          "courses",
          "lecturers",
          "surveys",
          "surveys/{id}/invitations",
          "issues",
          "notifications",
        ].includes(route)
      )
        op.parameters = [
          ...(op.parameters ?? []),
          ...["page", "limit", "sort"].map((name) => ({
            in: "query" as const,
            name,
            schema:
              name === "sort"
                ? enumeration(["asc", "desc"])
                : { type: "integer" as const, minimum: 1 },
          })),
        ];
      if (method === "get" && ["reports", "reports/csv"].includes(route))
        op.parameters = [
          "groupId",
          "lecturerId",
          "courseId",
          "surveyId",
          "status",
          "from",
          "to",
        ].map((name) => ({
          in: "query" as const,
          name,
          schema: name.endsWith("Id")
            ? id
            : name === "status"
              ? enumeration(issueStates)
              : { ...text, format: "date" },
        }));
      if (route === "reports/csv")
        op.responses = {
          "200": {
            description: "CSV attachment",
            content: { "text/csv": { schema: text } },
          },
        };
    }
  }
  return doc;
}
