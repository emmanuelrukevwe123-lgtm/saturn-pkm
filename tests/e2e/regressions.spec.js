import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app.html");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
});

async function openNav(page, name) {
  if ((page.viewportSize()?.width || 1_000) <= 880) await page.locator("#menu-toggle").click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function seed(page, { notes, projects = [], tasks = [], deleted = [] }) {
  await page.evaluate(({ notes, projects, tasks, deleted }) => {
    localStorage.setItem("saturn-pkm-seeded", "1");
    localStorage.setItem("saturn-pkm-notes", JSON.stringify(notes));
    localStorage.setItem("saturn-pkm-deleted-notes", JSON.stringify(deleted));
    localStorage.setItem("saturn-pkm-planner-projects", JSON.stringify(projects));
    localStorage.setItem("saturn-pkm-planner-tasks", JSON.stringify(tasks));
  }, { notes, projects, tasks, deleted });
  await page.reload();
}

const note = (id, title, body = "", tags = []) => ({ id, title, body, tags });

test("the built app runs without breaking the security policy or logging errors", async ({ page }) => {
  const problems = [];
  // Only this build is on trial, so the live site and Google's servers stay out of it.
  await page.route((url) => url.hostname !== "127.0.0.1", (route) => route.abort());
  page.on("console", (message) => {
    const external = /ERR_|Failed to load resource/.test(message.text());
    if (message.type() === "error" && !external) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await page.reload();
  for (const name of ["Tags", "Graph", "Progress", "Orbit", "Planner", "Bin", "Data & Sync", "Notes"]) await openNav(page, name);
  await page.locator(".row-title").first().click();
  await expect(page.locator("#rendered-body")).toContainText("knowledge base");
  expect(problems).toEqual([]);
  const csp = (await page.request.get("/app.html")).headers()["content-security-policy"];
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain("unsafe-eval");
  // Firebase's sign-in needs these, and a test can't reach them to notice otherwise.
  expect(csp).toMatch(/script-src[^;]*https:\/\/apis\.google\.com/);
  expect(csp).toMatch(/connect-src[^;]*https:\/\/apis\.google\.com/);
  expect(csp).toMatch(/frame-src[^;]*https:\/\/saturn-pkm\.vercel\.app/);
});

test("Google sign-in is ready to use once the page has loaded", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => { if (message.text().startsWith("Sign-in problem")) warnings.push(message.text()); });
  await page.reload();
  if ((page.viewportSize()?.width || 1_000) <= 880) await page.locator("#menu-toggle").click();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
  await expect(page.locator("#auth-meta")).toHaveText("Notes stay on this browser.");
  expect(warnings).toEqual([]);
});

test("script in a note, title, tag or task stays inert text", async ({ page }) => {
  const attack = "<img src=x onerror=\"window.__pwned=true\">";
  await seed(page, {
    notes: [note("a", attack, `# ${attack}\n**${attack}** [[${attack}]]\n- ${attack}`, ["<b>x</b>"])],
    projects: [{ id: "p", name: attack, links: [{ id: "l", label: "bad", url: "javascript:window.__pwned=true" }] }],
    tasks: [{ id: "t", projectId: "p", title: attack, notes: attack }],
  });
  await page.locator(".row-title").first().click();
  await expect(page.locator("#rendered-body")).toContainText("onerror");
  await expect(page.locator("#rendered-body img, #rendered-body script")).toHaveCount(0);
  await openNav(page, "Planner");
  await page.locator(".row-title").first().click();
  await expect(page.locator("#ph-links a")).toHaveCount(0);
  await page.locator(".kb-card-body").click();
  await expect(page.locator("#task-notes-preview img")).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test("pasted HTML becomes plain text, so foreign markup can't enter a note", async ({ page }) => {
  await seed(page, { notes: [note("a", "Note")] });
  await page.locator(".row-title").first().click();
  const editor = page.locator("#rendered-body");
  await editor.click();
  await editor.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/html", '<img src=x onerror="window.__pwned=true"><b>bold</b>');
    data.setData("text/plain", "just text");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(editor).toContainText("just text");
  await expect(editor.locator("img, b")).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test("a link to a title with special characters opens that note", async ({ page }) => {
  await seed(page, { notes: [note("a", "Start", "See [[Q&A notes]]"), note("b", "Q&A notes", "Target body")] });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator("#rendered-body .wiki-link").click();
  await expect(page.locator("#note-title")).toHaveValue("Q&A notes");
  await expect(page.locator("#rendered-body")).toContainText("Target body");
});

test("editing, formatting and saving a note survives a reload, and unsaved edits are guarded", async ({ page }) => {
  await seed(page, { notes: [note("a", "Note", "Hello")] });
  await page.locator(".row-title").first().click();
  await expect(page.locator("#save-note")).toBeDisabled();
  const editor = page.locator("#rendered-body");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" world");
  await expect(page.locator("#save-status")).toHaveText("Unsaved changes");

  let asked = 0;
  page.once("dialog", (dialog) => { asked += 1; dialog.dismiss(); });
  await page.locator("#back-link").click();
  expect(asked).toBe(1);
  await expect(page.locator("#note-title")).toBeVisible();

  await page.locator("#save-note").click();
  await expect(page.locator("#save-status")).toHaveText("Saved");
  await page.reload();
  await openNav(page, "Notes");
  await page.locator(".row-title").first().click();
  await expect(page.locator("#rendered-body")).toContainText("Hello world");
});

test("a screen opened right after loading is still there after a refresh", async ({ page }) => {
  await openNav(page, "Orbit");
  await expect(page.locator("#screen-orbit")).toBeVisible();
  await page.reload();
  await expect(page.locator("#screen-orbit")).toBeVisible();
});

test("the welcome notes don't come back after being deleted forever", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await expect(page.locator(".row-title")).toHaveCount(2);
  for (const title of ["Welcome to Saturn", "How linking works"]) {
    await page.getByRole("button", { name: `Delete ${title}` }).click();
  }
  await openNav(page, "Bin");
  for (let index = 0; index < 2; index += 1) await page.getByRole("button", { name: "Delete forever" }).first().click();
  await expect(page.locator("#bin-empty")).toBeVisible();
  await page.reload();
  await openNav(page, "Notes");
  await expect(page.locator("#home-empty")).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem("saturn-pkm-deleted-notes"));
  expect(stored).not.toContain("knowledge base");
});

test("a deleted note can be restored from the bin", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await seed(page, { notes: [note("a", "Keep me", "Body")] });
  await page.getByRole("button", { name: "Delete Keep me" }).click();
  await expect(page.locator("#home-empty")).toBeVisible();
  await openNav(page, "Bin");
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.locator("#note-title")).toHaveValue("Keep me");
  await openNav(page, "Bin");
  await expect(page.locator("#bin-empty")).toBeVisible();
});

test("note rows open with the keyboard", async ({ page }) => {
  await seed(page, { notes: [note("a", "Keyboard note")] });
  await page.getByRole("button", { name: "Keyboard note", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#note-title")).toHaveValue("Keyboard note");
});

test("kanban: arrow keys move a task and Enter opens it, keeping focus", async ({ page }) => {
  await seed(page, { notes: [note("a", "N")], projects: [{ id: "p", name: "Board" }], tasks: [{ id: "t", projectId: "p", title: "Move me" }] });
  await openNav(page, "Planner");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  const grip = page.locator(".kb-grip");
  await grip.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('.kb-col[data-status="doing"]')).toContainText("Move me");
  await expect(grip).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Task" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#task-title")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(grip).toBeFocused();
});

test("kanban: dragging a card moves it, and leaves no drag leftovers", async ({ page }) => {
  test.skip((page.viewportSize()?.width || 1_000) <= 880, "the drag path is shared; a mouse drag needs the desktop layout");
  await seed(page, { notes: [note("a", "N")], projects: [{ id: "p", name: "Board" }], tasks: [{ id: "t", projectId: "p", title: "Drag me" }] });
  await openNav(page, "Planner");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.locator(".kb-grip").scrollIntoViewIfNeeded();
  const from = await page.locator(".kb-grip").boundingBox();
  const to = await page.locator('.kb-col[data-status="done"] .kb-cards').boundingBox();
  await page.mouse.move(from.x + 4, from.y + 4);
  await page.mouse.down();
  await page.mouse.move(to.x + 40, to.y + 10, { steps: 10 });
  await expect(page.locator(".kb-ghost")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('.kb-col[data-status="done"]')).toContainText("Drag me");
  await expect(page.locator(".kb-ghost, .kb-placeholder")).toHaveCount(0);
});

test("the task dialog saves, and warns before discarding", async ({ page }) => {
  await seed(page, { notes: [note("a", "Linked note", "x")], projects: [{ id: "p", name: "Board" }], tasks: [{ id: "t", projectId: "p", title: "Task" }] });
  await openNav(page, "Planner");
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.locator(".kb-card-body").click();
  await page.locator("#task-notes").fill("See [[Linked note]]");
  await expect(page.locator("#task-notes-preview .wiki-link")).toHaveText("Linked note");
  await page.locator("#task-prio-pills").getByRole("button", { name: "High" }).click();
  await page.locator("#task-save").click();
  await expect(page.locator("#task-save")).toBeDisabled();
  await page.locator("#task-close").click();
  await expect(page.locator(".kb-prio")).toHaveText("high");

  await page.locator(".kb-card-body").click();
  await page.locator("#task-title").fill("Changed");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#task-close").click();
  await expect(page.locator("#task-title")).toBeVisible();
});

test("renaming a project: clearing the title while typing doesn't fight the cursor", async ({ page }) => {
  await seed(page, { notes: [note("a", "N")], projects: [{ id: "p", name: "Old name" }] });
  await openNav(page, "Planner");
  await page.getByRole("button", { name: "Old name", exact: true }).click();
  const title = page.locator("#board-title");
  await title.fill("");
  await expect(title).toHaveValue("");
  await title.pressSequentially("New name");
  await title.press("Enter");
  await page.locator("#board-back").click();
  await expect(page.locator("#project-list")).toContainText("New name");
});

test("another tab's changes appear without a reload", async ({ page, context }) => {
  await seed(page, { notes: [note("a", "First")] });
  const other = await context.newPage();
  await other.goto("/app.html");
  await other.getByRole("button", { name: "First", exact: true }).click();
  await other.locator("#note-title").fill("Renamed elsewhere");
  await other.locator("#save-note").click();
  await expect(page.locator("#ledger")).toContainText("Renamed elsewhere");
  await other.close();
});

test("the import message stays visible, and a bad file changes nothing", async ({ page }) => {
  await seed(page, { notes: [note("a", "Existing")] });
  await openNav(page, "Data & Sync");
  await page.locator("#data-import-file").setInputFiles({
    name: "bad.saturn", mimeType: "application/json", buffer: Buffer.from('{"format":"wrong"}'),
  });
  await page.getByRole("button", { name: "Validate and import" }).click();
  await expect(page.locator("#import-summary")).toContainText("Import made no changes");

  const backup = { format: "saturn-backup", schemaVersion: 3, notes: [note("b", "Imported")], deletedNotes: [], projects: [], tasks: [], images: [] };
  await page.locator("#data-import-file").setInputFiles({
    name: "good.saturn", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)),
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Validate and import" }).click();
  await expect(page.locator("#storage-state")).toHaveText("Import completed and validated successfully.");
  await openNav(page, "Notes");
  await expect(page.locator("#ledger")).toContainText("Imported");
  await expect(page.locator("#ledger")).toContainText("Existing");
});

test("a backup can't smuggle in a non-image file", async ({ page }) => {
  await openNav(page, "Data & Sync");
  const backup = {
    format: "saturn-backup", schemaVersion: 3, notes: [], deletedNotes: [], projects: [], tasks: [],
    images: [{ id: "x", type: "text/html", data: "PHNjcmlwdD4=" }],
  };
  await page.locator("#data-import-file").setInputFiles({
    name: "evil.saturn", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole("button", { name: "Validate and import" }).click();
  await expect(page.locator("#import-summary")).toContainText("Import made no changes");
});

test("an image can be added, resized, and saved with its note", async ({ page }) => {
  await seed(page, { notes: [note("a", "Pictures")] });
  await page.locator(".row-title").first().click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==", "base64");
  await page.locator("#rendered-body").click();
  await page.locator("#img-input").setInputFiles({ name: "x.png", mimeType: "image/png", buffer: png });
  const image = page.locator("#rendered-body img.note-img");
  await expect(image).toHaveCount(1);
  await image.click();
  await page.locator("#img-size-pop").getByRole("button", { name: "50%" }).click();
  await expect(page.locator("#img-size-pop")).toHaveCount(0);
  await page.locator("#save-note").click();
  await page.reload();
  await openNav(page, "Notes");
  await page.locator(".row-title").first().click();
  await expect(page.locator("#rendered-body img.note-img")).toHaveAttribute("data-w", "50");
});

test("the graph and tag screens show the notebook", async ({ page }) => {
  await seed(page, { notes: [note("a", "One", "[[Two]]", ["t"]), note("b", "Two", "", ["t"])] });
  await openNav(page, "Graph");
  await expect(page.locator("#graph-canvas")).toBeVisible();
  await expect(page.locator("#graph-text")).toContainText("One links to Two");
  await openNav(page, "Tags");
  await page.locator(".group-head").first().click();
  await expect(page.locator(".group-body")).toContainText("Two");
});

test("dark mode is remembered", async ({ page }) => {
  await openNav(page, "Notes");
  if ((page.viewportSize()?.width || 1_000) <= 880) await page.locator("#menu-toggle").click();
  await page.locator("#theme-toggle").click();
  await expect(page.locator("body")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/dark/);
});

test("the sign-in button sits fully inside its card, even on a short screen", async ({ page }) => {
  const width = page.viewportSize().width;
  if (width <= 880) await page.locator("#menu-toggle").click();
  for (const height of [800, 560]) {
    await page.setViewportSize({ width, height });
    const button = page.locator("#google-signin");
    await button.scrollIntoViewIfNeeded();
    const inner = await button.boundingBox();
    const card = await page.locator("#auth-card").boundingBox();
    expect(inner.y).toBeGreaterThanOrEqual(card.y);
    expect(inner.y + inner.height).toBeLessThanOrEqual(card.y + card.height);
    // Scrolled into view, it isn't cut off by the bottom of the screen either.
    expect(inner.y + inner.height).toBeLessThanOrEqual(height);
  }
});
