# Saturn HQ: build spec for Claude Code

Put this file at `docs/hq-plan.md` in the saturn-pkm repo. Then paste the **Kickoff prompt** (at the bottom) into Claude Code in VS Code.

## What we're building

Saturn HQ is a new **Orbit** screen inside Saturn PKM. It tracks my projects, ideas and learning, and it stops me jumping between projects:

- Only **2 projects** can be "in orbit" (active) at once.
- New ideas are **parked**, not started.
- Each project has **one next step**, a **"done when"** line, and a **session log**. I paste a summary after every Claude Code session.
- A **weekly review** every Sunday, and a Parked review on the 1st of the month.

This **extends the existing Planner**. Planner projects already exist with tasks on a kanban board (`normalizeProject` and `normalizeTask` in `public/modules/domain.js`). HQ adds fields and rules to those projects. It does **not** create a second project system.

## Constraints (follow the existing architecture)

Read `CONTEXT.md`, `CODEX_CONTEXT.md` and `README.md` first.

- Plain HTML, CSS and JS modules. **No frameworks and no build step.** Vite is for development only.
- **Pure logic** goes in a new module, `public/modules/hq.js`, with Vitest unit tests in `tests/unit/hq.test.js`. `public/script.js` only wires up the UI.
- **Persistence:** bump `SCHEMA_VERSION` from 2 to 3. The migration must keep every existing note, project and task, and give old projects safe defaults. Local-first storage stays the source of truth.
- **Backups:** the new fields and collections must round-trip through `.saturn` export and import. Extend `tests/unit/backup.test.js`.
- **Cloud sync** (feature-flagged): new fields ride along on existing project and task records, with the same revision, baseRevision and deviceId handling. Check that `firestore.rules` accepts the new fields and any new collection, and extend `tests/rules/ownership.test.js` if the rules change.
- **Design:** use the current **"Mission Control '72"** tokens in `style.css` (`--bg`, `--panel`, `--surface`, `--ink`, `--muted`, `--line`, `--accent`, `--track`), light and dark. Use the existing Baloo 2 / Quicksand type, ring cards, pill filters and ledger rows. The Saturn HQ mockup (dark navy and gold) is a **layout reference only**. Do not copy its colours.
- **Mobile:** must work under the existing `@media (max-width: 880px)` block.
- **Accessibility:** real `<button>`, `<label>` and `<input>` elements, keyboard reachable, and aria-labels on icon-only buttons. The existing axe Playwright test must still pass.
- Never edit `design/Saturn.html`.
- `npm run check` must pass at the end of every phase.

## Data model changes

### Project (extend `normalizeProject`)

| Field | Type | Default for old projects | Notes |
|---|---|---|---|
| `stage` | `"orbit" \| "next" \| "parked" \| "done" \| "dropped"` | `"next"` | |
| `category` | `"career" \| "portfolio" \| "creative" \| "learning"` | `"portfolio"` | One colour per category, drawn from the existing tag palette |
| `nextStep` | string | `""` | One line |
| `doneWhen` | string | `""` | Definition of done |
| `links` | `[{ id, label, url }]` | `[]` | Only `http:` and `https:` URLs; anything else is rejected |
| `log` | `[{ id, date, text }]` | `[]` | Session log, newest first |
| `droppedReason` | string | `""` | Required when stage becomes `"dropped"` |
| `stageChangedAt` | ISO string | `updated` | |
| `doneAt` | ISO string or `""` | `""` | Set when stage becomes `"done"` |

### Task (extend `normalizeTask`)

| Field | Type | Default |
|---|---|---|
| `thisWeek` | boolean | `false` |

### New state: `hq` settings

`{ lastReviewAt: "" , lastParkedReviewAt: "" }`, stored and backed up like the other collections.

### New collection: `tracks` (Phase 3)

`{ id, name, role: "main" | "support" | "cert" | "school", progress: 0–100, nextStep, created, updated, revision, baseRevision, deviceId }`

## Rules (all in `public/modules/hq.js`, all unit-tested)

| Function | Rule |
|---|---|
| `MAX_ORBIT = 2` | |
| `orbitProjects(state)` | Projects with stage `"orbit"` |
| `canMoveToOrbit(state)` | `true` only if fewer than 2 projects are in orbit |
| `moveStage(state, id, stage, { reason, now })` | Returns new state. Refuses `"orbit"` when full (returns `{ error: "orbit_full" }`). Refuses `"dropped"` without a non-empty reason. Sets `stageChangedAt`, and `doneAt` for done. Never mutates its input. |
| `parkIdea(state, { name, category, now })` | Creates a project with stage `"parked"`. Empty names are rejected. |
| `projectProgress(state, id)` | `{ done, total }` from that project's tasks |
| `setThisWeek(state, taskId, on)` | Refuses a 4th task (`{ error: "week_full" }`) |
| `addLogEntry(state, id, text, now)` | Prepends an entry and trims whitespace. Empty text is rejected. |
| `reviewDue(hq, now)` | Due if it's Sunday and there's been no review in the last 6 days, or if 7 or more days have passed |
| `parkedReviewDue(hq, now)` | Due on or after the 1st of the month if not yet done this month |

## Screens

### 1. Orbit screen (new sidebar item, above Planner)

Sections, top to bottom:

1. **In orbit:** up to 2 ring cards. Each shows the category label, project name, a progress ring (done/total tasks), the next step, an **Open** button and a **Log session** button. When 2 are in orbit, a third dashed card reads "Slot locked: mark a project done or drop it to open a slot." A badge reads "2 of 2 slots used".
2. **This week's 3 tasks:** checkboxes for tasks with `thisWeek: true`. Ticking one sets the task's status to `done`.
3. **New idea? Park it.:** a text input, category pills and a **Park idea** button. Creates a parked project and shows a short confirmation.
4. **Weekly review card:** shows "Due Sunday" or "Done this week". **Start review** opens a 4-step checklist: tick off finished work, update statuses, pick 3 tasks, drop anything stuck. Finishing sets `lastReviewAt`.
5. **All projects:** three columns, Next, Parked and Done, each with a count. Parked shows 3 cards and a "Show N more" button. Dropped projects sit behind a collapsed "Dropped (N)" section showing their reasons.
6. **Learning tracks** (Phase 3): name, role and a progress bar.

### 2. Project header (on the existing Planner project view)

Above the existing kanban board: stage pill, category, name, a large progress ring, **Done when**, **Next step** (editable inline), **Links**, and a **Session log** (newest first, with a "+ Log a session" textarea). Buttons: **Move to orbit** (disabled with an explanation when full), **Mark done**, **Drop with reason** (opens a dialog that requires a reason), **Park**.

### 3. Mobile

Orbit cards stack. Quick capture moves to the top. Columns become one stacked list.

## Starter data

When there are no HQ-tagged projects yet, the Orbit screen shows an **Add my starter projects** button. It creates these projects, skipping any whose name already exists:

| Name | Stage | Category | Next step |
|---|---|---|---|
| DevOps starter project | orbit | career | Work through the Claude Code prompts, typing the Docker commands yourself |
| soc-home-lab | orbit | portfolio | Trigger safe test events and write a one-page note per alert |
| noemo + Argus | next | portfolio | Deploy and add demo link + screenshots |
| duplo-style-payments-api | next | portfolio | Deploy on Render, add /health and /docs links |
| Ember & Mind channel | next | creative | Make the first long YouTube video |
| ihe-na-eme-mkpebi | parked | portfolio | Rate-limit /api/decide, add tests and a live link |
| agentforsocial_s | parked | portfolio | Rename to content-agent, add sample output |
| PORTFOLIO site | parked | portfolio | Reset admin password, add login rate limit |
| Managed security for SMEs | parked | career | Waits until soc-home-lab is solid |
| TradeMind | parked | portfolio | Merge into noemo |
| Content Scheduler for Reels | parked | portfolio | CLAUDE.md ready |
| saturn-pkm | done | portfolio | |
| javascript-fundamentals | done | portfolio | |

## Build phases

Each phase ends with `npm run check` passing, a commit, and a short `CONTEXT.md` and `CHANGELOG.md` entry.

### Phase 1: Model and rules
- [ ] `hq.js` with every rule above, plus `tests/unit/hq.test.js` (orbit limit, drop needs a reason, week limit, review dates, no mutation)
- [ ] Extend `normalizeProject` and `normalizeTask`, add schema v3 migration, and test that v2 data loads unchanged with defaults
- [ ] Persist and back up the `hq` settings; backup round-trip test

**Done when:** all unit tests pass and the existing app still works with old data.

### Phase 2: Orbit screen and project header
- [ ] Sidebar item and Orbit screen, sections 1–5
- [ ] Project header on the Planner view
- [ ] Drop dialog, Log session, Park idea, starter data button
- [ ] Playwright e2e: park an idea; a third orbit move is blocked; dropping without a reason is blocked; axe passes on the Orbit screen

**Done when:** I can run my real week from the Orbit screen on desktop and phone width.

### Phase 3: Learning tracks and reviews
- [ ] `tracks` collection (persistence, backup, sync, rules) and the Learning section
- [ ] Weekly review flow, and a Parked review prompt on the 1st of the month
- [ ] Update `docs/USAGE.md` with an "Orbit" section

### Phase 4 (optional, later)
- [ ] Show each project's GitHub repo link and last push date (read-only, from the public GitHub API, no token)

## How I want Claude Code to work

- Start in **plan mode**. Read the context files and propose the plan for the current phase before writing code.
- Work on a branch: `feat/saturn-hq`.
- One phase per session. Run `/clear` between phases.
- Explain each change in plain words. I'm learning, so tell me what each new function does and why.
- Ask before deleting anything or changing existing behaviour.
- At the end of each session, write a 3–5 line summary I can paste into the project's session log.

---

## Kickoff prompt (paste into Claude Code)

```
Read docs/hq-plan.md, CONTEXT.md, CODEX_CONTEXT.md and README.md.
We're building Saturn HQ inside this repo, starting with Phase 1 only (model and rules).
Use plan mode: show me your plan for Phase 1, including which files you'll change and the tests you'll add, and wait for my OK.
Then create the branch feat/saturn-hq, build Phase 1, run npm run check, and commit.
Explain what you did in plain words, and end with a short session summary I can paste into my log.
```
