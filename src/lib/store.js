import { newId, normalizeState } from "./domain.js";
import { migrateLegacyStorage, notebookKeys, readNotebook, writeNotebook } from "./persistence.js";
import { starterNotes } from "./notes.js";
import { tombstoneExpired } from "./cloud-sync.js";

/* The notebook store: one snapshot of state that React subscribes to. A change
   is applied only after it's safely written, so a failed save (full storage)
   leaves the screen matching what's actually on disk. */

const DEVICE_KEY = "saturn-pkm-device-id";
const SEEDED_KEY = "saturn-pkm-seeded";

export function createStore(storage) {
  const listeners = new Set();
  let keys = notebookKeys("");
  let uid = "";
  let snapshot = { state: normalizeState({}), storageProblem: "" };
  let onCommit = () => {};

  const set = (patch) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };

  function deviceId() {
    let id = storage.getItem(DEVICE_KEY);
    if (!id) {
      id = newId();
      try { storage.setItem(DEVICE_KEY, id); } catch { /* the next save reports full storage */ }
    }
    return id;
  }

  function commit(next, { announce = true } = {}) {
    try {
      set({ state: writeNotebook(storage, keys, next), storageProblem: "" });
      onCommit({ announce, key: keys.notes });
      return true;
    } catch (error) {
      set({ storageProblem: error.message });
      return false;
    }
  }

  function seededKey() {
    return uid ? `${SEEDED_KEY}:${uid}` : SEEDED_KEY;
  }

  // Seeds once per notebook: someone who deletes every note shouldn't find the
  // welcome notes back on their next visit.
  function seedOnce(state, allowSeed) {
    if (storage.getItem(seededKey())) return state;
    try { storage.setItem(seededKey(), "1"); } catch { /* retried next load */ }
    return allowSeed && !state.notes.length && !state.deletedNotes.length ? { ...state, notes: starterNotes() } : null;
  }

  function load(nextUid = "", { seed = true } = {}) {
    uid = nextUid;
    keys = notebookKeys(uid);
    const { state } = migrateLegacyStorage(storage, keys);
    const cleaned = {
      ...state,
      deletedNotes: state.deletedNotes.filter((note) => !(note.purged && tombstoneExpired(note))),
    };
    const seeded = seedOnce(cleaned, seed);
    if (seeded && seeded !== cleaned) {
      commit(seeded, { announce: false });
    } else {
      set({ state: cleaned });
    }
  }

  // Signed-out records carry over to an account's empty notebook the first time.
  function adoptLocalNotebook(nextUid) {
    const local = notebookKeys("");
    const target = notebookKeys(nextUid);
    for (const name of Object.keys(local)) {
      const value = storage.getItem(local[name]);
      if (!storage.getItem(target[name]) && value && value !== "[]" && value !== "{}") {
        try { storage.setItem(target[name], value); } catch { /* the account starts empty instead */ }
      }
    }
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    getState: () => snapshot.state,
    getUid: () => uid,
    keys: () => keys,
    deviceId,
    load,
    adoptLocalNotebook,
    commit,
    setCommitListener(listener) { onCommit = listener; },
    // State another tab already wrote: shown as is, with nothing to save.
    adopt(state) { set({ state, storageProblem: "" }); },
    readExternal: () => readNotebook(storage, keys),
    // Applies a rule's result: { error } changes nothing and is passed back.
    apply(result, options) {
      if (result?.error) return result.error;
      return commit(result, options) ? null : "storage_failed";
    },
    withDevice: () => ({ deviceId: deviceId() }),
  };
}
