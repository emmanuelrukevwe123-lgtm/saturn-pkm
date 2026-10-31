import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  // Axe reads contrast mid-animation otherwise; see app.spec.js.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app.html");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function openNav(page, name) {
  if ((page.viewportSize()?.width || 1_000) <= 880) await page.locator("#menu-toggle").click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function seed(page, { projects = [], tasks = [], hq = {} }) {
  await page.evaluate(({ projects, tasks, hq }) => {
    localStorage.setItem("saturn-pkm-planner-projects", JSON.stringify(projects));
    localStorage.setItem("saturn-pkm-planner-tasks", JSON.stringify(tasks));
    localStorage.setItem("saturn-pkm-hq", JSON.stringify(hq));
  }, { projects, tasks, hq });
  await page.reload();
}

const project = (id, stage, extra = {}) => ({ id, name: `Project ${id}`, stage, ...extra });

test("parks an idea from the Orbit screen", async ({ page }) => {
  await openNav(page, "Orbit");
  await expect(page.getByRole("button", { name: "Park idea" })).toBeDisabled();
  await page.getByLabel("Idea name").fill("Telescope app");
  await page.locator("#hq-park-category").getByRole("button", { name: "Creative" }).click();
  await page.getByRole("button", { name: "Park idea" }).click();
  await expect(page.locator("#hq-park-status")).toHaveText("Parked “Telescope app”.");
  await expect(page.locator("#hq-parked-list")).toContainText("Telescope app");
  await expect(page.locator("#hq-parked-list")).toContainText("Creative");
  await expect(page.locator("#hq-parked-count")).toHaveText("1");
});

test("blocks a third project from orbit and explains why", async ({ page }) => {
  await seed(page, { projects: [project("a", "orbit"), project("b", "orbit"), project("c", "next")], hq: { starterAddedAt: "2026-01-01T00:00:00.000Z" } });
  await openNav(page, "Orbit");
  await expect(page.locator("#hq-slots")).toHaveText("2 of 2 slots used");
  await expect(page.locator("#hq-orbit-cards")).toContainText("Slot locked");
  await page.locator("#hq-next-list").getByRole("button", { name: /Project c/ }).click();
  await expect(page.getByRole("button", { name: "Move to orbit" })).toBeDisabled();
  await expect(page.locator("#ph-orbit-note")).toContainText("Both orbit slots are taken");
});

test("dropping needs a reason, and the reason is shown afterwards", async ({ page }) => {
  await seed(page, { projects: [project("a", "orbit")] });
  await openNav(page, "Orbit");
  await page.getByRole("button", { name: "Open Project a" }).click();
  await page.getByRole("button", { name: "Drop with reason" }).click();
  const dialog = page.getByRole("dialog", { name: "Drop project" });
  const confirm = dialog.getByRole("button", { name: "Drop project" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Why are you dropping it?").fill("   ");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Why are you dropping it?").fill("Lost interest");
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#ph-stage")).toHaveText("Dropped");
  await page.locator("#board-back").click();
  await openNav(page, "Orbit");
  await page.locator("#hq-dropped summary").click();
  await expect(page.locator("#hq-dropped-list")).toContainText("Lost interest");
});

test("logs a session, edits the next step, and rejects a bad link", async ({ page }) => {
  await seed(page, { projects: [project("a", "orbit")] });
  await openNav(page, "Orbit");
  await page.getByRole("button", { name: "Log session for Project a" }).click();
  await page.getByRole("dialog", { name: "Log a session" }).getByLabel("What happened?").fill("Wrote the Dockerfile");
  await page.getByRole("button", { name: "Save to log" }).click();
  await expect(page.getByRole("button", { name: "Log session for Project a" })).toBeFocused();
  await page.getByRole("button", { name: "Open Project a" }).click();
  await expect(page.locator("#ph-log")).toContainText("Wrote the Dockerfile");

  await page.getByLabel("Next step").fill("Push the image");
  await page.getByLabel("Next step").press("Enter");
  await page.locator("#ph-link-url").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Add link" }).click();
  await expect(page.locator("#ph-link-error")).toBeVisible();
  await page.locator("#ph-link-url").fill("https://example.com");
  await page.getByRole("button", { name: "Add link" }).click();
  await expect(page.locator("#ph-links a")).toHaveAttribute("href", "https://example.com");

  await page.reload();
  await openNav(page, "Orbit");
  await page.getByRole("button", { name: "Open Project a" }).click();
  await expect(page.getByLabel("Next step")).toHaveValue("Push the image");
  await expect(page.locator("#ph-log")).toContainText("Wrote the Dockerfile");
});

test("picks up to 3 weekly tasks, and ticking one finishes it", async ({ page }) => {
  const tasks = [1, 2, 3, 4].map((n) => ({ id: `t${n}`, projectId: "a", title: `Task ${n}` }));
  await seed(page, { projects: [project("a", "orbit")], tasks });
  await openNav(page, "Orbit");
  await page.getByRole("button", { name: "Pick tasks" }).click();
  const dialog = page.getByRole("dialog", { name: "Pick this week's tasks" });
  for (const n of [1, 2, 3]) await dialog.getByRole("checkbox", { name: new RegExp(`Task ${n}`) }).check();
  await expect(dialog.getByRole("checkbox", { name: /Task 4/ })).toBeDisabled();
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.locator("#hq-week-list").getByRole("checkbox", { name: /Task 1/ }).check();
  await page.getByRole("button", { name: "Open Project a" }).click();
  await expect(page.locator('.kb-col[data-status="done"]')).toContainText("Task 1");
});

test("adds the starter projects once, skipping names already used", async ({ page }) => {
  await seed(page, { projects: [project("x", "parked", { name: "TradeMind" })] });
  await openNav(page, "Orbit");
  await page.getByRole("button", { name: "Add my starter projects" }).click();
  await expect(page.locator("#hq-slots")).toHaveText("2 of 2 slots used");
  await expect(page.locator("#hq-orbit-cards")).toContainText("soc-home-lab");
  await expect(page.locator("#hq-parked-count")).toHaveText("6");
  await expect(page.getByRole("button", { name: "Add my starter projects" })).toBeHidden();
  await page.reload();
  await openNav(page, "Orbit");
  await expect(page.locator("#hq-orbit-cards")).toContainText("soc-home-lab");
  await expect(page.getByRole("button", { name: "Add my starter projects" })).toBeHidden();
});

test("shows a few parked projects, then the rest on request", async ({ page }) => {
  await seed(page, { projects: [1, 2, 3, 4, 5].map((n) => project(`p${n}`, "parked")) });
  await openNav(page, "Orbit");
  await expect(page.locator("#hq-parked-list .hq-mini")).toHaveCount(3);
  await page.getByRole("button", { name: "Show 2 more" }).click();
  await expect(page.locator("#hq-parked-list .hq-mini")).toHaveCount(5);
});

test("old projects still open on the board with the header's defaults", async ({ page }) => {
  await seed(page, { projects: [{ id: "old", name: "Old board" }], tasks: [{ id: "t", projectId: "old", title: "Keep me", status: "doing" }] });
  await openNav(page, "Planner");
  await page.getByText("Old board").click();
  await expect(page.locator("#ph-stage")).toHaveText("Next");
  await expect(page.locator('.kb-col[data-status="doing"]')).toContainText("Keep me");
});

test("the weekly review walks four steps and only completes on Finish", async ({ page }) => {
  await seed(page, {
    projects: [project("a", "orbit"), project("b", "next")],
    tasks: [
      { id: "t1", projectId: "a", title: "Finish me", thisWeek: true }, { id: "t2", projectId: "a", title: "Keep going" },
      { id: "t3", projectId: "a", title: "Start me" }, { id: "t4", projectId: "a", title: "Pick me" },
    ],
  });
  await openNav(page, "Orbit");
  await expect(page.locator("#hq-review-status")).not.toHaveText("Done this week");
  await page.getByRole("button", { name: "Start review" }).click();
  const dialog = page.getByRole("dialog");

  await expect(dialog).toContainText("Step 1 of 4");
  await dialog.getByRole("checkbox", { name: /Finish me/ }).check();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#hq-review-status")).not.toHaveText("Done this week");

  await page.getByRole("button", { name: "Start review" }).click();
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(dialog).toContainText("Update statuses");
  await dialog.getByLabel("Status of Start me").selectOption("doing");
  await dialog.getByRole("button", { name: "Next" }).click();

  await expect(dialog).toContainText("Pick 3 tasks");
  await expect(dialog.getByRole("checkbox", { name: /Finish me/ })).toHaveCount(0);
  await dialog.getByRole("checkbox", { name: /Pick me/ }).check();
  await expect(dialog.locator("#hq-review-hint")).toHaveText("1 of 3 picked");
  await dialog.getByRole("button", { name: "Next" }).click();

  await expect(dialog).toContainText("Drop anything stuck");
  await dialog.getByRole("button", { name: "Drop Project b" }).click();
  const drop = page.getByRole("dialog", { name: "Drop project" });
  await drop.getByLabel("Why are you dropping it?").fill("Stuck");
  await drop.getByRole("button", { name: "Drop project" }).click();
  await expect(dialog.getByRole("button", { name: "Drop Project b" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Finish review" }).click();

  await expect(page.locator("#hq-review-status")).toHaveText("Done this week");
  await expect(page.locator("#hq-week-list")).toContainText("Pick me");
  await expect(page.locator("#hq-week-list")).not.toContainText("Finish me");
  await page.reload();
  await openNav(page, "Orbit");
  await expect(page.locator("#hq-review-status")).toHaveText("Done this week");
});

test("the parked review prompts once a month and can move or drop projects", async ({ page }) => {
  await seed(page, { projects: [project("p", "parked"), project("q", "parked")] });
  await openNav(page, "Orbit");
  await page.getByRole("button", { name: "Review parked" }).click();
  const dialog = page.getByRole("dialog", { name: "Parked review" });
  await dialog.getByRole("button", { name: "Move Project p to Next" }).click();
  await expect(page.locator("#hq-next-list")).toContainText("Project p");
  await dialog.getByRole("button", { name: "Drop Project q" }).click();
  await page.getByLabel("Why are you dropping it?").fill("Not needed");
  await page.getByRole("dialog", { name: "Drop project" }).getByRole("button", { name: "Drop project" }).click();
  await expect(dialog).toContainText("Nothing left in Parked");
  await dialog.getByRole("button", { name: "Finish review" }).click();
  await expect(page.locator("#hq-parked-prompt")).toBeHidden();
});

test("hides the parked prompt when it was done this month", async ({ page }) => {
  await seed(page, { projects: [project("p", "parked")], hq: { lastParkedReviewAt: new Date().toISOString() } });
  await openNav(page, "Orbit");
  await expect(page.locator("#hq-parked-prompt")).toBeHidden();
});

test("learning tracks can be added, updated and removed, keeping keyboard focus", async ({ page }) => {
  await openNav(page, "Orbit");
  await page.getByLabel("Track name").fill("AWS");
  await page.getByLabel("Track role").selectOption("cert");
  await page.getByRole("button", { name: "Add track" }).click();
  await expect(page.locator("#hq-tracks")).toContainText("Certification");

  await page.getByLabel("AWS progress percent").fill("140");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("AWS next step")).toBeFocused();
  await expect(page.getByLabel("AWS progress percent")).toHaveValue("100");
  await expect(page.getByRole("progressbar", { name: "AWS progress" })).toHaveAttribute("aria-valuenow", "100");
  await page.getByLabel("AWS next step").fill("Book the exam");
  await page.keyboard.press("Tab");

  await page.reload();
  await openNav(page, "Orbit");
  await expect(page.getByLabel("AWS next step")).toHaveValue("Book the exam");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove AWS" }).click();
  await expect(page.locator("#hq-tracks-empty")).toBeVisible();
});

test("a full backup restores Orbit data through the real import screen", async ({ page }) => {
  await seed(page, {
    projects: [project("a", "orbit", { nextStep: "Keep me", log: [{ id: "e", date: "2026-01-01T00:00:00.000Z", text: "Logged" }] })],
    tasks: [{ id: "t", projectId: "a", title: "Week task", thisWeek: true }],
    hq: { lastReviewAt: new Date().toISOString(), starterAddedAt: "2026-01-01T00:00:00.000Z" },
  });
  await page.evaluate(() => localStorage.setItem("saturn-pkm-tracks", JSON.stringify([{ id: "k", name: "AWS", progress: 40 }])));
  await page.reload();
  await openNav(page, "Data & Sync");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Export .saturn backup/ }).click()]);
  const path = await download.path();

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await openNav(page, "Data & Sync");
  await page.locator("#data-import-file").setInputFiles({ name: "b.saturn", mimeType: "application/json", buffer: (await import("node:fs")).readFileSync(path) });
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator('input[value="replace"]').check();
  await page.getByRole("button", { name: "Validate and import" }).click();

  await openNav(page, "Orbit");
  await expect(page.locator("#hq-orbit-cards")).toContainText("Keep me");
  await expect(page.locator("#hq-week-list")).toContainText("Week task");
  await expect(page.locator("#hq-review-status")).toHaveText("Done this week");
  await expect(page.locator("#hq-tracks")).toContainText("AWS");
  await expect(page.locator("#hq-starter")).toBeHidden();
});

for (const theme of ["light", "dark"]) {
  test(`Orbit and the project header pass axe in ${theme} mode`, async ({ page }) => {
    await page.evaluate((value) => localStorage.setItem("saturn-pkm-theme", value), theme);
    await seed(page, {
      projects: [
        project("a", "orbit", { nextStep: "Do it", links: [{ id: "l", label: "Repo", url: "https://example.com" }], log: [{ id: "e", date: "2026-01-01T00:00:00.000Z", text: "Did it" }] }),
        project("b", "orbit"), project("c", "next", { category: "creative", nextStep: "Later" }),
        project("d", "parked", { category: "career" }), project("e", "done", { category: "learning" }),
        project("f", "dropped", { droppedReason: "Stuck" }),
      ],
      tasks: [{ id: "t", projectId: "a", title: "Task", thisWeek: true, status: "done" }, { id: "u", projectId: "a", title: "Open", thisWeek: true }],
    });
    await page.evaluate(() => localStorage.setItem("saturn-pkm-tracks", JSON.stringify([{ id: "k", name: "AWS", role: "cert", progress: 40 }])));
    await page.reload();
    const serious = (results) => results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
    await openNav(page, "Orbit");
    await page.locator("#hq-dropped summary").click();
    expect(serious(await new AxeBuilder({ page }).analyze())).toEqual([]);
    await page.getByRole("button", { name: "Start review" }).click();
    for (let step = 0; step < 4; step += 1) {
      expect(serious(await new AxeBuilder({ page }).analyze())).toEqual([]);
      if (step < 3) await page.locator("#hq-review-next").click();
    }
    await page.locator("#hq-review-dialog").getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Review parked" }).click();
    expect(serious(await new AxeBuilder({ page }).analyze())).toEqual([]);
    await page.locator("#hq-parked-dialog").getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Open Project a" }).click();
    await expect(page.locator("#ph-stage")).toHaveText("In orbit");
    expect(serious(await new AxeBuilder({ page }).analyze())).toEqual([]);
    await page.getByRole("button", { name: "Drop with reason" }).click();
    expect(serious(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });
}
