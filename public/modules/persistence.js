import { SCHEMA_VERSION, normalizeState } from "./domain.js";

export const BASE_KEYS = Object.freeze({
  notes: "saturn-pkm-notes",
  deletedNotes: "saturn-pkm-deleted-notes",
  projects: "saturn-pkm-planner-projects",
  tasks: "saturn-pkm-planner-tasks",
  hq: "saturn-pkm-hq",
  tracks: "saturn-pkm-tracks",
  theme: "saturn-pkm-theme",
});

export const META_KEY = "saturn-pkm-schema";

export function scopedKey(base, uid) {
  return uid ? `${base}:${uid}` : base;
}

export function notebookKeys(uid = "") {
  return {
    notes: scopedKey(BASE_KEYS.notes, uid),
    deletedNotes: scopedKey(BASE_KEYS.deletedNotes, uid),
    projects: scopedKey(BASE_KEYS.projects, uid),
    tasks: scopedKey(BASE_KEYS.tasks, uid),
    hq: scopedKey(BASE_KEYS.hq, uid),
    tracks: scopedKey(BASE_KEYS.tracks, uid),
  };
}

function readArray(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readObject(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function readNotebook(storage, keys) {
  return normalizeState({
    notes: readArray(storage, keys.notes),
    deletedNotes: readArray(storage, keys.deletedNotes),
    projects: readArray(storage, keys.projects),
    tasks: readArray(storage, keys.tasks),
    hq: readObject(storage, keys.hq),
    tracks: readArray(storage, keys.tracks),
  });
}

export function isQuotaError(error) {
  return error?.name === "QuotaExceededError" || error?.code === 22 || error?.code === 1014;
}

export function atomicWrite(storage, entries) {
  const snapshot = new Map(entries.map(([key]) => [key, storage.getItem(key)]));
  try {
    for (const [key, value] of entries) storage.setItem(key, value);
  } catch (error) {
    for (const [key, value] of snapshot) {
      try { value == null ? storage.removeItem(key) : storage.setItem(key, value); } catch { /* best effort */ }
    }
    const wrapped = new Error(isQuotaError(error)
      ? "Browser storage is full. Export a backup, then remove unused notes or site data."
      : "Saturn could not save your data. Export a backup before continuing.", { cause: error });
    wrapped.code = isQuotaError(error) ? "STORAGE_FULL" : "STORAGE_WRITE_FAILED";
    throw wrapped;
  }
}

export function writeNotebook(storage, keys, state) {
  const normalized = normalizeState(state);
  atomicWrite(storage, [
    [keys.notes, JSON.stringify(normalized.notes)],
    [keys.deletedNotes, JSON.stringify(normalized.deletedNotes)],
    [keys.projects, JSON.stringify(normalized.projects)],
    [keys.tasks, JSON.stringify(normalized.tasks)],
    [keys.hq, JSON.stringify(normalized.hq)],
    [keys.tracks, JSON.stringify(normalized.tracks)],
    [META_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, migratedAt: new Date().toISOString() })],
  ]);
  return normalized;
}

export function migrateLegacyStorage(storage, keys) {
  let meta = null;
  try { meta = JSON.parse(storage.getItem(META_KEY)); } catch { /* migrate */ }
  const state = readNotebook(storage, keys);
  if (meta?.schemaVersion === SCHEMA_VERSION) return { state, migrated: false };
  // The legacy keys are deliberately retained. Writes happen transactionally;
  // the schema marker is only written after all normalized data is durable.
  return { state: writeNotebook(storage, keys, state), migrated: true };
}
