import { expect, test } from "@playwright/test";
test("sign-in shows loading and invalid credential feedback", async ({
  page,
}) => {
  let release: () => void = () => {};
  const wait = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/v1/auth/refresh", async (route) => {
    await wait;
    await route.continue();
  });
  await page.goto("/login");
  await expect(page.getByRole("status", { name: "Loading" })).toBeVisible();
  release();
  await page.getByLabel("Email", { exact: true }).fill("nobody@pulse.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("invalid-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid credentials" }),
  ).toBeVisible();
});
