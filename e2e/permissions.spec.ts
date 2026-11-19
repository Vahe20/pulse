import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { apiUrl } from "./endpoints";

test("role changes revoke sessions and restrict the new lecturer to their surveys", async ({
  request,
}) => {
  if (process.env.DEMO_MODE !== "true")
    throw Error("Dedicated demo database required");
  const api = apiUrl + "/";
  const login = async (email: string, password: string) => {
    const result = await request.post(api + "auth/login", {
      headers: { "x-pulse-client": "web" },
      data: { email, password },
    });
    expect(result.status()).toBe(200);
    const { accessToken } = await result.json();
    return { authorization: "Bearer " + accessToken };
  };
  const admin = await login(
    process.env.ADMIN_EMAIL!,
    process.env.ADMIN_PASSWORD!,
  );
  const account = {
    name: "QA permissions",
    email: randomUUID() + "@pulse.test",
    password: randomUUID(),
  };
  const created = await request.post(api + "users", {
    headers: admin,
    data: { ...account, role: "DIRECTOR" },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const originalSession = await login(account.email, account.password);
  const surveyId = "1e83587e-b686-48cd-8a5b-ffe06a663011";
  const source = api + "surveys/" + surveyId;
  expect(
    (await request.get(source, { headers: originalSession })).status(),
  ).toBe(200);
  expect(
    (
      await request.put(api + "users/" + id, {
        headers: admin,
        data: { name: account.name, email: account.email, role: "LECTURER" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await request.get(source, { headers: originalSession })).status(),
  ).toBe(401);
  expect(
    (
      await request.post(api + "auth/refresh", {
        headers: { "x-pulse-client": "web" },
      })
    ).status(),
  ).toBe(401);
  const lecturer = await login(account.email, account.password);
  expect((await request.get(source, { headers: lecturer })).status()).toBe(404);
  expect(
    (await request.get(source + "/analysis", { headers: lecturer })).status(),
  ).toBe(404);
  expect(
    (await request.get(api + "users", { headers: lecturer })).status(),
  ).toBe(403);
  const issue = {
    title: "QA responsibility",
    category: "Technology",
    description: "",
    surveyId,
    priority: "HIGH",
    dueAt: new Date(Date.now() + 86400000).toISOString(),
  };
  expect(
    (
      await request.post(api + "issues", {
        headers: admin,
        data: { ...issue, assigneeId: id },
      })
    ).status(),
  ).toBe(400);
  const edu = await login("edu@pulse.test", process.env.DEMO_PASSWORD!);
  const staff = await (
    await request.get(api + "users?search=Alex%20Morgan", { headers: admin })
  ).json();
  const assigned = await request.post(api + "issues", {
    headers: admin,
    data: { ...issue, assigneeId: staff[0].id },
  });
  expect(assigned.status()).toBe(201);
  const task = await assigned.json();
  const target = api + "issues/" + task.id;
  expect((await request.get(target, { headers: edu })).status()).toBe(200);
  expect(
    (
      await request.put(target, {
        headers: edu,
        data: { priority: "LOW", updatedAt: task.updatedAt },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.put(target, {
        headers: edu,
        data: { status: "IN_PROGRESS", updatedAt: task.updatedAt },
      })
    ).status(),
  ).toBe(200);
});
