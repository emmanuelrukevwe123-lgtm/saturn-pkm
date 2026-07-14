export const SCHEMA_VERSION = 2;
export const BACKUP_FORMAT = "saturn-backup";

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `legacy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function sameId(a, b) {
  return String(a) === String(b);
}

export function normalizeTitle(title) {
  return String(title || "Untitled note").trim().replace(/\s+/g, " ") || "Untitled note";
}

export function titleKey(title) {
  return normalizeTitle(title).toLocaleLowerCase();
}

export function uniqueTitle(wanted, records, exceptId = null, suffix = "") {
  const base = normalizeTitle(wanted);
  const used = new Set(records
    .filter((record) => exceptId == null || !sameId(record.id, exceptId))
    .map((record) => titleKey(record.title)));
  if (!used.has(titleKey(base))) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base}${suffix || " ("}${index}${suffix ? "" : ")"}`;
    if (!used.has(titleKey(candidate))) return candidate;
  }
}

export function dedupeTitles(records) {
  const out = [];
  for (const record of records) out.push({
    ...record,
    title: uniqueTitle(record.title, out),
  });
  return out;
}

export function rewriteWikiLinks(text, oldTitle, newTitle) {
  const oldKey = titleKey(oldTitle);
  if (!oldKey || oldKey === titleKey(newTitle)) return String(text || "");
  return String(text || "").replace(/\[\[([^\]]+)\]\]/g, (whole, target) =>
    titleKey(target) === oldKey ? `[[${normalizeTitle(newTitle)}]]` : whole);
}

export function renameNoteState(state, noteId, wantedTitle, now = new Date().toISOString()) {
  const current = state.notes.find((note) => sameId(note.id, noteId));
  if (!current) return state;
  const nextTitle = uniqueTitle(wantedTitle, state.notes, noteId);
  const oldTitle = current.title;
  return {
    ...state,
    notes: state.notes.map((note) => ({
      ...note,
      title: sameId(note.id, noteId) ? nextTitle : note.title,
      body: rewriteWikiLinks(note.body, oldTitle, nextTitle),
      updated: sameId(note.id, noteId) || rewriteWikiLinks(note.body, oldTitle, nextTitle) !== note.body
        ? now : note.updated,
    })),
    tasks: state.tasks.map((task) => {
      const notes = rewriteWikiLinks(task.notes, oldTitle, nextTitle);
      return notes === task.notes ? task : { ...task, notes, updated: now };
    }),
  };
}

function iso(value, fallback) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

export function normalizeNote(note, now = new Date().toISOString()) {
  if (!note || typeof note !== "object" || note.id == null) return null;
  return {
    ...note,
    id: note.id,
    title: normalizeTitle(note.title),
    body: typeof note.body === "string" ? note.body : "",
    tags: Array.isArray(note.tags) ? [...new Set(note.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim().toLowerCase()).filter(Boolean))] : [],
    created: iso(note.created, now),
    updated: iso(note.updated, iso(note.created, now)),
    ...(note.deletedAt ? { deletedAt: iso(note.deletedAt, now) } : {}),
    revision: Number.isInteger(note.revision) && note.revision >= 0 ? note.revision : 0,
    baseRevision: Number.isInteger(note.baseRevision) && note.baseRevision >= 0 ? note.baseRevision : 0,
    deviceId: typeof note.deviceId === "string" ? note.deviceId : "legacy",
  };
}

export function normalizeProject(project, now = new Date().toISOString()) {
  if (!project || typeof project !== "object" || project.id == null) return null;
  return {
    ...project,
    id: project.id,
    name: String(project.name || "Untitled project").trim() || "Untitled project",
    created: iso(project.created, now), updated: iso(project.updated, now),
    revision: Number.isInteger(project.revision) ? project.revision : 0,
    baseRevision: Number.isInteger(project.baseRevision) ? project.baseRevision : 0,
    deviceId: typeof project.deviceId === "string" ? project.deviceId : "legacy",
  };
}

export function normalizeTask(task, now = new Date().toISOString()) {
  if (!task || typeof task !== "object" || task.id == null || task.projectId == null) return null;
  return {
    ...task,
    id: task.id, projectId: task.projectId,
    title: String(task.title || "Untitled task").trim() || "Untitled task",
    status: ["todo", "doing", "done"].includes(task.status) ? task.status : "todo",
    due: typeof task.due === "string" ? task.due : "",
    priority: ["low", "med", "high"].includes(task.priority) ? task.priority : "med",
    tags: Array.isArray(task.tags) ? task.tags.filter((tag) => typeof tag === "string") : [],
    notes: typeof task.notes === "string" ? task.notes : "",
    order: Number.isFinite(task.order) ? task.order : 0,
    created: iso(task.created, now), updated: iso(task.updated, now),
    revision: Number.isInteger(task.revision) ? task.revision : 0,
    baseRevision: Number.isInteger(task.baseRevision) ? task.baseRevision : 0,
    deviceId: typeof task.deviceId === "string" ? task.deviceId : "legacy",
  };
}

export function normalizeState(input) {
  const notes = dedupeTitles((Array.isArray(input?.notes) ? input.notes : []).map((n) => normalizeNote(n)).filter(Boolean));
  const deletedNotes = (Array.isArray(input?.deletedNotes) ? input.deletedNotes : []).map((n) => normalizeNote(n)).filter(Boolean);
  const projects = (Array.isArray(input?.projects) ? input.projects : []).map((p) => normalizeProject(p)).filter(Boolean);
  const projectIds = new Set(projects.map((p) => String(p.id)));
  const tasks = (Array.isArray(input?.tasks) ? input.tasks : []).map((t) => normalizeTask(t)).filter((t) => t && projectIds.has(String(t.projectId)));
  return { notes, deletedNotes, projects, tasks };
}

export function conflictCopy(record, records, deviceLabel = "external") {
  const now = new Date().toISOString();
  return {
    ...record,
    id: newId(),
    title: uniqueTitle(`${normalizeTitle(record.title)} (conflict ${deviceLabel})`, records),
    created: record.created || now,
    updated: now,
    revision: 0,
    baseRevision: 0,
  };
}
