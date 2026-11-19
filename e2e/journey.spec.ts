import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { apiUrl } from "./endpoints";
test("academy survey to confirmed improvement task", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8),
    course = "QA course " + suffix,
    group = "QA group " + suffix,
    title = "Course pulse " + suffix,
    issue = "Practice session " + suffix;
  if (process.env.DEMO_MODE !== "true")
    throw Error("Run the acceptance suite against a dedicated demo deployment");
  const password = process.env.DEMO_PASSWORD!;
  const base = apiUrl;
  const sign = async (email: string, pwd = password) => {
    const res = await request.post(base + "/auth/login", {
      headers: { "x-pulse-client": "web" },
      data: { email, password: pwd },
    });
    expect(res.ok()).toBeTruthy();
    return { authorization: "Bearer " + (await res.json()).accessToken };
  };
  const admin = await sign(
    process.env.ADMIN_EMAIL!,
    process.env.ADMIN_PASSWORD!,
  );
  const uiLogin = async (
    email: string,
    pwd = password,
    destination = "/login",
  ) => {
    await page.goto(destination);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(pwd);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  };
  const signout = async () => {
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
  };
  await uiLogin(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
  await page.getByRole("link", { name: "Courses", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Courses", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill(course);
  await page.getByRole("button", { name: "Add course", exact: true }).click();
  await expect(page.getByText("Record created", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Groups", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Groups", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill(group);
  await page
    .getByRole("combobox", { name: "Course", exact: true })
    .selectOption({ label: course });
  await page.getByRole("button", { name: "Add group", exact: true }).click();
  let groupId = "";
  await expect
    .poll(async () => {
      const rows = await (
        await request.get(
          base + "/groups?search=" + encodeURIComponent(group),
          { headers: admin },
        )
      ).json();
      groupId = rows[0]?.id ?? "";
      return groupId;
    })
    .not.toBe("");
  const students = [1, 2, 3, 4].map(
    (n) => "qa-" + suffix + "-" + n + "@pulse.test",
  );
  for (const email of students) {
    const r = await request.post(base + "/users", {
      headers: admin,
      data: {
        email,
        name: "Student " + email.split("@")[0],
        groupId,
        password,
        role: "STUDENT",
      },
    });
    expect(r.status()).toBe(201);
  }
  await page.getByRole("link", { name: "Surveys", exact: true }).click();
  await page.getByRole("link", { name: "Create survey" }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel(group, { exact: true }).check();
  await page
    .getByRole("combobox", { name: "Lecturer", exact: true })
    .selectOption({ label: "Sam Rivera" });
  await page.getByLabel("Minimum responses").fill("3");
  await page.getByLabel("Anonymous survey").uncheck();
  await page.getByRole("button", { name: "Add question" }).click();
  await page
    .getByLabel("Question text", { exact: true })
    .nth(1)
    .fill("What would improve the course?");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const id = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "Publish survey" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(base + "/surveys/" + id, { headers: admin })
          ).json()
        ).status,
    )
    .toBe("ACTIVE");
  await signout();
  await uiLogin(students[0], password, "/surveys/" + id);
  await expect(page).toHaveURL(new RegExp("/surveys/" + id + "$"));
  await page.getByRole("radio", { name: "4", exact: true }).check();
  await page
    .getByRole("textbox", { name: "What would improve the course?" })
    .fill("More hands-on practice");
  await page.getByRole("button", { name: "Submit feedback" }).click();
  await expect(
    page.getByRole("heading", { name: "Feedback submitted" }),
  ).toBeVisible();
  for (const email of students.slice(1, 3)) {
    const headers = await sign(email);
    expect(
      (
        await request.get(base + "/surveys/" + id + "/invitations", { headers })
      ).status(),
    ).toBe(403);
    expect((await request.get(base + "/reports", { headers })).status()).toBe(
      403,
    );
    const survey = await (
      await request.get(base + "/surveys/" + id, { headers })
    ).json();
    const data = {
      answers: {
        [survey.questions[0].id]: 5,
        [survey.questions[1].id]: "More exercises before exams",
      },
    };
    expect(
      (
        await request.post(base + "/surveys/" + id + "/responses", {
          headers,
          data,
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await request.post(base + "/surveys/" + id + "/responses", {
          headers,
          data,
        })
      ).status(),
    ).toBe(409);
  }
  await signout();
  await uiLogin("edu@pulse.test");
  await page.goto("/surveys/" + id);
  await expect(
    page.getByRole("heading", { name: "Invitations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Submitted", exact: true }),
  ).toHaveCount(3);
  await expect(
    page.getByRole("cell", { name: "Awaiting response", exact: true }),
  ).toHaveCount(1);
  await page.goto("/analysis/" + id);
  const queued = page.waitForResponse(
    (r) =>
      r.url().endsWith("/surveys/" + id + "/analysis") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Run analysis" }).click();
  expect((await queued).status()).toBe(201);
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(base + "/surveys/" + id + "/analysis", {
              headers: admin,
            })
          ).json()
        )?.status,
    )
    .toBe("REVIEW");
  await page.reload();
  await page.getByLabel("Theme title").fill("More exam practice");
  await page.getByRole("button", { name: "Publish analysis" }).click();
  await page.getByRole("link", { name: "Create issue from theme" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "More exam practice",
  );
  await page.getByLabel("Title", { exact: true }).fill(issue);
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Education");
  await page
    .getByRole("combobox", { name: "Priority", exact: true })
    .selectOption("HIGH");
  await page
    .getByRole("combobox", { name: "Assignee", exact: true })
    .selectOption({ label: "Sam Rivera" });
  await page.getByLabel("Due date").fill("2035-01-20");
  await page.getByRole("button", { name: "Create issue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: issue, exact: true }),
  ).toBeVisible();
  const issueUrl = page.url();
  await signout();
  await uiLogin("lecturer@pulse.test");
  await page.goto(issueUrl);
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("IN_PROGRESS");
  await page
    .getByLabel("Comment", { exact: true })
    .fill("Extra practice scheduled");
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(
    page.getByText("comment: Extra practice scheduled"),
  ).toBeVisible();
  await signout();
  await uiLogin("director@pulse.test");
  await page.goto("/reports?survey=" + id);
  await expect(page.getByText("75.0%", { exact: true })).toBeVisible();
  await expect(
    page.getByText("More exam practice", { exact: true }),
  ).toBeVisible();
  const report = await (
    await request.get(base + "/reports?surveyId=" + id, { headers: admin })
  ).json();
  expect(report.responses).toBe(3);
  expect(report.openIssues).toBe(1);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("pulse-report.csv");
  const pdf = await page.pdf({ format: "A4" });
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  const taskUrl = base + new URL(issueUrl).pathname;
  const task = await (await request.get(taskUrl, { headers: admin })).json();
  const change = (status: string, updatedAt: string) =>
    request.put(taskUrl, { headers: admin, data: { status, updatedAt } });
  expect((await change("CLOSED", task.updatedAt)).status()).toBe(409);
  expect((await change("RESOLVED", task.updatedAt)).status()).toBe(200);
  const resolved = await (
    await request.get(taskUrl, { headers: admin })
  ).json();
  expect(resolved.resolvedAt).toBeTruthy();
  expect((await change("CLOSED", task.updatedAt)).status()).toBe(409);
  expect((await change("CLOSED", resolved.updatedAt)).status()).toBe(200);
  const finalReport = await (
    await request.get(base + "/reports?surveyId=" + id, { headers: admin })
  ).json();
  expect(finalReport.openIssues).toBe(0);
  expect(finalReport.resolved).toBe(1);
});
test("refresh rotation and logout invalidate sessions", async ({ request }) => {
  const url = apiUrl;
  const headers = { "x-pulse-client": "web" };
  const r = await request.post(url + "/auth/login", {
    headers,
    data: { email: "director@pulse.test", password: process.env.DEMO_PASSWORD },
  });
  expect(r.status()).toBe(200);
  const access = (await r.json()).accessToken;
  const first = r.headers()["set-cookie"].split(";")[0];
  expect(
    (await request.post(url + "/auth/refresh", { headers })).status(),
  ).toBe(200);
  expect(
    (
      await request.post(url + "/auth/refresh", {
        headers: { ...headers, cookie: first },
      })
    ).status(),
  ).toBe(401);
  await request.post(url + "/auth/logout", { headers });
  expect(
    (
      await request.get(url + "/reports", {
        headers: { authorization: "Bearer " + access },
      })
    ).status(),
  ).toBe(401);
});
