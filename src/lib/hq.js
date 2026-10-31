import {
  PROJECT_CATEGORIES, PROJECT_STAGES, TRACK_ROLES, isHttpUrl, newId, normalizeHq, normalizeProject, normalizeTrack, sameId,
} from "./domain.js";

/* ============================================================
   Saturn HQ rules. Every function is pure: it reads a state and
   returns a new one, or an { error } object when the rule refuses,
   and never changes what it was given. script.js only wires the UI.
   ============================================================ */

export const MAX_ORBIT = 2;
export const MAX_WEEK = 3;

export const STARTER_PROJECTS = Object.freeze([
  { name: "DevOps starter project", stage: "orbit", category: "career", nextStep: "Work through the Claude Code prompts, typing the Docker commands yourself" },
  { name: "soc-home-lab", stage: "orbit", category: "portfolio", nextStep: "Trigger safe test events and write a one-page note per alert" },
  { name: "noemo + Argus", stage: "next", category: "portfolio", nextStep: "Deploy and add demo link + screenshots" },
  { name: "duplo-style-payments-api", stage: "next", category: "portfolio", nextStep: "Deploy on Render, add /health and /docs links" },
  { name: "Ember & Mind channel", stage: "next", category: "creative", nextStep: "Make the first long YouTube video" },
  { name: "ihe-na-eme-mkpebi", stage: "parked", category: "portfolio", nextStep: "Rate-limit /api/decide, add tests and a live link" },
  { name: "agentforsocial_s", stage: "parked", category: "portfolio", nextStep: "Rename to content-agent, add sample output" },
  { name: "PORTFOLIO site", stage: "parked", category: "portfolio", nextStep: "Reset admin password, add login rate limit" },
  { name: "Managed security for SMEs", stage: "parked", category: "career", nextStep: "Waits until soc-home-lab is solid" },
  { name: "TradeMind", stage: "parked", category: "portfolio", nextStep: "Merge into noemo" },
  { name: "Content Scheduler for Reels", stage: "parked", category: "portfolio", nextStep: "CLAUDE.md ready" },
  { name: "saturn-pkm", stage: "done", category: "portfolio", nextStep: "" },
  { name: "javascript-fundamentals", stage: "done", category: "portfolio", nextStep: "" },
]);

const nowIso = () => new Date().toISOString();

function live(records) {
  return (records || []).filter((record) => !record.tombstone);
}

// Marks a record as edited. Backup merge and cloud sync pick the winning copy
// by `updated`, so a rule that skipped this could silently lose its change.
function touched(record, now, deviceId) {
  return {
    ...record,
    updated: now,
    baseRevision: record.revision || 0,
    revision: (record.revision || 0) + 1,
    deviceId: deviceId || record.deviceId,
  };
}

function findProject(state, id) {
  return live(state.projects).find((project) => sameId(project.id, id));
}

function replaceProject(state, next) {
  return { ...state, projects: state.projects.map((project) => (sameId(project.id, next.id) ? next : project)) };
}

function dayStart(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Whole calendar days in local time, so "Sunday" means the user's Sunday and
// daylight-saving changes can't push a review into the wrong day.
function daysBetween(earlier, later) {
  return Math.round((dayStart(later) - dayStart(earlier)) / 86_400_000);
}

export function orbitProjects(state) {
  return live(state.projects).filter((project) => project.stage === "orbit");
}

export function canMoveToOrbit(state) {
  return orbitProjects(state).length < MAX_ORBIT;
}

export function moveStage(state, id, stage, { reason = "", now = nowIso(), deviceId } = {}) {
  const project = findProject(state, id);
  if (!project) return { error: "not_found" };
  if (!PROJECT_STAGES.includes(stage)) return { error: "invalid_stage" };
  if (project.stage === stage) return state;
  if (stage === "orbit" && !canMoveToOrbit(state)) return { error: "orbit_full" };
  const droppedReason = String(reason).trim();
  if (stage === "dropped" && !droppedReason) return { error: "reason_required" };
  return replaceProject(state, touched({
    ...project,
    stage,
    stageChangedAt: now,
    // Leaving a stage clears its marker, so a reopened project isn't still "done".
    doneAt: stage === "done" ? now : "",
    droppedReason: stage === "dropped" ? droppedReason : "",
  }, now, deviceId));
}

function newProject(fields, now, deviceId) {
  return normalizeProject({
    id: newId(), created: now, updated: now, stageChangedAt: now,
    revision: 0, baseRevision: 0, deviceId,
    ...fields,
  }, now);
}

export function parkIdea(state, { name, category, now = nowIso(), deviceId } = {}) {
  const clean = String(name ?? "").trim();
  if (!clean) return { error: "empty_name" };
  const project = newProject({
    name: clean, stage: "parked",
    category: PROJECT_CATEGORIES.includes(category) ? category : "portfolio",
  }, now, deviceId);
  return { ...state, projects: [...state.projects, project] };
}

export function projectProgress(state, id) {
  const tasks = live(state.tasks).filter((task) => sameId(task.projectId, id));
  return { done: tasks.filter((task) => task.status === "done").length, total: tasks.length };
}

export function thisWeekTasks(state) {
  return live(state.tasks).filter((task) => task.thisWeek);
}

// A finished task keeps its slot until it's unticked or the weekly review
// clears it, so the three picks can't quietly grow into a longer list mid-week.
export function setThisWeek(state, taskId, on, { now = nowIso(), deviceId } = {}) {
  const task = live(state.tasks).find((item) => sameId(item.id, taskId));
  if (!task) return { error: "not_found" };
  if (!!task.thisWeek === !!on) return state;
  if (on && thisWeekTasks(state).length >= MAX_WEEK) return { error: "week_full" };
  return {
    ...state,
    tasks: state.tasks.map((item) => (sameId(item.id, taskId) ? touched({ ...item, thisWeek: !!on }, now, deviceId) : item)),
  };
}

export function clearFinishedThisWeek(state, { now = nowIso(), deviceId } = {}) {
  return {
    ...state,
    tasks: state.tasks.map((task) => (!task.tombstone && task.thisWeek && task.status === "done"
      ? touched({ ...task, thisWeek: false }, now, deviceId) : task)),
  };
}

export function addLogEntry(state, id, text, now = nowIso(), deviceId) {
  const project = findProject(state, id);
  if (!project) return { error: "not_found" };
  const clean = String(text ?? "").trim();
  if (!clean) return { error: "empty_text" };
  const entry = { id: newId(), date: now, text: clean };
  return replaceProject(state, touched({ ...project, log: [entry, ...(project.log || [])] }, now, deviceId));
}

export function updateProjectDetails(state, id, patch, { now = nowIso(), deviceId } = {}) {
  const project = findProject(state, id);
  if (!project) return { error: "not_found" };
  const next = {};
  for (const key of ["nextStep", "doneWhen"]) {
    if (typeof patch[key] === "string") next[key] = patch[key].trim();
  }
  if (PROJECT_CATEGORIES.includes(patch.category)) next.category = patch.category;
  if (Object.entries(next).every(([key, value]) => project[key] === value)) return state;
  return replaceProject(state, touched({ ...project, ...next }, now, deviceId));
}

export function addLink(state, id, { label, url }, { now = nowIso(), deviceId } = {}) {
  const project = findProject(state, id);
  if (!project) return { error: "not_found" };
  const cleanUrl = String(url ?? "").trim();
  if (!isHttpUrl(cleanUrl)) return { error: "invalid_url" };
  const link = { id: newId(), label: String(label ?? "").trim() || cleanUrl, url: cleanUrl };
  return replaceProject(state, touched({ ...project, links: [...(project.links || []), link] }, now, deviceId));
}

export function removeLink(state, id, linkId, { now = nowIso(), deviceId } = {}) {
  const project = findProject(state, id);
  if (!project) return { error: "not_found" };
  const links = (project.links || []).filter((link) => !sameId(link.id, linkId));
  return replaceProject(state, touched({ ...project, links }, now, deviceId));
}

// Existing projects with the same name are left exactly as they are. Orbit
// picks fall back to "next" when the two slots are already taken.
export function addStarterProjects(state, { now = nowIso(), deviceId } = {}) {
  const used = new Set(live(state.projects).map((project) => project.name.trim().toLocaleLowerCase()));
  let orbitCount = orbitProjects(state).length;
  const created = [];
  for (const starter of STARTER_PROJECTS) {
    if (used.has(starter.name.toLocaleLowerCase())) continue;
    let { stage } = starter;
    if (stage === "orbit") {
      if (orbitCount >= MAX_ORBIT) stage = "next";
      else orbitCount += 1;
    }
    created.push(newProject({ ...starter, stage, doneAt: stage === "done" ? now : "" }, now, deviceId));
  }
  return {
    ...state,
    projects: [...state.projects, ...created],
    hq: { ...normalizeHq(state.hq), starterAddedAt: now },
  };
}

// The spec's "Sunday with no review in the last 6 days" is the same moment as
// "7 or more calendar days" once days are counted by date: the previous Sunday
// is exactly 7 days back, and any later review is 6 or fewer.
export function reviewDue(hq, now = new Date()) {
  const last = normalizeHq(hq).lastReviewAt;
  return !last || daysBetween(last, now) >= 7;
}

export function reviewStatus(hq, now = new Date()) {
  if (!reviewDue(hq, now)) return "done";
  if (new Date(now).getDay() === 0) return "due_today";
  return normalizeHq(hq).lastReviewAt ? "overdue" : "due_sunday";
}

export function parkedReviewDue(hq, now = new Date()) {
  const last = normalizeHq(hq).lastParkedReviewAt;
  if (!last) return true;
  const lastDate = new Date(last);
  const date = new Date(now);
  return lastDate.getFullYear() !== date.getFullYear() || lastDate.getMonth() !== date.getMonth();
}

export function activeTracks(state) {
  return live(state.tracks);
}

export function addTrack(state, { name, role, now = nowIso(), deviceId } = {}) {
  const clean = String(name ?? "").trim();
  if (!clean) return { error: "empty_name" };
  const track = normalizeTrack({
    id: newId(), name: clean, role: TRACK_ROLES.includes(role) ? role : "main", progress: 0, nextStep: "",
    created: now, updated: now, revision: 0, baseRevision: 0, deviceId,
  }, now);
  return { ...state, tracks: [...(state.tracks || []), track] };
}

export function updateTrack(state, id, patch, { now = nowIso(), deviceId } = {}) {
  const track = activeTracks(state).find((item) => sameId(item.id, id));
  if (!track) return { error: "not_found" };
  const next = normalizeTrack(touched({ ...track, ...patch }, now, deviceId), now);
  return { ...state, tracks: state.tracks.map((item) => (sameId(item.id, id) ? next : item)) };
}

// A tombstone, like deleted projects, so sync can't bring the track back.
export function removeTrack(state, id, { now = nowIso(), deviceId } = {}) {
  return updateTrack(state, id, { tombstone: true, deletedAt: now }, { now, deviceId });
}

export function markReviewed(state, field, now = nowIso()) {
  return { ...state, hq: { ...normalizeHq(state.hq), [field]: now } };
}
