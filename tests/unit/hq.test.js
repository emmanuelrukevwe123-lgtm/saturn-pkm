import { describe, expect, it } from "vitest";
import { normalizeState } from "../../public/modules/domain.js";
import {
  MAX_ORBIT, STARTER_PROJECTS, activeTracks, addLink, addLogEntry, addStarterProjects, addTrack, canMoveToOrbit,
  clearFinishedThisWeek, removeTrack, updateTrack,
  markReviewed, moveStage, orbitProjects, parkIdea, parkedReviewDue, projectProgress, removeLink, reviewDue,
  reviewStatus, setThisWeek, thisWeekTasks, updateProjectDetails,
} from "../../public/modules/hq.js";

const NOW = "2026-06-10T12:00:00.000Z";

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Frozen on purpose: any rule that tries to mutate its input throws in a module.
function stateWith({ projects = [], tasks = [], tracks = [], hq } = {}) {
  return deepFreeze(normalizeState({ projects, tasks, tracks, hq }));
}

const project = (id, stage = "next", extra = {}) => ({ id, name: `Project ${id}`, stage, updated: "2026-01-01T00:00:00.000Z", ...extra });
const task = (id, extra = {}) => ({ id, projectId: "p", title: `Task ${id}`, ...extra });

describe("orbit limit", () => {
  it("allows up to two projects", () => {
    expect(MAX_ORBIT).toBe(2);
    expect(canMoveToOrbit(stateWith({ projects: [project("a", "orbit")] }))).toBe(true);
    expect(canMoveToOrbit(stateWith({ projects: [project("a", "orbit"), project("b", "orbit")] }))).toBe(false);
  });

  it("refuses a third project", () => {
    const state = stateWith({ projects: [project("a", "orbit"), project("b", "orbit"), project("c")] });
    expect(moveStage(state, "c", "orbit")).toEqual({ error: "orbit_full" });
  });

  it("treats a move to the stage it's already in as a no-op, even when full", () => {
    const state = stateWith({ projects: [project("a", "orbit"), project("b", "orbit")] });
    expect(moveStage(state, "a", "orbit")).toBe(state);
  });

  it("ignores deleted projects", () => {
    const state = stateWith({ projects: [project("a", "orbit", { tombstone: true }), project("b", "orbit"), project("c")] });
    expect(orbitProjects(state).map((item) => item.id)).toEqual(["b"]);
    expect(moveStage(state, "c", "orbit").error).toBeUndefined();
  });

  it("stays blocked while a merge has left more than two in orbit, without moving any", () => {
    const state = stateWith({ projects: [project("a", "orbit"), project("b", "orbit"), project("c", "orbit"), project("d")] });
    expect(orbitProjects(state)).toHaveLength(3);
    expect(moveStage(state, "d", "orbit")).toEqual({ error: "orbit_full" });
  });
});

describe("moveStage", () => {
  const state = stateWith({ projects: [project("a", "orbit", { revision: 4 }), project("b")] });

  it("needs a real reason to drop", () => {
    expect(moveStage(state, "a", "dropped")).toEqual({ error: "reason_required" });
    expect(moveStage(state, "a", "dropped", { reason: "   " })).toEqual({ error: "reason_required" });
  });

  it("records the trimmed reason when dropping", () => {
    const next = moveStage(state, "a", "dropped", { reason: "  Stuck ", now: NOW });
    expect(next.projects[0]).toMatchObject({ stage: "dropped", droppedReason: "Stuck", stageChangedAt: NOW });
  });

  it("sets doneAt for done, and stamps the record for merge and sync", () => {
    const next = moveStage(state, "a", "done", { now: NOW, deviceId: "dev" });
    expect(next.projects[0]).toMatchObject({
      stage: "done", doneAt: NOW, updated: NOW, revision: 5, baseRevision: 4, deviceId: "dev",
    });
  });

  it("clears the markers when a project leaves done or dropped", () => {
    const done = moveStage(state, "a", "done", { now: NOW });
    expect(moveStage(done, "a", "next", { now: NOW }).projects[0].doneAt).toBe("");
    const dropped = moveStage(state, "a", "dropped", { reason: "x", now: NOW });
    expect(moveStage(dropped, "a", "parked", { now: NOW }).projects[0].droppedReason).toBe("");
  });

  it("refuses unknown projects and stages", () => {
    expect(moveStage(state, "zzz", "next")).toEqual({ error: "not_found" });
    expect(moveStage(state, "a", "nope")).toEqual({ error: "invalid_stage" });
  });

  it("leaves its input untouched and other records identical", () => {
    const next = moveStage(state, "a", "next", { now: NOW });
    expect(state.projects[0].stage).toBe("orbit");
    expect(next.projects[1]).toBe(state.projects[1]);
  });
});

describe("parkIdea", () => {
  it("creates a parked project", () => {
    const next = parkIdea(stateWith(), { name: "  New thing ", category: "creative", now: NOW });
    expect(next.projects[0]).toMatchObject({ name: "New thing", stage: "parked", category: "creative", stageChangedAt: NOW });
  });

  it("rejects an empty name", () => {
    expect(parkIdea(stateWith(), { name: "   " })).toEqual({ error: "empty_name" });
  });

  it("falls back to the default category", () => {
    expect(parkIdea(stateWith(), { name: "X", category: "nope" }).projects[0].category).toBe("portfolio");
  });
});

describe("projectProgress", () => {
  it("counts that project's live tasks", () => {
    const state = stateWith({
      projects: [project("p"), project("q")],
      tasks: [
        task(1, { status: "done" }), task(2), task(3, { status: "doing" }),
        task(4, { status: "done", tombstone: true }), task(5, { projectId: "q", status: "done" }),
      ],
    });
    expect(projectProgress(state, "p")).toEqual({ done: 1, total: 3 });
    expect(projectProgress(state, "none")).toEqual({ done: 0, total: 0 });
  });
});

describe("this week's tasks", () => {
  const three = stateWith({
    projects: [project("p")],
    tasks: [task(1, { thisWeek: true }), task(2, { thisWeek: true }), task(3, { thisWeek: true, status: "done" }), task(4)],
  });

  it("refuses a fourth task, counting finished ones", () => {
    expect(setThisWeek(three, 4, true)).toEqual({ error: "week_full" });
  });

  it("frees a slot when a task is unticked", () => {
    const next = setThisWeek(three, 1, false, { now: NOW });
    expect(thisWeekTasks(next)).toHaveLength(2);
    expect(setThisWeek(next, 4, true, { now: NOW }).error).toBeUndefined();
    expect(three.tasks[0].thisWeek).toBe(true);
  });

  it("doesn't count deleted tasks", () => {
    const state = stateWith({
      projects: [project("p")],
      tasks: [task(1, { thisWeek: true, tombstone: true }), task(2, { thisWeek: true }), task(3, { thisWeek: true }), task(4)],
    });
    expect(setThisWeek(state, 4, true).error).toBeUndefined();
  });

  it("the review clears only finished tasks", () => {
    expect(thisWeekTasks(clearFinishedThisWeek(three, { now: NOW })).map((item) => item.id)).toEqual([1, 2]);
  });
});

describe("addLogEntry", () => {
  const state = stateWith({ projects: [project("a", "orbit", { log: [{ id: "old", date: "2026-01-01T00:00:00.000Z", text: "Old" }] })] });

  it("puts the trimmed entry first", () => {
    const next = addLogEntry(state, "a", "  New  ", NOW);
    expect(next.projects[0].log.map((entry) => entry.text)).toEqual(["New", "Old"]);
    expect(next.projects[0].log[0].date).toBe(NOW);
    expect(next.projects[0].updated).toBe(NOW);
  });

  it("rejects empty text", () => {
    expect(addLogEntry(state, "a", "   ", NOW)).toEqual({ error: "empty_text" });
  });
});

describe("project details and links", () => {
  const state = stateWith({ projects: [project("a")] });

  it("edits the next step and leaves the record alone when nothing changed", () => {
    const next = updateProjectDetails(state, "a", { nextStep: " Ship it " }, { now: NOW });
    expect(next.projects[0]).toMatchObject({ nextStep: "Ship it", updated: NOW });
    expect(updateProjectDetails(next, "a", { nextStep: "Ship it" })).toBe(next);
  });

  it("refuses links that aren't http or https", () => {
    expect(addLink(state, "a", { url: "javascript:alert(1)" })).toEqual({ error: "invalid_url" });
    expect(addLink(state, "a", { url: "" })).toEqual({ error: "invalid_url" });
  });

  it("adds and removes a link, using the url when there's no label", () => {
    const added = addLink(state, "a", { url: "https://example.com" }, { now: NOW });
    const [link] = added.projects[0].links;
    expect(link).toMatchObject({ label: "https://example.com", url: "https://example.com" });
    expect(removeLink(added, "a", link.id, { now: NOW }).projects[0].links).toEqual([]);
  });
});

describe("starter projects", () => {
  it("creates all of them and remembers it was done", () => {
    const next = addStarterProjects(stateWith(), { now: NOW });
    expect(next.projects).toHaveLength(STARTER_PROJECTS.length);
    expect(next.hq.starterAddedAt).toBe(NOW);
    expect(orbitProjects(next)).toHaveLength(2);
    expect(next.projects.find((item) => item.name === "saturn-pkm")).toMatchObject({ stage: "done", doneAt: NOW });
  });

  it("skips names that exist, whatever the case, and leaves those projects alone", () => {
    const state = stateWith({ projects: [project("x", "parked", { name: "SOC-Home-Lab" })] });
    const next = addStarterProjects(state, { now: NOW });
    expect(next.projects).toHaveLength(STARTER_PROJECTS.length);
    expect(next.projects[0]).toBe(state.projects[0]);
  });

  it("never overfills orbit", () => {
    const state = stateWith({ projects: [project("a", "orbit"), project("b", "orbit")] });
    const next = addStarterProjects(state, { now: NOW });
    expect(orbitProjects(next).map((item) => item.id)).toEqual(["a", "b"]);
    expect(next.projects.find((item) => item.name === "soc-home-lab").stage).toBe("next");
  });
});

// Local-time dates, because the rules count the user's own calendar days.
// 1 November 2026 is a Sunday.
const local = (month, day, hour = 12) => new Date(2026, month - 1, day, hour);

describe("reviewDue", () => {
  const reviewedOn = (date) => ({ lastReviewAt: date.toISOString() });

  it("is due when there has never been a review", () => {
    expect(reviewDue({}, local(11, 4))).toBe(true);
  });

  it("is due the Sunday after a Sunday review, whatever the time of day", () => {
    expect(local(11, 8).getDay()).toBe(0);
    expect(reviewDue(reviewedOn(local(11, 1, 22)), local(11, 8, 7))).toBe(true);
  });

  it("isn't due the Sunday after a Monday review, then is the next Monday", () => {
    const monday = reviewedOn(local(11, 2));
    expect(reviewDue(monday, local(11, 8))).toBe(false);
    expect(reviewDue(monday, local(11, 9))).toBe(true);
  });

  it("isn't due the day after a review", () => {
    expect(reviewDue(reviewedOn(local(10, 31)), local(11, 1))).toBe(false);
  });

  it("is due once 7 or more days have passed", () => {
    expect(reviewDue(reviewedOn(local(10, 1)), local(10, 21))).toBe(true);
  });
});

describe("reviewStatus", () => {
  it("names each state for the review card", () => {
    expect(reviewStatus({}, local(11, 4))).toBe("due_sunday");
    expect(reviewStatus({}, local(11, 8))).toBe("due_today");
    expect(reviewStatus({ lastReviewAt: local(11, 2).toISOString() }, local(11, 4))).toBe("done");
    expect(reviewStatus({ lastReviewAt: local(10, 1).toISOString() }, local(11, 4))).toBe("overdue");
    expect(reviewStatus({ lastReviewAt: local(11, 1).toISOString() }, local(11, 8))).toBe("due_today");
  });
});

describe("parkedReviewDue", () => {
  it("is due when never done", () => {
    expect(parkedReviewDue({}, local(11, 15))).toBe(true);
  });

  it("isn't due again in the same month", () => {
    expect(parkedReviewDue({ lastParkedReviewAt: local(11, 1).toISOString() }, local(11, 30))).toBe(false);
  });

  it("is due from the 1st of the next month, and across a new year", () => {
    expect(parkedReviewDue({ lastParkedReviewAt: local(10, 31).toISOString() }, local(11, 1))).toBe(true);
    expect(parkedReviewDue({ lastParkedReviewAt: new Date(2026, 10, 20).toISOString() }, new Date(2027, 10, 5))).toBe(true);
  });
});

describe("learning tracks", () => {
  const state = stateWith({ tracks: [{ id: "a", name: "AWS", role: "cert", progress: 10, revision: 2 }] });

  it("adds a track and rejects an empty name", () => {
    const next = addTrack(stateWith(), { name: " Linux ", role: "support", now: NOW });
    expect(next.tracks[0]).toMatchObject({ name: "Linux", role: "support", progress: 0, created: NOW });
    expect(addTrack(stateWith(), { name: " " })).toEqual({ error: "empty_name" });
  });

  it("keeps progress between 0 and 100 and stamps the edit", () => {
    expect(updateTrack(state, "a", { progress: 150 }, { now: NOW }).tracks[0]).toMatchObject({ progress: 100, updated: NOW, revision: 3 });
    expect(updateTrack(state, "a", { progress: -5 }, { now: NOW }).tracks[0].progress).toBe(0);
    expect(state.tracks[0].progress).toBe(10);
  });

  it("removes with a tombstone, so it can't be edited afterwards", () => {
    const next = removeTrack(state, "a", { now: NOW });
    expect(activeTracks(next)).toEqual([]);
    expect(next.tracks[0]).toMatchObject({ tombstone: true, deletedAt: NOW });
    expect(updateTrack(next, "a", { progress: 1 })).toEqual({ error: "not_found" });
  });
});

describe("markReviewed", () => {
  it("sets only the named date", () => {
    const state = stateWith({ hq: { lastParkedReviewAt: "2026-01-01T00:00:00.000Z" } });
    expect(markReviewed(state, "lastReviewAt", NOW).hq).toMatchObject({ lastReviewAt: NOW, lastParkedReviewAt: "2026-01-01T00:00:00.000Z" });
    expect(state.hq.lastReviewAt).toBe("");
  });
});
