import { describe, expect, it } from "vitest";
import { createProject, createTask, deleteProject, deleteTask, moveTask, renameProject, tasksFor, updateTask } from "../../src/lib/planner.js";

const NOW = "2026-06-10T12:00:00.000Z";
const task = (id, status, order) => ({ id, projectId: "p", title: id, status, order, revision: 1 });
const base = () => Object.freeze({ projects: [{ id: "p", name: "P", revision: 1 }], tasks: [task("a", "todo", 0), task("b", "todo", 1), task("c", "done", 0)] });
const titles = (state, status) => tasksFor(state, "p", status).map((item) => item.id);

describe("projects", () => {
  it("creates and renames, stamping the edit", () => {
    const { state, project } = createProject({ projects: [], tasks: [] }, "New", { now: NOW });
    expect(project).toMatchObject({ name: "New", created: NOW });
    expect(renameProject(state, project.id, "Renamed", { now: NOW }).projects[0]).toMatchObject({ name: "Renamed", revision: 1 });
  });

  it("deleting tombstones the project and its tasks", () => {
    const next = deleteProject(base(), "p", { now: NOW });
    expect(next.projects[0].tombstone).toBe(true);
    expect(next.tasks.every((item) => item.tombstone && item.deletedAt === NOW)).toBe(true);
  });
});

describe("tasks", () => {
  it("adds to the end of its column", () => {
    expect(createTask(base(), "p", "todo", "New", { now: NOW }).tasks.at(-1)).toMatchObject({ title: "New", order: 2, status: "todo" });
  });

  it("updates only the named task", () => {
    const state = base();
    const next = updateTask(state, "a", { title: "Changed" }, { now: NOW });
    expect(next.tasks[0]).toMatchObject({ title: "Changed", updated: NOW, revision: 2 });
    expect(next.tasks[1]).toBe(state.tasks[1]);
  });

  it("deleting a task gives up its this-week slot", () => {
    const next = deleteTask({ ...base(), tasks: [{ ...task("a", "todo", 0), thisWeek: true }] }, "a", { now: NOW });
    expect(next.tasks[0]).toMatchObject({ tombstone: true, thisWeek: false });
  });

  it("reorders within a column", () => {
    expect(titles(moveTask(base(), "b", "todo", 0, { now: NOW }), "todo")).toEqual(["b", "a"]);
  });

  it("moves across columns and renumbers both", () => {
    const next = moveTask(base(), "a", "done", 0, { now: NOW });
    expect(titles(next, "done")).toEqual(["a", "c"]);
    expect(titles(next, "todo")).toEqual(["b"]);
    expect(next.tasks.find((item) => item.id === "b").order).toBe(0);
  });

  it("clamps an out-of-range position, including Infinity", () => {
    expect(titles(moveTask(base(), "a", "done", Infinity, { now: NOW }), "done")).toEqual(["c", "a"]);
    expect(titles(moveTask(base(), "b", "todo", -5, { now: NOW }), "todo")).toEqual(["b", "a"]);
  });

  it("refuses an unknown task and leaves its input alone", () => {
    const state = base();
    expect(moveTask(state, "zzz", "done", 0)).toEqual({ error: "not_found" });
    moveTask(state, "a", "done", 0, { now: NOW });
    expect(state.tasks[0].status).toBe("todo");
  });
});
