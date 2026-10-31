import { beforeEach, describe, expect, it } from "vitest";
import { createCloudSync } from "../../src/lib/cloud-client.js";
import { createStore } from "../../src/lib/store.js";

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

// An in-memory stand-in for the Firestore calls the sync layer makes.
function fakeFirestore(seed = {}) {
  const docs = new Map(Object.entries(seed));
  return {
    docs,
    db: {},
    doc: (_db, ...path) => path.join("/"),
    collection: (_db, ...path) => path.join("/"),
    serverTimestamp: () => "server-time",
    setDoc: async (path, data) => { docs.set(path, JSON.parse(JSON.stringify(data))); },
    getDocs: async (path) => ({
      forEach(callback) {
        for (const [key, data] of docs) {
          if (key.startsWith(`${path}/`)) callback({ id: key.split("/").pop(), data: () => data });
        }
      },
    }),
  };
}

const user = { uid: "alice" };
const UPDATED = "2026-06-01T00:00:00.000Z";

describe("cloud sync", () => {
  let store;

  beforeEach(() => {
    store = createStore(new MemoryStorage());
    store.load("alice", { seed: false });
  });

  function sync(api) {
    const statuses = [];
    const client = createCloudSync({ store, api, isOnline: () => true, onStatus: (status) => statuses.push(status) });
    return { client, statuses };
  }

  it("pushes every collection, including tracks, under the user's own path", async () => {
    const api = fakeFirestore();
    const { client, statuses } = sync(api);
    await client.start(user);
    store.commit({
      ...store.getState(),
      notes: [{ id: "n", title: "N", body: "", tags: [], updated: UPDATED }],
      projects: [{ id: "p", name: "P", stage: "orbit", nextStep: "Go", log: [{ id: "e", date: UPDATED, text: "Did" }], updated: UPDATED }],
      tasks: [{ id: "t", projectId: "p", title: "T", thisWeek: true, updated: UPDATED }],
      tracks: [{ id: "k", name: "AWS", progress: 40, updated: UPDATED }],
    });
    await client.push();
    expect(statuses.at(-1)).toBe("synced");
    expect([...api.docs.keys()].every((key) => key.startsWith("users/alice/"))).toBe(true);
    expect(api.docs.get("users/alice/projects/p")).toMatchObject({ stage: "orbit", nextStep: "Go", type: "project" });
    expect(api.docs.get("users/alice/projects/p").log[0].text).toBe("Did");
    expect(api.docs.get("users/alice/tasks/t").thisWeek).toBe(true);
    expect(api.docs.get("users/alice/tracks/k")).toMatchObject({ name: "AWS", progress: 40, type: "track" });
  });

  it("pulls records from another device, tracks included, normalized", async () => {
    const api = fakeFirestore({
      "users/alice/notes/n": { id: "n", title: "Remote", body: "", tags: [], updated: UPDATED },
      "users/alice/tracks/k": { id: "k", name: "AWS", progress: 400, updated: UPDATED },
      "users/alice/projects/p": { id: "p", name: "P", links: [{ url: "javascript:alert(1)" }], updated: UPDATED },
    });
    const { client } = sync(api);
    await client.start(user);
    const state = store.getState();
    expect(state.notes[0].title).toBe("Remote");
    expect(state.tracks[0].progress).toBe(100);
    expect(state.projects[0].links).toEqual([]);
  });

  it("ignores cloud documents with no id", async () => {
    const { client } = sync(fakeFirestore({ "users/alice/notes/x": { title: "No id" } }));
    await client.start(user);
    expect(store.getState().notes).toEqual([]);
  });

  it("files a remote deletion in the bin, not the notebook", async () => {
    const recent = new Date().toISOString();
    const api = fakeFirestore({
      "users/alice/notes/n": { id: "n", title: "N", body: "", tags: [], updated: recent, deletedAt: recent, tombstone: true },
    });
    const { client } = sync(api);
    await client.start(user);
    expect(store.getState().notes).toEqual([]);
    expect(store.getState().deletedNotes[0].id).toBe("n");
  });

  it("only re-sends records that changed", async () => {
    const api = fakeFirestore();
    const writes = [];
    const setDoc = api.setDoc;
    api.setDoc = (path, data) => { writes.push(path); return setDoc(path, data); };
    const { client } = sync(api);
    await client.start(user);
    store.commit({ ...store.getState(), tracks: [{ id: "k", name: "AWS", updated: UPDATED }] });
    await client.push();
    writes.length = 0;
    await client.push();
    expect(writes).toEqual([]);
  });

  it("stops retrying when the rules refuse access", async () => {
    const api = fakeFirestore();
    api.getDocs = async () => { throw Object.assign(new Error("denied"), { code: "permission-denied" }); };
    const { client, statuses } = sync(api);
    await client.start(user);
    expect(statuses.at(-1)).toBe("unavailable");
    await client.push();
    expect(statuses.at(-1)).toBe("unavailable");
  });

  it("reports offline as pending", async () => {
    const statuses = [];
    const client = createCloudSync({ store, api: fakeFirestore(), isOnline: () => false, onStatus: (status) => statuses.push(status) });
    await client.start(user);
    expect(statuses.at(-1)).toBe("pending");
  });
});
