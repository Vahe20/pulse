import type { RoleName } from "@pulse/shared";
export interface User {
  id: string;
  name: string;
  role: RoleName;
}
interface Auth {
  accessToken: string;
  user: User;
}
let auth: Auth | null = null;
let refreshing: Promise<User | null> | null = null;
export async function call<T>(
  path: string,
  method = "GET",
  body?: unknown,
  retry = true,
): Promise<T> {
  const res = await fetch("/api/v1/" + path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "x-pulse-client": "web",
      ...(auth ? { authorization: "Bearer " + auth.accessToken } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && retry && !path.startsWith("auth/")) {
    if (await session()) return call(path, method, body, false);
    window.dispatchEvent(new Event("pulse-signout"));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: res.statusText }));
    throw Error(
      typeof data.message === "string" ? data.message : "Request failed",
    );
  }
  if (path.startsWith("reports/csv")) return (await res.text()) as T;
  const text = await res.text();
  return JSON.parse(text || "null") as T;
}
export function session() {
  if (!refreshing)
    refreshing = call<Auth>("auth/refresh", "POST", {})
      .then((v) => {
        auth = v;
        return v.user;
      })
      .catch(() => {
        auth = null;
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  return refreshing;
}
export async function login(payload: { email: string; password: string }) {
  auth = await call<Auth>("auth/login", "POST", payload);
  return auth.user;
}
export async function logout() {
  await call("auth/logout", "POST", {});
  auth = null;
}
export type Entry = {
  id: string;
  name: string;
  email?: string;
  course?: { name: string };
  user?: { name: string };
  role?: { name: string };
};
export type Question = {
  id: string;
  kind: "RATING" | "TEXT" | "SINGLE" | "MULTIPLE";
  prompt: string;
  category: string;
  criterion: string | null;
  required: boolean;
  options: { id: string; label: string }[];
};
export type Survey = {
  id: string;
  title: string;
  description: string;
  status: string;
  anonymous: boolean;
  startAt: string;
  endAt: string;
  lecturerId: string;
  minimum: number;
  reminderHours: number;
  maxReminders: number;
  questions: Question[];
  targets: { groupId: string }[];
  invitations?: { completed: boolean }[];
  _count?: { responses: number; invitations: number };
};
export type Theme = {
  id: string;
  title: string;
  description: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  confidence: number | null;
  suggestedAction: string;
  mentions: number;
};
export type Analysis = {
  id: string;
  status: string;
  source: string;
  summary: string | null;
  themes: Theme[];
};
export type Issue = {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  dueAt: string;
  assigneeId: string;
  assignee: { name: string };
  survey: { id: string; title: string };
  theme?: { title: string };
  updatedAt: string;
  history: {
    id: string;
    actor: { name: string };
    event: string;
    detail: Record<string, string>;
  }[];
  outgoing: { to: { id: string; title: string } }[];
  incoming: { from: { id: string; title: string } }[];
};
export type Report = {
  comparisons: {
    dimension: string;
    name: string;
    period: string;
    criterion: string;
    score: number;
    responses: number;
    invited: number;
  }[];
  surveys: number;
  active: number;
  responses: number;
  invited: number;
  responseRate: number | null;
  score: number | null;
  openIssues: number;
  resolved: number;
  overdue: number;
  threshold: number;
  timeline: {
    id: string;
    title: string;
    date: string;
    score: number;
    groups: string;
    lecturer: string;
    responses: number;
    invited: number;
  }[];
  trends: {
    surveyId: string;
    survey: string;
    criterion: string;
    score: number;
    previousScore: number;
    absolute: number;
    percent: number;
    alert: boolean;
  }[];
  categories: { category: string; score: number }[];
  themes: {
    title: string;
    mentions: number;
    sentiment: string;
    surveyId: string;
    source: string;
  }[];
  participation: {
    id: string;
    title: string;
    responses: number;
    invited: number;
  }[];
};
