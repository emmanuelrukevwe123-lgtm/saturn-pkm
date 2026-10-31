export const SCHEMA_VERSION = 3;
export const BACKUP_FORMAT = "saturn-backup";
export const PROJECT_STAGES = Object.freeze(["orbit", "next", "parked", "done", "dropped"]);
export const PROJECT_CATEGORIES = Object.freeze(["career", "portfolio", "creative", "learning"]);
export const TRACK_ROLES = Object.freeze(["main", "support", "cert", "school"]);

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

// Only web links may be stored: a backup or synced record must never be able
// to smuggle in a javascript: or data: URL that runs when clicked.
export function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(String(value)).protocol);
  } catch {
    return false;
  }
}

function normalizeLinks(links) {
  if (!Array.isArray(links)) return [];
  return links
    .filter((link) => link && typeof link === "object" && isHttpUrl(link.url))
    .map((link) => ({
      id: link.id ?? link.url,
      label: typeof link.label === "string" && link.label.trim() ? link.label.trim() : String(link.url),
      url: String(link.url),
    }));
}

function normalizeLog(log, fallbackDate) {
  if (!Array.isArray(log)) return [];
  return log
    .filter((entry) => entry && typeof entry === "object" && typeof entry.text === "string" && entry.text.trim())
    .map((entry) => ({
      id: entry.id ?? `${entry.date}-${entry.text}`,
      date: iso(entry.date, fallbackDate),
      text: entry.text,
    }));
}

export function normalizeProject(project, now = new Date().toISOString()) {
  if (!project || typeof project !== "object" || project.id == null) return null;
  const updated = iso(project.updated, now);
  return {
    ...project,
    id: project.id,
    name: String(project.name || "Untitled project").trim() || "Untitled project",
    created: iso(project.created, now), updated,
    stage: PROJECT_STAGES.includes(project.stage) ? project.stage : "next",
    category: PROJECT_CATEGORIES.includes(project.category) ? project.category : "portfolio",
    nextStep: typeof project.nextStep === "string" ? project.nextStep : "",
    doneWhen: typeof project.doneWhen === "string" ? project.doneWhen : "",
    links: normalizeLinks(project.links),
    log: normalizeLog(project.log, updated),
    droppedReason: typeof project.droppedReason === "string" ? project.droppedReason : "",
    stageChangedAt: iso(project.stageChangedAt, updated),
    doneAt: iso(project.doneAt, ""),
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
    thisWeek: task.thisWeek === true,
    created: iso(task.created, now), updated: iso(task.updated, now),
    revision: Number.isInteger(task.revision) ? task.revision : 0,
    baseRevision: Number.isInteger(task.baseRevision) ? task.baseRevision : 0,
    deviceId: typeof task.deviceId === "string" ? task.deviceId : "legacy",
  };
}

export function normalizeTrack(track, now = new Date().toISOString()) {
  if (!track || typeof track !== "object" || track.id == null) return null;
  const progress = Number(track.progress);
  return {
    ...track,
    id: track.id,
    name: String(track.name || "Untitled track").trim() || "Untitled track",
    role: TRACK_ROLES.includes(track.role) ? track.role : "main",
    progress: Number.isFinite(progress) ? Math.min(100, Math.max(0, Math.round(progress))) : 0,
    nextStep: typeof track.nextStep === "string" ? track.nextStep : "",
    created: iso(track.created, now), updated: iso(track.updated, now),
    revision: Number.isInteger(track.revision) ? track.revision : 0,
    baseRevision: Number.isInteger(track.baseRevision) ? track.baseRevision : 0,
    deviceId: typeof track.deviceId === "string" ? track.deviceId : "legacy",
  };
}

export function normalizeHq(hq) {
  return {
    lastReviewAt: iso(hq?.lastReviewAt, ""),
    lastParkedReviewAt: iso(hq?.lastParkedReviewAt, ""),
    starterAddedAt: iso(hq?.starterAddedAt, ""),
  };
}

export function normalizeState(input) {
  const notes = dedupeTitles((Array.isArray(input?.notes) ? input.notes : []).map((n) => normalizeNote(n)).filter(Boolean));
  const deletedNotes = (Array.isArray(input?.deletedNotes) ? input.deletedNotes : []).map((n) => normalizeNote(n)).filter(Boolean);
  const projects = (Array.isArray(input?.projects) ? input.projects : []).map((p) => normalizeProject(p)).filter(Boolean);
  const projectIds = new Set(projects.map((p) => String(p.id)));
  const tasks = (Array.isArray(input?.tasks) ? input.tasks : []).map((t) => normalizeTask(t)).filter((t) => t && projectIds.has(String(t.projectId)));
  const tracks = (Array.isArray(input?.tracks) ? input.tracks : []).map((t) => normalizeTrack(t)).filter(Boolean);
  return { notes, deletedNotes, projects, tasks, tracks, hq: normalizeHq(input?.hq) };
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
