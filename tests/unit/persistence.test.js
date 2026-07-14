import { describe, expect, it } from "vitest";
import { atomicWrite, migrateLegacyStorage } from "../../public/modules/persistence.js";

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); this.failOn = null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { if (key === this.failOn) throw Object.assign(new Error("full"), { name: "QuotaExceededError" }); this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

const keys = { notes: "n", deletedNotes: "d", projects: "p", tasks: "t" };

describe("versioned persistence", () => {
  it("migrates legacy arrays without removing their keys", () => {
    const storage = new MemoryStorage({ n: JSON.stringify([{ id: 1, title: "A", body: "", tags: [] }]) });
    const result = migrateLegacyStorage(storage, keys);
    expect(result.migrated).toBe(true);
    expect(result.state.notes[0].id).toBe(1);
    expect(storage.getItem("n")).not.toBeNull();
  });

  it("rolls every key back when one write fails", () => {
    const storage = new MemoryStorage({ a: "old-a", b: "old-b" });
    storage.failOn = "b";
    expect(() => atomicWrite(storage, [["a", "new-a"], ["b", "new-b"]])).toThrow(/storage is full/i);
    expect(storage.getItem("a")).toBe("old-a");
    expect(storage.getItem("b")).toBe("old-b");
  });
});
