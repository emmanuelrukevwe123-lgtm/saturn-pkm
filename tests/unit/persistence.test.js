import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../../src/lib/domain.js";
import { META_KEY, atomicWrite, migrateLegacyStorage, readNotebook, writeNotebook } from "../../src/lib/persistence.js";

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); this.failOn = null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { if (key === this.failOn) throw Object.assign(new Error("full"), { name: "QuotaExceededError" }); this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

const keys = { notes: "n", deletedNotes: "d", projects: "p", tasks: "t", hq: "h", tracks: "k" };

describe("versioned persistence", () => {
  it("migrates legacy arrays without removing their keys", () => {
    const storage = new MemoryStorage({ n: JSON.stringify([{ id: 1, title: "A", body: "", tags: [] }]) });
    const result = migrateLegacyStorage(storage, keys);
    expect(result.migrated).toBe(true);
    expect(result.state.notes[0].id).toBe(1);
    expect(storage.getItem("n")).not.toBeNull();
  });

  it("upgrades v2 data to v3 keeping every record and adding safe defaults", () => {
    const project = { id: "p1", name: "Old", created: "2026-01-01T00:00:00.000Z", updated: "2026-02-01T00:00:00.000Z" };
    const task = { id: "t1", projectId: "p1", title: "Old task", status: "doing", order: 2 };
    const storage = new MemoryStorage({
      n: JSON.stringify([{ id: 1, title: "A", body: "text", tags: ["x"] }]),
      p: JSON.stringify([project]),
      t: JSON.stringify([task]),
      [META_KEY]: JSON.stringify({ schemaVersion: 2 }),
    });
    const { state, migrated } = migrateLegacyStorage(storage, keys);
    expect(migrated).toBe(true);
    expect(state.notes[0]).toMatchObject({ id: 1, title: "A", body: "text", tags: ["x"] });
    expect(state.projects[0]).toMatchObject({
      ...project, stage: "next", category: "portfolio", nextStep: "", doneWhen: "", links: [], log: [],
      droppedReason: "", stageChangedAt: project.updated, doneAt: "",
    });
    expect(state.tasks[0]).toMatchObject({ ...task, thisWeek: false });
    expect(state.hq).toEqual({ lastReviewAt: "", lastParkedReviewAt: "", starterAddedAt: "" });
    expect(JSON.parse(storage.getItem(META_KEY)).schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(3);
  });

  it("keeps HQ settings across a write and read", () => {
    const storage = new MemoryStorage();
    const lastReviewAt = "2026-11-01T10:00:00.000Z";
    writeNotebook(storage, keys, { hq: { lastReviewAt } });
    expect(readNotebook(storage, keys).hq.lastReviewAt).toBe(lastReviewAt);
    expect(readNotebook(storage, keys).tracks).toEqual([]);
  });

  it("rolls every key back when one write fails", () => {
    const storage = new MemoryStorage({ a: "old-a", b: "old-b" });
    storage.failOn = "b";
    expect(() => atomicWrite(storage, [["a", "new-a"], ["b", "new-b"]])).toThrow(/storage is full/i);
    expect(storage.getItem("a")).toBe("old-a");
    expect(storage.getItem("b")).toBe("old-b");
  });
});
