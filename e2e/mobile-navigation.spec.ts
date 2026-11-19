import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 540 },
  isMobile: true,
  hasTouch: true,
});

test("swipes scroll the open navigation independently of the page", async ({
  page,
}) => {
  await page.goto("/surveys/new");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.ADMIN_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create survey" }),
  ).toBeVisible();

  const touch = await page.context().newCDPSession(page);
  const swipeUp = async (x: number) => {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: 420 }],
    });
    for (const y of [400, 360, 320, 280, 240]) {
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y }],
      });
    }
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  const pageOffset = () => page.evaluate(() => window.scrollY);
  const sidebar = page.getByRole("complementary");
  await page.getByRole("button", { name: "Toggle navigation" }).tap();
  await expect(sidebar).toBeVisible();
  const initialOffset = await pageOffset();

  await swipeUp(350); // Backdrop
  await swipeUp(120); // Sidebar
  await expect
    .poll(() => sidebar.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(await pageOffset()).toBe(initialOffset);

  await page.touchscreen.tap(350, 150);
  await expect(sidebar).toBeHidden();
  expect(await pageOffset()).toBe(initialOffset);
  await swipeUp(350);
  await expect.poll(pageOffset).toBeGreaterThan(initialOffset);
});
