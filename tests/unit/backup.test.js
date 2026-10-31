import { describe, expect, it } from "vitest";
import { createBackup, prepareImport, validateBackup } from "../../public/modules/backup.js";

const empty = { notes: [], deletedNotes: [], projects: [], tasks: [] };

describe("backup contract", () => {
  it("round-trips a valid versioned bundle", () => {
    const backup = createBackup({ appVersion: "v15", state: { ...empty, notes: [{ id: 1, title: "A", body: "", tags: [] }] } });
    expect(validateBackup(backup).valid).toBe(true);
    expect(prepareImport(empty, backup, "replace").notes[0].title).toBe("A");
  });

  it("round-trips every HQ field through export and replace", () => {
    const project = {
      id: "p", name: "HQ", updated: "2026-03-01T00:00:00.000Z", stage: "dropped", category: "career",
      nextStep: "Next", doneWhen: "Shipped", droppedReason: "Stuck", doneAt: "2026-02-01T00:00:00.000Z",
      stageChangedAt: "2026-02-02T00:00:00.000Z",
      links: [{ id: "l", label: "Repo", url: "https://example.com" }],
      log: [{ id: "e", date: "2026-02-03T00:00:00.000Z", text: "Did it" }],
    };
    const hq = { lastReviewAt: "2026-03-01T00:00:00.000Z", lastParkedReviewAt: "", starterAddedAt: "2026-01-01T00:00:00.000Z" };
    const track = { id: "tr", name: "AWS", role: "cert", progress: 40, nextStep: "Mock exam" };
    const backup = JSON.parse(JSON.stringify(createBackup({ appVersion: "v16", state: {
      ...empty, projects: [project], tasks: [{ id: "t", projectId: "p", thisWeek: true }], tracks: [track], hq,
    } })));
    const restored = prepareImport(empty, backup, "replace");
    expect(restored.projects[0]).toMatchObject(project);
    expect(restored.tasks[0].thisWeek).toBe(true);
    expect(restored.tracks[0]).toMatchObject(track);
    expect(restored.hq).toEqual(hq);
  });

  it("merges HQ dates by keeping the later one", () => {
    const current = { ...empty, hq: { lastReviewAt: "2026-03-01T00:00:00.000Z", lastParkedReviewAt: "" } };
    const backup = createBackup({ appVersion: "v16", state: { ...empty, hq: {
      lastReviewAt: "2026-02-01T00:00:00.000Z", lastParkedReviewAt: "2026-02-01T00:00:00.000Z",
    } } });
    expect(prepareImport(current, backup, "merge").hq).toMatchObject({
      lastReviewAt: "2026-03-01T00:00:00.000Z", lastParkedReviewAt: "2026-02-01T00:00:00.000Z",
    });
  });

  it("merges tracks by id, keeping the newer copy", () => {
    const current = { ...empty, tracks: [{ id: "a", name: "Old", updated: "2026-01-01T00:00:00.000Z" }] };
    const backup = createBackup({ appVersion: "v16", state: { ...empty, tracks: [
      { id: "a", name: "New", updated: "2026-02-01T00:00:00.000Z" }, { id: "b", name: "Added" },
    ] } });
    expect(prepareImport(current, backup, "merge").tracks.map((track) => track.name)).toEqual(["New", "Added"]);
  });

  it("still imports a v2 backup, adding defaults", () => {
    const v2 = {
      format: "saturn-backup", schemaVersion: 2, notes: [], deletedNotes: [], images: [],
      projects: [{ id: "p", name: "Old" }], tasks: [{ id: "t", projectId: "p" }],
    };
    expect(validateBackup(v2).valid).toBe(true);
    const restored = prepareImport(empty, v2, "replace");
    expect(restored.projects[0].stage).toBe("next");
    expect(restored.hq.lastReviewAt).toBe("");
  });

  it("rejects a backup whose hq is not an object", () => {
    const backup = createBackup({ appVersion: "v16", state: empty });
    expect(validateBackup({ ...backup, hq: [] }).valid).toBe(false);
    expect(validateBackup({ ...backup, tracks: {} }).valid).toBe(false);
  });

  it("rejects corrupt data before preparing mutation", () => {
    expect(validateBackup({ format: "saturn-backup", schemaVersion: 999 }).valid).toBe(false);
    expect(() => prepareImport(empty, { format: "wrong" }, "replace")).toThrow();
  });
});
