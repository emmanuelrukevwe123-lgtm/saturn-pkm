import { describe, expect, it, vi } from "vitest";
import { createStore } from "../../src/lib/store.js";

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); this.full = false; }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) {
    if (this.full) throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
    this.map.set(key, String(value));
  }
  removeItem(key) { this.map.delete(key); }
}

describe("notebook store", () => {
  it("seeds the welcome notes once, and not again after they're deleted", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    store.load();
    expect(store.getState().notes).toHaveLength(2);
    store.commit({ ...store.getState(), notes: [] });
    createStore(storage).load();
    const reloaded = createStore(storage);
    reloaded.load();
    expect(reloaded.getState().notes).toEqual([]);
  });

  it("doesn't seed over existing notes", () => {
    const storage = new MemoryStorage({ "saturn-pkm-notes": JSON.stringify([{ id: "a", title: "Mine", body: "", tags: [] }]) });
    const store = createStore(storage);
    store.load();
    expect(store.getState().notes.map((note) => note.title)).toEqual(["Mine"]);
  });

  it("can skip seeding for a notebook that will fill from the cloud", () => {
    const store = createStore(new MemoryStorage());
    store.load("uid", { seed: false });
    expect(store.getState().notes).toEqual([]);
  });

  it("a failed save leaves the screen matching what's on disk, and reports it", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    store.load();
    const before = store.getState();
    storage.full = true;
    expect(store.commit({ ...before, notes: [] })).toBe(false);
    expect(store.getState()).toBe(before);
    expect(store.getSnapshot().storageProblem).toMatch(/full/i);
    storage.full = false;
    expect(store.commit(before)).toBe(true);
    expect(store.getSnapshot().storageProblem).toBe("");
  });

  it("passes a rule's refusal back without writing", () => {
    const store = createStore(new MemoryStorage());
    store.load();
    const before = store.getState();
    expect(store.apply({ error: "orbit_full" })).toBe("orbit_full");
    expect(store.getState()).toBe(before);
  });

  it("keeps accounts' notebooks apart", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    store.load("alice", { seed: false });
    store.commit({ ...store.getState(), notes: [{ id: "a", title: "Alice's", body: "", tags: [] }] });
    store.load("bob", { seed: false });
    expect(store.getState().notes).toEqual([]);
    store.load("alice", { seed: false });
    expect(store.getState().notes[0].title).toBe("Alice's");
  });

  it("carries signed-out data to an account only when the account is empty", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    store.load();
    store.adoptLocalNotebook("alice");
    store.load("alice", { seed: false });
    expect(store.getState().notes).toHaveLength(2);
    store.commit({ ...store.getState(), notes: [{ id: "a", title: "Only", body: "", tags: [] }] });
    store.adoptLocalNotebook("alice");
    store.load("alice", { seed: false });
    expect(store.getState().notes.map((note) => note.title)).toEqual(["Only"]);
  });

  it("drops purged tombstones once their retention has passed", () => {
    const old = "2020-01-01T00:00:00.000Z";
    const storage = new MemoryStorage({
      "saturn-pkm-seeded": "1",
      "saturn-pkm-deleted-notes": JSON.stringify([
        { id: "gone", title: "x", body: "", tags: [], purged: true, tombstone: true, deletedAt: old },
        { id: "kept", title: "y", body: "", tags: [], tombstone: true, deletedAt: old },
      ]),
    });
    const store = createStore(storage);
    store.load();
    expect(store.getState().deletedNotes.map((note) => note.id)).toEqual(["kept"]);
  });

  it("tells the listener about commits, and whether other tabs should hear", () => {
    const store = createStore(new MemoryStorage());
    store.load();
    const listener = vi.fn();
    store.setCommitListener(listener);
    store.commit(store.getState(), { announce: false });
    expect(listener).toHaveBeenCalledWith({ announce: false, key: "saturn-pkm-notes" });
  });
});
