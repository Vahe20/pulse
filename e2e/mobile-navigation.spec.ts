import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 540 },
  isMobile: true,
  hasTouch: true,
});

async function signInAt(page: Page, path: string) {
  await page.goto(path);
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.ADMIN_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("swipes scroll the open navigation independently of the page", async ({
  page,
}) => {
  await signInAt(page, "/surveys/new");
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

test("mouse wheel over the overview chart cannot scroll behind the mobile menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 503, height: 873 });
  await signInAt(page, "/login");
  await expect(
    page.getByText("Satisfaction over time", { exact: true }),
  ).toBeVisible();
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  await toggle.click();
  const offset = () => page.evaluate(() => window.scrollY);
  const before = await offset();
  await page.mouse.move(450, 500);
  await page.mouse.wheel(0, 750);
  await page.keyboard.press("End");
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
  expect(await offset()).toBe(before);
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.mouse.wheel(0, 750);
  await expect.poll(offset).toBeGreaterThan(before);
});
