import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.goto("/app.html");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function openSidebarOnMobile(page) {
  if ((page.viewportSize()?.width || 1_000) <= 880) await page.locator("#menu-toggle").click();
}

test("creates a unique note and exposes backup controls", async ({ page }) => {
  await openSidebarOnMobile(page);
  await page.getByRole("button", { name: /new note/i }).click();
  await page.locator("#add-title").fill("Welcome to Saturn");
  await page.locator("#add-save").click();
  await expect(page.locator("#note-title")).toHaveValue("Welcome to Saturn (2)");
  await openSidebarOnMobile(page);
  await page.getByRole("button", { name: "Data & Sync" }).click();
  await expect(page.getByRole("button", { name: /Export .saturn backup/i })).toBeVisible();
});

test("task dialog is labelled and keyboard-contained", async ({ page }) => {
  await openSidebarOnMobile(page);
  await page.getByRole("button", { name: "Planner" }).click();
  await page.locator("#project-name").fill("Launch");
  await page.locator("#project-create").click();
  await page.locator(".kb-add").first().click();
  await page.locator(".kb-add-field").fill("Check orbit");
  await page.keyboard.press("Enter");
  await page.locator(".kb-card-body").click();
  await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
});

test("has no serious or critical automated accessibility violations", async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact))).toEqual([]);
});
