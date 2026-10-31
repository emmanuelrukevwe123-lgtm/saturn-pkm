import { mergeSyncCollection, syncRecord, tombstoneExpired } from "./cloud-sync.js";
import { imageIdsIn } from "./notes.js";

/* Local storage stays the source of truth; this is a write-through layer under
   users/<uid>: pull and merge on sign-in and tab focus, debounced push on save. */

const PUSH_DELAY_MS = 1500;
const ROUND_TIMEOUT_MS = 15_000;
const IMAGE_TIMEOUT_MS = 30_000;
const COLLECTIONS = [["notes", "note"], ["projects", "project"], ["tasks", "task"], ["tracks", "track"]];

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("cloud sync timed out")), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function stampOf(record) {
  return record.deletedAt || record.updated || record.created || "";
}

async function hashBlob(blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function mergeCloud(state, cloud) {
  const localNotes = [
    ...state.notes.map((note) => ({ ...note, tombstone: false })),
    ...state.deletedNotes.map((note) => ({ ...note, tombstone: true })),
  ];
  const countIds = (a, b) => new Set([...a, ...b].map((record) => String(record.id))).size;
  const notes = mergeSyncCollection(localNotes, cloud.notes, "note");
  const tasks = mergeSyncCollection(state.tasks, cloud.tasks, "task");
  const isDeleted = (note) => note.tombstone || note.deletedAt;
  return {
    state: {
      ...state,
      notes: notes.filter((note) => !isDeleted(note)).sort((a, b) => ((a.created || "") < (b.created || "") ? -1 : 1)),
      deletedNotes: notes.filter(isDeleted).filter((note) => !(note.purged && tombstoneExpired(note))),
      projects: mergeSyncCollection(state.projects, cloud.projects, "project"),
      tasks,
      tracks: mergeSyncCollection(state.tracks, cloud.tracks, "track"),
    },
    conflict: notes.length > countIds(localNotes, cloud.notes) || tasks.length > countIds(state.tasks, cloud.tasks),
  };
}

export function createCloudSync({ store, api, imageApi = null, images = null, onStatus = () => {}, isOnline = () => navigator.onLine }) {
  let user = null;
  let status = "off";
  let stamps = {};
  let timer = null;
  let lastPull = 0;

  const setStatus = (next) => { status = next; onStatus(next); };
  const ready = () => !!user && status !== "unavailable";
  const docRef = (kind, id) => api.doc(api.db, "users", user.uid, kind, String(id));

  function fail(error) {
    const message = String(error?.message || error);
    // The database or rules aren't set up: stop retrying for this session.
    setStatus(error?.code === "permission-denied" || /not.*(enabled|exist)|precondition/i.test(message) ? "unavailable" : "error");
  }

  async function syncImages() {
    if (!imageApi || !images) return;
    const state = store.getState();
    const referenced = imageIdsIn([...state.notes, ...state.deletedNotes]);
    const local = new Map((await images.allImages()).map((record) => [String(record.id), record]));
    const snapshot = await api.getDocs(api.collection(api.db, "users", user.uid, "images"));
    const metadata = new Map();
    snapshot.forEach((entry) => metadata.set(String(entry.id), entry.data()));
    for (const id of referenced) {
      const path = `users/${user.uid}/images/${id}`;
      const record = local.get(id);
      if (record) {
        const hash = await hashBlob(record.blob);
        if (metadata.get(id)?.hash === hash) continue;
        const contentType = record.blob.type || "image/jpeg";
        await imageApi.uploadBytes(imageApi.ref(imageApi.storage, path), record.blob, { contentType, customMetadata: { hash } });
        await api.setDoc(docRef("images", id), {
          id, hash, size: record.blob.size, contentType, deviceId: store.deviceId(), updatedAt: api.serverTimestamp(), path,
        });
      } else if (metadata.has(id)) {
        const blob = await imageApi.getBlob(imageApi.ref(imageApi.storage, path));
        await images.putImages([{ id, blob, created: new Date().toISOString() }]);
      }
    }
  }

  async function push() {
    timer = null;
    if (!ready()) return;
    if (!isOnline()) { setStatus("pending"); return; }
    setStatus("syncing");
    try {
      const state = store.getState();
      const lists = { notes: [...state.notes, ...state.deletedNotes], projects: state.projects, tasks: state.tasks, tracks: state.tracks };
      const jobs = [];
      for (const [kind, type] of COLLECTIONS) {
        for (const record of lists[kind]) {
          const key = String(record.id);
          const stamp = stampOf(record);
          const seen = stamps[kind];
          if (seen.get(key) === stamp) continue;
          const doc = syncRecord(record, {
            type, tombstone: !!record.tombstone || !!record.deletedAt, deviceId: store.deviceId(), serverTimestamp: api.serverTimestamp(),
          });
          jobs.push(api.setDoc(docRef(kind, key), doc).then(() => seen.set(key, stamp)));
        }
      }
      await withTimeout(Promise.all(jobs), ROUND_TIMEOUT_MS);
      await withTimeout(syncImages(), IMAGE_TIMEOUT_MS);
      setStatus("synced");
    } catch (error) {
      fail(error);
    }
  }

  async function pull() {
    if (!ready()) return;
    if (!isOnline()) { setStatus("pending"); return; }
    setStatus("syncing");
    const uid = user.uid;
    try {
      const fetchAll = async (kind) => {
        const snapshot = await api.getDocs(api.collection(api.db, "users", uid, kind));
        const records = [];
        snapshot.forEach((entry) => {
          const data = entry.data();
          if (data && typeof data === "object" && data.id != null) records.push(data);
        });
        return records;
      };
      const [notes, projects, tasks, tracks] = await withTimeout(
        Promise.all(COLLECTIONS.map(([kind]) => fetchAll(kind))), ROUND_TIMEOUT_MS);
      if (user?.uid !== uid) return; // signed out while the pull was in flight
      const cloud = { notes: notes.filter((record) => !tombstoneExpired(record)), projects, tasks, tracks };
      stamps = Object.fromEntries(COLLECTIONS.map(([kind]) => [kind, new Map(cloud[kind].map((record) => [String(record.id), stampOf(record)]))]));
      const { state, conflict } = mergeCloud(store.getState(), cloud);
      lastPull = Date.now();
      store.commit(state);
      setStatus(conflict ? "conflict" : "synced");
    } catch (error) {
      fail(error);
    }
  }

  return {
    start(nextUser) {
      user = nextUser;
      stamps = Object.fromEntries(COLLECTIONS.map(([kind]) => [kind, new Map()]));
      setStatus("off");
      return pull();
    },
    stop() {
      user = null;
      clearTimeout(timer);
      timer = null;
      stamps = {};
      setStatus("off");
    },
    schedulePush() {
      if (!ready()) return;
      clearTimeout(timer);
      timer = setTimeout(push, PUSH_DELAY_MS);
    },
    push,
    pull,
    pullIfStale() {
      if (ready() && Date.now() - lastPull > 30_000) return pull();
      return undefined;
    },
    flush() { if (timer) push(); },
    getStatus: () => status,
  };
}
