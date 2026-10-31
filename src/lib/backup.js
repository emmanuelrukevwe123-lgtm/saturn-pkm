import { BACKUP_FORMAT, SCHEMA_VERSION, dedupeTitles, newId, normalizeHq, normalizeState, uniqueTitle } from "./domain.js";

export const MAX_BACKUP_BYTES = 500 * 1024 * 1024;
const MAX_RECORDS = 100_000;
const IMAGE_ID = /^[\w-]+$/;
const IMAGE_TYPE = /^image\/[-\w.+]+$/;
const MAX_STRING = 2_000_000;

function validId(value) {
  return typeof value === "string" || typeof value === "number";
}

function validString(value, max = MAX_STRING) {
  return typeof value === "string" && value.length <= max;
}

export function validateBackup(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) errors.push("Backup must be a JSON object.");
  if (input?.format !== BACKUP_FORMAT) errors.push("This is not a Saturn backup.");
  if (!Number.isInteger(input?.schemaVersion) || input.schemaVersion < 1 || input.schemaVersion > SCHEMA_VERSION)
    errors.push("Backup schema version is incompatible.");
  for (const key of ["notes", "deletedNotes", "projects", "tasks", "images"]) {
    if (!Array.isArray(input?.[key])) errors.push(`${key} must be an array.`);
    else if (input[key].length > MAX_RECORDS) errors.push(`${key} contains too many records.`);
  }
  // Added in schema v3, so older backups legitimately omit these.
  if (input?.tracks != null && !Array.isArray(input.tracks)) errors.push("tracks must be an array.");
  else if (input?.tracks?.length > MAX_RECORDS) errors.push("tracks contains too many records.");
  if (input?.hq != null && (typeof input.hq !== "object" || Array.isArray(input.hq))) errors.push("hq must be an object.");
  for (const note of [...(input?.notes || []), ...(input?.deletedNotes || [])]) {
    if (!validId(note?.id) || !validString(note?.title, 500) || !validString(note?.body)) errors.push("A note is invalid or too large.");
  }
  for (const record of [...(input?.projects || []), ...(input?.tasks || []), ...(Array.isArray(input?.tracks) ? input.tracks : [])]) {
    if (!validId(record?.id)) errors.push("A project, task or track has an invalid id.");
  }
  for (const image of input?.images || []) {
    if (!IMAGE_ID.test(String(image?.id)) || !validString(image?.data, 20_000_000) || !IMAGE_TYPE.test(image?.type || ""))
      errors.push("An image record is invalid or too large.");
  }
  return { valid: errors.length === 0, errors };
}

export function createBackup({ appVersion, notebook, state, images = [], settings = {} }) {
  const clean = normalizeState(state);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    notebook: notebook || { scope: "local" },
    notes: clean.notes,
    deletedNotes: clean.deletedNotes,
    projects: clean.projects,
    tasks: clean.tasks,
    tracks: clean.tracks,
    hq: clean.hq,
    images,
    settings,
  };
}

// Each HQ date is an independent "last happened" marker, so the later one wins.
function mergeHq(current, incoming) {
  const a = normalizeHq(current);
  const b = normalizeHq(incoming);
  return Object.fromEntries(Object.keys(a).map((key) => [key, a[key] > b[key] ? a[key] : b[key]]));
}

function mergeById(current, incoming) {
  const out = [...current];
  const indexes = new Map(out.map((item, index) => [String(item.id), index]));
  for (const item of incoming) {
    const index = indexes.get(String(item.id));
    if (index == null) {
      indexes.set(String(item.id), out.length);
      out.push(item);
    } else if ((item.updated || "") > (out[index].updated || "")) out[index] = item;
  }
  return out;
}

export function prepareImport(current, envelope, mode) {
  const result = validateBackup(envelope);
  if (!result.valid) throw new Error(result.errors.join(" "));
  const incoming = normalizeState(envelope);
  if (mode === "replace") return incoming;
  if (mode !== "merge") throw new Error("Import mode must be merge or replace.");
  const merged = {
    notes: mergeById(current.notes, incoming.notes),
    deletedNotes: mergeById(current.deletedNotes, incoming.deletedNotes),
    projects: mergeById(current.projects, incoming.projects),
    tasks: mergeById(current.tasks, incoming.tasks),
    tracks: mergeById(current.tracks || [], incoming.tracks),
    hq: mergeHq(current.hq, incoming.hq),
  };
  // ID collisions between active and deleted notes are resolved in favour of
  // the most recently updated record, then titles are made unique.
  const activeIds = new Set(merged.notes.map((note) => String(note.id)));
  merged.deletedNotes = merged.deletedNotes.filter((note) => !activeIds.has(String(note.id)));
  merged.notes = dedupeTitles(merged.notes);
  return normalizeState(merged);
}

export function summarizeImport(current, next, images = []) {
  return {
    notes: next.notes.length,
    deletedNotes: next.deletedNotes.length,
    projects: next.projects.length,
    tasks: next.tasks.length,
    tracks: next.tracks.length,
    images: images.length,
    addedNotes: Math.max(0, next.notes.length - current.notes.length),
  };
}

export function duplicateIncomingId(record, records) {
  return { ...record, id: newId(), title: uniqueTitle(record.title, records) };
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(data, type) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
