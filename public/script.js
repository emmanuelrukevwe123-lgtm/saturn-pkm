/* ============================================================
   Saturn PKM — all app logic
   State = an array of note objects, saved to localStorage.
   Links are NOT stored: they are found by scanning note bodies
   for [[Note title]] patterns.
   Screens (home / note / tags / progress / add) mirror the
   Saturn design export's Today / Topics / Progress / Add views.
   ============================================================ */

const APP_VERSION = "v13";
// Cloud sync is parked: the Firestore (default) database doesn't exist in the
// project yet. All sync code below stays dormant behind this flag — to bring
// it back, create the database (docs/GOOGLE_AUTH.md §5) and flip to true.
const CLOUD_SYNC_ENABLED = false;

// ---------- Visible error reporting ----------
// If anything throws, show it on screen instead of failing silently —
// crucial for diagnosing device-specific problems we can't reproduce.
function reportAppError(message) {
  let el = document.getElementById("app-error");
  if (!el) {
    el = document.createElement("div");
    el.id = "app-error";
    el.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:999;background:#B3261E;color:#fff;" +
      "font:600 13px/1.4 sans-serif;padding:10px 14px;word-break:break-word;";
    document.body.appendChild(el);
  }
  el.textContent = "Saturn " + APP_VERSION + " error: " + message +
    " — please screenshot this message.";
}
window.addEventListener("error", (e) => reportAppError(e.message || "unknown error"));
window.addEventListener("unhandledrejection", (e) =>
  reportAppError(String((e.reason && e.reason.message) || e.reason || "unknown rejection")));

const STORAGE_KEY = "saturn-pkm-notes";
const TRASH_KEY = "saturn-pkm-deleted-notes";
const THEME_KEY = "saturn-pkm-theme";
const PLANNER_PROJECTS_KEY = "saturn-pkm-planner-projects";
const PLANNER_TASKS_KEY = "saturn-pkm-planner-tasks";
const FIREBASE_SDK_VERSION = "12.15.0";

// ---------- State ----------
let notes = [];          // the whole knowledge base
let deletedNotes = [];   // recoverable notes in the Dead Stars bin
let storageKey = STORAGE_KEY;
let deletedStorageKey = TRASH_KEY;
let selectedId = null;   // which note is open on the note screen
let activeTag = null;    // tag filter (null = all)
let searchQuery = "";    // live search text
let screen = "home";     // "home" | "note" | "tags" | "progress" | "bin" | "add"
let openTag = null;      // which tag accordion is expanded
let dark = false;
let currentUser = null;
let authStatus = "checking";
let authError = "";
let authApi = null;
let noteDraft = null;

// Planner state
let projects = [];              // {id, name, created, updated}
let plannerTasks = [];          // flat task list; each task carries projectId
let plannerProjectsKey = PLANNER_PROJECTS_KEY;
let plannerTasksKey = PLANNER_TASKS_KEY;
let activeProjectId = null;     // which board is open
let taskDetailId = null;        // which task is open in the detail panel
let taskDraft = null;           // unsaved detail-panel edits
let kbDrag = null;              // kanban drag state

const TASK_STATUSES = ["todo", "doing", "done"];
const TASK_PRIORITIES = ["low", "med", "high"];

const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Retro tag palette: teal / orange / brown / olive (light / dark values)
const TAG_LIGHT = ["#2F5D54", "#C2551F", "#7A5230", "#6B7A3A"];
const TAG_DARK  = ["#8FD0C2", "#EFA067", "#D9B48A", "#C2CC8B"];

// ---------- Elements ----------
const $ = (sel) => document.querySelector(sel);

const screens = {
  home: $("#screen-home"),
  note: $("#screen-note"),
  tags: $("#screen-tags"),
  graph: $("#screen-graph"),
  progress: $("#screen-progress"),
  bin: $("#screen-bin"),
  add: $("#screen-add"),
  planner: $("#screen-planner"),
  board: $("#screen-board"),
};

const ledgerEl     = $("#ledger");
const listHeading  = $("#list-heading");
const tagPillsEl   = $("#tag-pills");
const searchInput  = $("#search-input");
const homeEmpty    = $("#home-empty");

const titleInput   = $("#note-title");
const tagsInput    = $("#note-tags");
const noteEyebrow  = $("#note-eyebrow");
const renderedBody = $("#rendered-body"); // the rich editor: contenteditable, always styled
const backlinksEl  = $("#backlinks");
const noBacklinks  = $("#no-backlinks");
const saveNoteBtn  = $("#save-note");
const saveStatus   = $("#save-status");
const deletedList  = $("#deleted-list");
const binEmpty     = $("#bin-empty");

const authName     = $("#auth-name");
const authMeta     = $("#auth-meta");
const authAvatar   = $("#auth-avatar");
const googleSignIn = $("#google-signin");
const googleSignOut = $("#google-signout");

// ---------- Persistence ----------
function parseStoredNotes(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Normalize each note so a missing/odd field can never crash rendering.
    return parsed
      .filter((n) => n && typeof n === "object" && n.id != null)
      .map((n) => ({
        ...n,
        title: typeof n.title === "string" ? n.title : "Untitled note",
        body: typeof n.body === "string" ? n.body : "",
        tags: Array.isArray(n.tags) ? n.tags.filter((t) => typeof t === "string") : [],
      }));
  } catch {
    return [];
  }
}

function storedNotesFor(key) {
  return parseStoredNotes(localStorage.getItem(key));
}

function scopedStorageKey(base, user) {
  return user ? base + ":" + user.uid : base;
}

function userStorageKey(user) {
  return scopedStorageKey(STORAGE_KEY, user);
}

function userDeletedStorageKey(user) {
  return scopedStorageKey(TRASH_KEY, user);
}

// Planner rows are normalized like notes: bad data must never crash rendering.
function parseStoredProjects(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p === "object" && p.id != null)
      .map((p) => ({
        ...p,
        name: typeof p.name === "string" ? p.name : "Untitled project",
      }));
  } catch {
    return [];
  }
}

function parseStoredTasks(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t && typeof t === "object" && t.id != null && t.projectId != null)
      .map((t) => ({
        ...t,
        title: typeof t.title === "string" ? t.title : "Untitled task",
        status: TASK_STATUSES.includes(t.status) ? t.status : "todo",
        due: typeof t.due === "string" ? t.due : "",
        priority: TASK_PRIORITIES.includes(t.priority) ? t.priority : "med",
        tags: Array.isArray(t.tags) ? t.tags.filter((x) => typeof x === "string") : [],
        notes: typeof t.notes === "string" ? t.notes : "",
        order: typeof t.order === "number" ? t.order : 0,
      }));
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(storageKey, JSON.stringify(notes));
  scheduleCloudPush();
}

function saveProjects() {
  localStorage.setItem(plannerProjectsKey, JSON.stringify(projects));
  scheduleCloudPush(); // no-op while cloud sync is parked; hook for later
}

function saveTasks() {
  localStorage.setItem(plannerTasksKey, JSON.stringify(plannerTasks));
  scheduleCloudPush();
}

function loadPlanner() {
  projects = parseStoredProjects(localStorage.getItem(plannerProjectsKey));
  plannerTasks = parseStoredTasks(localStorage.getItem(plannerTasksKey));
}

function saveDeleted() {
  localStorage.setItem(deletedStorageKey, JSON.stringify(deletedNotes));
  scheduleCloudPush();
}

function loadNotes() {
  notes = storedNotesFor(storageKey);
  deletedNotes = storedNotesFor(deletedStorageKey);
}

function load() {
  loadNotes();
  loadPlanner();
  dark = localStorage.getItem(THEME_KEY) === "dark";
}

// ---------- Helpers ----------
function getNote(id) {
  return notes.find((n) => n.id === id);
}

function findByTitle(title) {
  const t = title.trim().toLowerCase();
  return notes.find((n) => n.title.trim().toLowerCase() === t);
}

// All [[link targets]] inside a body, as raw title strings
function linksIn(body) {
  return [...body.matchAll(/\[\[([^\[\]]+)\]\]/g)].map((m) => m[1].trim());
}

// Notes whose body links to `note`
function backlinksTo(note) {
  const target = note.title.trim().toLowerCase();
  return notes.filter(
    (n) =>
      n.id !== note.id &&
      linksIn(n.body).some((t) => t.toLowerCase() === target)
  );
}

// A note is an orphan if it has no links out AND nothing links to it
function isOrphan(note) {
  return linksIn(note.body).length === 0 && backlinksTo(note).length === 0;
}

function allTags() {
  return [...new Set(notes.flatMap((n) => n.tags))].sort();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}

function tagColor(tag) {
  const i = Math.max(0, allTags().indexOf(tag)) % 4;
  return (dark ? TAG_DARK : TAG_LIGHT)[i];
}

function editedLabel(note) {
  const d = new Date(note.updated);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "edited today";
  return "edited " + MON[d.getMonth()] + " " + d.getDate();
}

function deletedLabel(note) {
  const d = new Date(note.deletedAt || note.updated || note.created);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "deleted today";
  return "deleted " + MON[d.getMonth()] + " " + d.getDate();
}

function normalizeTagsText(text) {
  return text
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function draftFrom(note) {
  return {
    id: note.id,
    title: note.title,
    tagsText: note.tags.join(", "),
    body: note.body
  };
}

function ensureDraft(note) {
  if (!noteDraft || noteDraft.id !== note.id) noteDraft = draftFrom(note);
  return noteDraft;
}

function draftTags() {
  return normalizeTagsText(noteDraft?.tagsText || "");
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function draftIsDirty() {
  const note = getNote(selectedId);
  if (!note || !noteDraft) return false;
  return noteDraft.title !== note.title ||
    noteDraft.body !== note.body ||
    !arraysEqual(draftTags(), note.tags);
}

function updateSaveState() {
  const dirty = draftIsDirty();
  saveNoteBtn.disabled = !dirty;
  saveStatus.textContent = dirty ? "Unsaved changes" : "Saved";
  saveStatus.classList.toggle("dirty", dirty);
}

function confirmDiscardDraft() {
  if (!draftIsDirty()) return true;
  const ok = confirm("Discard unsaved changes?");
  if (ok) noteDraft = null;
  return ok;
}

function escapeHTML(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ---------- Markdown (tiny hand-rolled subset) ----------
// Escapes HTML first, then applies rules — order matters.
function renderMarkdown(src) {
  const lines = escapeHTML(src).split("\n");
  let html = "";
  let inList = false;

  const inline = (text) =>
    text
      // [[wiki links]] — existing notes vs missing "ghost" links
      .replace(/\[\[([^\[\]]+)\]\]/g, (_, title) => {
        const target = findByTitle(title);
        const cls = target ? "wiki-link" : "wiki-link missing";
        return `<a class="${cls}" data-link="${escapeHTML(title.trim())}">${title.trim()}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.*)/);
    const listItem = line.match(/^-\s+(.*)/);

    if (listItem) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(listItem[1])}</li>`;
      continue;
    }
    if (inList) { html += "</ul>"; inList = false; }

    if (heading) {
      const level = heading[1].length;
      html += `<h${level}>${inline(heading[2])}</h${level}>`;
    } else if (line.trim() === "") {
      // blank line = paragraph break
    } else {
      html += `<p>${inline(line)}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}

// ---------- Rich editor (formatting buttons, no visible Markdown) ----------
// The note body is STILL stored in the same Markdown-ish format (so links,
// the graph, AI, and old notes keep working) — but the user only ever sees
// styled text in a contenteditable surface. domToMarkdown converts the
// editor's DOM back to the storage format on every keystroke.
function domToMarkdown(root) {
  const inline = (node) => {
    let text = "";
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) { text += child.textContent; continue; }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName;
      if (tag === "BR") { text += "\n"; continue; }
      const inner = inline(child);
      if (child.classList.contains("wiki-link")) {
        text += "[[" + (child.dataset.link || inner).trim() + "]]";
      } else if (tag === "STRONG" || tag === "B") {
        text += inner.trim() ? "**" + inner + "**" : inner;
      } else if (tag === "EM" || tag === "I") {
        text += inner.trim() ? "*" + inner + "*" : inner;
      } else if (tag === "CODE") {
        text += inner.trim() ? "`" + inner + "`" : inner;
      } else {
        text += inner;
      }
    }
    return text;
  };

  const out = [];
  const block = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent.trim()) out.push(child.textContent);
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName;
      if (tag === "H1" || tag === "H2" || tag === "H3") {
        out.push("#".repeat(Number(tag[1])) + " " + inline(child).trim(), "");
      } else if (tag === "UL" || tag === "OL") {
        for (const li of child.children) out.push("- " + inline(li).trim());
        out.push("");
      } else if (tag === "P" || tag === "DIV") {
        // A div may itself wrap block children (contenteditable nesting)
        if (child.querySelector("h1,h2,h3,ul,ol,p,div")) block(child);
        else out.push(inline(child), "");
      } else if (tag === "BR") {
        out.push("");
      } else {
        out.push(inline(child), "");
      }
    }
  };
  block(root);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// One toolbar action per button; execCommand still works everywhere and
// keeps us dependency-free. mousedown is prevented so the text selection
// in the editor survives the button press.
function currentBlockTag() {
  let node = window.getSelection()?.anchorNode;
  while (node && node !== renderedBody) {
    if (node.nodeType === Node.ELEMENT_NODE && /^H[1-3]$/.test(node.tagName)) return node.tagName;
    node = node.parentNode;
  }
  return null;
}

function wireFormatting() {
  const actions = {
    "fmt-bold": () => document.execCommand("bold"),
    "fmt-italic": () => document.execCommand("italic"),
    "fmt-list": () => document.execCommand("insertUnorderedList"),
    "fmt-heading": () =>
      document.execCommand("formatBlock", false, currentBlockTag() ? "<p>" : "<h2>"),
    "fmt-link": () => {
      const selected = window.getSelection()?.toString().trim();
      const title = selected || prompt("Link to which note?");
      if (!title) return;
      const target = findByTitle(title);
      const cls = target ? "wiki-link" : "wiki-link missing";
      document.execCommand(
        "insertHTML", false,
        `<a class="${cls}" data-link="${escapeHTML(title)}">${escapeHTML(title)}</a>&nbsp;`
      );
    },
  };
  for (const [id, run] of Object.entries(actions)) {
    const btn = $("#" + id);
    if (!btn) continue; // stale cached HTML must never crash the boot sequence
    btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep selection
    btn.addEventListener("click", () => {
      renderedBody.focus();
      run(); // execCommand fires "input" on the editor, updating the draft
    });
  }
}

// ---------- Shared builders ----------
function chipFor(tag) {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = tag;
  const color = tagColor(tag);
  chip.style.color = color;
  chip.style.background = hexA(color, dark ? 0.2 : 0.13);
  return chip;
}

// A Saturn ledger row: [index] title [tag chip] date [delete]
function noteRow(note, index, { deletable = true } = {}) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.id = note.id;

  if (index != null) {
    const idx = document.createElement("div");
    idx.className = "row-index";
    idx.textContent = String(index + 1).padStart(2, "0");
    row.appendChild(idx);
  }

  const title = document.createElement("div");
  title.className = "row-title";
  title.textContent = note.title || "Untitled note";
  row.appendChild(title);

  if (note.tags.length) row.appendChild(chipFor(note.tags[0]));

  const date = document.createElement("span");
  date.className = "row-date";
  date.textContent = editedLabel(note);
  row.appendChild(date);

  if (deletable) {
    const x = document.createElement("button");
    x.className = "row-delete";
    x.type = "button";
    x.title = "Delete note";
    x.setAttribute("aria-label", "Delete " + (note.title || "Untitled note"));
    x.textContent = "Delete";
    x.dataset.del = note.id;
    row.appendChild(x);
  }
  return row;
}

// ---------- Screen switching ----------
function showScreen(name) {
  if (screen === "note" && name !== "note" && !confirmDiscardDraft()) return false;
  if (name !== "note") noteDraft = null;
  screen = name;
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
  // Every screen starts at its top — otherwise a tap from deep in a long
  // list lands mid-page on the next screen and looks like nothing opened.
  document.querySelector(".main").scrollTop = 0;
  document.querySelectorAll(".nav-link").forEach((b) =>
    // the note screen still belongs to "Notes" in the nav; a board to "Planner"
    b.classList.toggle("active",
      b.dataset.screen === (name === "note" ? "home" : name === "board" ? "planner" : name))
  );
  renderScreen();
  return true;
}

function renderScreen() {
  try {
    if (screen === "home") renderHome();
    else if (screen === "note") renderNote();
    else if (screen === "tags") renderTags();
    else if (screen === "graph") renderGraph();
    else if (screen === "progress") renderProgress();
    else if (screen === "bin") renderBin();
    else if (screen === "planner") renderPlanner();
    else if (screen === "board") renderBoard();
  } catch (err) {
    reportAppError((err && err.message) || String(err));
    throw err;
  }
}

// ---------- Home (Notes) ----------
function visibleNotes() {
  let list = [...notes].sort((a, b) => b.updated.localeCompare(a.updated));
  if (activeTag) list = list.filter((n) => n.tags.includes(activeTag));
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(
      (n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
    );
  }
  return list;
}

function renderHome() {
  // Eyebrow: today's date, Saturn-style ("Thu · Jul 2")
  const t = new Date();
  $("#today-eyebrow").textContent = WD[t.getDay()] + " · " + MON[t.getMonth()] + " " + t.getDate();

  // Hero ring: how much of the web is linked
  const total = notes.length;
  const orphans = notes.filter(isOrphan).length;
  const linked = total - orphans;
  const pct = total ? linked / total : 0;
  const CIRC = 2 * Math.PI * 96;
  $("#home-ring").style.strokeDashoffset = CIRC * (1 - pct);
  $("#hero-num").textContent = linked;
  $("#hero-sub").textContent = "of " + total + " notes linked";
  $("#hero-headline").textContent =
    total === 0 ? "No notes yet" :
    orphans === 0 ? "Every note in orbit." :
    orphans + (orphans === 1 ? " orphan adrift" : " orphans adrift");

  // Tag filter pills
  tagPillsEl.innerHTML = "";
  const pills = [null, ...allTags()];
  for (const tag of pills) {
    const b = document.createElement("button");
    const active = tag === activeTag;
    b.className = "pill" + (active ? " active" : "");
    b.textContent = tag === null ? "All" : tag;
    if (tag !== null) {
      b.dataset.tag = tag;
      if (active) {
        const color = tagColor(tag);
        b.style.borderColor = color;
        b.style.background = hexA(color, dark ? 0.2 : 0.13);
        b.style.color = color;
      }
    }
    tagPillsEl.appendChild(b);
  }

  // Ledger
  const list = visibleNotes();
  listHeading.textContent = activeTag
    ? activeTag
    : searchQuery
    ? `Results for “${searchQuery}”`
    : "All notes";

  ledgerEl.innerHTML = "";
  list.forEach((n, i) => ledgerEl.appendChild(noteRow(n, i)));
  homeEmpty.hidden = list.length > 0;
  ledgerEl.hidden = list.length === 0;
}

// ---------- Note detail ----------
function renderNote() {
  const note = getNote(selectedId);
  if (!note) { noteDraft = null; showScreen("home"); return; }
  const draft = ensureDraft(note);
  syncAiSummaryPanel(note.id);

  noteEyebrow.textContent = "Note · " + editedLabel(note).replace("edited ", "");
  if (document.activeElement !== titleInput) titleInput.value = draft.title;
  if (document.activeElement !== tagsInput) tagsInput.value = draft.tagsText;
  // Refill the editor only when it isn't being typed in (keeps the caret alive)
  if (document.activeElement !== renderedBody) {
    renderedBody.innerHTML = draft.body.trim() ? renderMarkdown(draft.body) : "";
  }
  updateSaveState();

  // Backlinks
  const backs = backlinksTo(note);
  backlinksEl.innerHTML = "";
  backs.forEach((b, i) => backlinksEl.appendChild(noteRow(b, i, { deletable: false })));
  noBacklinks.hidden = backs.length > 0;
  backlinksEl.hidden = backs.length === 0;
}

// ---------- Tags (accordion groups) ----------
function renderTags() {
  const groupsEl = $("#tag-groups");
  groupsEl.innerHTML = "";

  const tags = allTags();
  const untagged = notes.filter((n) => n.tags.length === 0);
  const keys = [...tags, ...(untagged.length ? ["__untagged"] : [])];
  $("#tags-empty").hidden = keys.length > 0;

  const CTR = 2 * Math.PI * 26;
  for (const key of keys) {
    const isUntagged = key === "__untagged";
    const grp = isUntagged ? untagged : notes.filter((n) => n.tags.includes(key));
    const linked = grp.filter((n) => !isOrphan(n)).length;
    const p = grp.length ? Math.round((linked / grp.length) * 100) : 0;
    const open = openTag === key;

    const card = document.createElement("div");
    card.className = "group" + (open ? " open" : "");

    const head = document.createElement("button");
    head.className = "group-head";
    head.dataset.tag = key;
    head.innerHTML = `
      <div class="group-ring">
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle class="ring-track" cx="32" cy="32" r="26" fill="none" stroke-width="6"></circle>
          <circle class="ring-progress" cx="32" cy="32" r="26" fill="none" stroke-width="6" stroke-linecap="round"
            stroke-dasharray="${CTR}" stroke-dashoffset="${CTR * (1 - p / 100)}" transform="rotate(-90 32 32)"></circle>
        </svg>
        <div class="group-pct">${p}%</div>
      </div>
      <div class="group-info">
        <div class="group-title"></div>
        <div class="group-sub">${linked} of ${grp.length} linked · ${grp.length} ${grp.length === 1 ? "note" : "notes"}</div>
      </div>
      <span class="group-caret">${open ? "▾" : "▸"}</span>`;
    head.querySelector(".group-title").textContent = isUntagged ? "Untagged" : key;
    card.appendChild(head);

    if (open) {
      const body = document.createElement("div");
      body.className = "group-body group-rows";
      grp
        .slice()
        .sort((a, b) => b.updated.localeCompare(a.updated))
        .forEach((n) => body.appendChild(noteRow(n, null, { deletable: false })));
      card.appendChild(body);
    }
    groupsEl.appendChild(card);
  }
}

// ---------- Progress ----------
function renderProgress() {
  const total = notes.length;
  const totalLinks = notes.reduce((sum, n) => sum + linksIn(n.body).length, 0);
  const orphans = notes.filter(isOrphan).length;
  const linked = total - orphans;
  const pct = total ? linked / total : 0;

  const PCIRC = 2 * Math.PI * 64;
  $("#progress-ring").style.strokeDashoffset = PCIRC * (1 - pct);
  $("#stat-pct").textContent = Math.round(pct * 100) + "%";
  $("#stat-linked").textContent = linked + " of " + total;
  $("#stat-links").textContent = totalLinks;
  $("#stat-orphans").textContent = orphans;

  // By-tag breakdown: how linked each tag's notes are
  const breakdownEl = $("#breakdown");
  breakdownEl.innerHTML = "";
  const untagged = notes.filter((n) => n.tags.length === 0);
  const entries = allTags().map((t) => [t, notes.filter((n) => n.tags.includes(t))]);
  if (untagged.length) entries.push(["Untagged", untagged]);
  for (const [label, grp] of entries) {
    const done = grp.filter((n) => !isOrphan(n)).length;
    const p = grp.length ? Math.round((done / grp.length) * 100) : 0;
    const color = label === "Untagged" ? "var(--muted)" : tagColor(label);

    const item = document.createElement("div");
    item.className = "break-item";
    const head = document.createElement("div");
    head.className = "break-head";
    const chip = label === "Untagged" ? document.createElement("span") : chipFor(label);
    if (label === "Untagged") {
      chip.className = "chip";
      chip.textContent = "Untagged";
      chip.style.color = "var(--muted)";
      chip.style.background = "var(--surface-2)";
    }
    chip.style.padding = "3px 12px";
    chip.style.fontSize = "13px";
    const count = document.createElement("span");
    count.className = "break-count";
    count.textContent = done + " / " + grp.length;
    head.append(chip, count);

    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = p + "%";
    fill.style.background = color;
    track.appendChild(fill);

    item.append(head, track);
    breakdownEl.appendChild(item);
  }
  if (!entries.length) breakdownEl.innerHTML = '<div class="empty small">Nothing to chart yet.</div>';

  // Recently edited
  const recentEl = $("#recent-list");
  recentEl.innerHTML = "";
  [...notes]
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 5)
    .forEach((n) => recentEl.appendChild(noteRow(n, null, { deletable: false })));
}

// ---------- Bin ----------
function deletedNoteRow(note) {
  const row = document.createElement("div");
  row.className = "dead-star-row";
  row.dataset.id = note.id;

  const star = document.createElement("div");
  star.className = "dead-star-shape";
  star.setAttribute("aria-hidden", "true");
  row.appendChild(star);

  const info = document.createElement("div");
  info.className = "dead-star-info";

  const title = document.createElement("div");
  title.className = "dead-star-title";
  title.textContent = note.title || "Untitled note";
  info.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "dead-star-meta";
  const tagText = note.tags.length ? " · " + note.tags.join(", ") : "";
  meta.textContent = deletedLabel(note) + tagText;
  info.appendChild(meta);

  if (note.body.trim()) {
    const excerpt = document.createElement("div");
    excerpt.className = "dead-star-excerpt";
    excerpt.textContent = note.body.trim().replace(/\s+/g, " ").slice(0, 130);
    info.appendChild(excerpt);
  }
  row.appendChild(info);

  const actions = document.createElement("div");
  actions.className = "dead-star-actions";

  const restore = document.createElement("button");
  restore.className = "pill";
  restore.type = "button";
  restore.textContent = "Restore";
  restore.dataset.restore = note.id;
  actions.appendChild(restore);

  const purge = document.createElement("button");
  purge.className = "pill pill-danger";
  purge.type = "button";
  purge.textContent = "Delete forever";
  purge.dataset.purge = note.id;
  actions.appendChild(purge);

  row.appendChild(actions);
  return row;
}

function renderBin() {
  deletedList.innerHTML = "";
  const list = [...deletedNotes].sort((a, b) =>
    (b.deletedAt || b.updated || "").localeCompare(a.deletedAt || a.updated || "")
  );
  list.forEach((note) => deletedList.appendChild(deletedNoteRow(note)));
  binEmpty.hidden = list.length > 0;
  deletedList.hidden = list.length === 0;
}

// ---------- Theme ----------
function applyTheme() {
  document.body.classList.toggle("dark", dark);
  $("#theme-label").textContent = dark ? "Dark mode" : "Light mode";
  $("#theme-glyph").textContent = dark ? "☾" : "☀";
}

// ---------- Google sign-in ----------
function hasFirebaseConfig(config) {
  return !!config &&
    ["apiKey", "authDomain", "projectId", "appId"].every(
      (key) => typeof config[key] === "string" && config[key].trim().length > 0
    );
}

function friendlyAuthError(error) {
  if (!error) return "Google sign-in is unavailable.";
  if (error.code === "auth/popup-closed-by-user") return "Sign-in window was closed.";
  if (error.code === "auth/popup-blocked") return "Allow popups to sign in.";
  if (error.code === "auth/unauthorized-domain") return "Add this domain in Firebase Authentication.";
  return error.message || "Google sign-in is unavailable.";
}

function initialForUser(user) {
  const source = user?.displayName || user?.email || "Google";
  return source.trim().charAt(0).toUpperCase() || "G";
}

function renderAuth() {
  if (!authName) return;

  const signedIn = !!currentUser;
  // Privacy: never show the email address — name (or a generic label) only.
  authName.textContent = signedIn
    ? currentUser.displayName || "Google account"
    : "Not signed in";

  if (signedIn) {
    authMeta.textContent = {
      syncing: "Syncing…",
      synced: "Synced across your devices",
      error: "Sync error — will retry",
      unavailable: "Signed in — cloud sync not set up"
    }[cloudStatus] || "Signed in with Google";
  } else if (authStatus === "unconfigured") {
    authMeta.textContent = "Add Firebase config to enable login.";
  } else if (authStatus === "loading" || authStatus === "checking") {
    authMeta.textContent = "Checking Google sign-in...";
  } else if (authStatus === "error") {
    authMeta.textContent = authError;
  } else {
    authMeta.textContent = "Notes stay on this browser.";
  }

  authAvatar.replaceChildren();
  if (signedIn && currentUser.photoURL) {
    const img = document.createElement("img");
    img.src = currentUser.photoURL;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    authAvatar.appendChild(img);
  } else {
    authAvatar.textContent = signedIn ? initialForUser(currentUser) : "G";
  }

  googleSignIn.hidden = signedIn;
  googleSignOut.hidden = !signedIn;
  googleSignIn.disabled = authStatus !== "ready";
  googleSignOut.disabled = authStatus === "loading";

  if (authStatus === "unconfigured") googleSignIn.textContent = "Configure Google sign-in";
  else if (authStatus === "loading" || authStatus === "checking") googleSignIn.textContent = "Checking Google sign-in";
  else googleSignIn.textContent = "Sign in with Google";

  renderAiAvailability();
}

function copyLocalNotesToUserStore(userKey) {
  if (localStorage.getItem(userKey)) return;
  const localNotes = storedNotesFor(STORAGE_KEY);
  if (localNotes.length) localStorage.setItem(userKey, JSON.stringify(localNotes));
}

function copyLocalDeletedToUserStore(userKey) {
  if (localStorage.getItem(userKey)) return;
  const localDeleted = storedNotesFor(TRASH_KEY);
  if (localDeleted.length) localStorage.setItem(userKey, JSON.stringify(localDeleted));
}

function copyLocalPlannerToUserStore(projectsKey, tasksKey) {
  if (!localStorage.getItem(projectsKey)) {
    const localProjects = parseStoredProjects(localStorage.getItem(PLANNER_PROJECTS_KEY));
    if (localProjects.length) localStorage.setItem(projectsKey, JSON.stringify(localProjects));
  }
  if (!localStorage.getItem(tasksKey)) {
    const localTasks = parseStoredTasks(localStorage.getItem(PLANNER_TASKS_KEY));
    if (localTasks.length) localStorage.setItem(tasksKey, JSON.stringify(localTasks));
  }
}

function switchNotebookForUser(user) {
  currentUser = user;
  const nextKey = userStorageKey(user);
  const nextDeletedKey = userDeletedStorageKey(user);
  const nextProjectsKey = scopedStorageKey(PLANNER_PROJECTS_KEY, user);
  const nextTasksKey = scopedStorageKey(PLANNER_TASKS_KEY, user);
  if (user) {
    copyLocalNotesToUserStore(nextKey);
    copyLocalDeletedToUserStore(nextDeletedKey);
    copyLocalPlannerToUserStore(nextProjectsKey, nextTasksKey);
  }

  if (nextKey !== storageKey || nextDeletedKey !== deletedStorageKey) {
    storageKey = nextKey;
    deletedStorageKey = nextDeletedKey;
    plannerProjectsKey = nextProjectsKey;
    plannerTasksKey = nextTasksKey;
    selectedId = null;
    noteDraft = null;
    activeTag = null;
    searchQuery = "";
    openTag = null;
    activeProjectId = null;
    taskDetailId = null;
    taskDraft = null;
    searchInput.value = "";
    loadNotes();
    loadPlanner();
    // With sync parked, every notebook seeds locally. (When sync returns:
    // skip seeding for signed-in users so starter notes don't push up.)
    if (!user || !CLOUD_SYNC_ENABLED) seedIfEmpty();
    showScreen("home");
  } else {
    renderScreen();
  }

  if (user && CLOUD_SYNC_ENABLED) {
    cloudStatus = "off"; // clear a previous account's "unavailable" latch
    pullAndMergeCloud();
  } else {
    resetCloudState();
  }

  renderAuth();
}

// ---------- Cloud sync (Firestore) ----------
// Signed-in notes replicate to the user's private Firestore collections
// (users/<uid>/notes and users/<uid>/bin — owner-only security rules).
// localStorage stays the offline-first source; sync is a write-through
// layer: pull+merge on sign-in and on tab focus, debounced push on save.
let cloudApi = null;                 // Firestore bindings, set in initGoogleAuth
let cloudStatus = "off";             // off | syncing | synced | error | unavailable
let cloudNoteStamp = new Map();      // note id -> timestamp last seen in cloud
let cloudBinStamp = new Map();
let cloudPushTimer = null;
let cloudLastPull = 0;

function noteTimestamp(n) {
  return n.deletedAt || n.updated || n.created || "";
}

function cloudReady() {
  return CLOUD_SYNC_ENABLED && !!(cloudApi && currentUser) && cloudStatus !== "unavailable";
}

function cloudDocRef(kind, id) {
  return cloudApi.doc(cloudApi.db, "users", currentUser.uid, kind, String(id));
}

// Strip to known fields so foreign junk never lands in the database
function cloudDocFor(n) {
  const d = {
    id: n.id,
    title: n.title,
    body: n.body,
    tags: n.tags,
    created: n.created || "",
    updated: n.updated || ""
  };
  if (n.deletedAt) d.deletedAt = n.deletedAt;
  return d;
}

function markCloudFailure(error) {
  const msg = String((error && error.message) || error);
  // Firestore not enabled / rules missing: stop retrying this session
  cloudStatus =
    error?.code === "permission-denied" || /not.*(enabled|exist)|precondition/i.test(msg)
      ? "unavailable"
      : "error";
}

// Firestore's SDK retries connection problems forever (endpoint blocked by
// an extension, database not created yet…) — cap every sync round so the
// UI can never sit on "Syncing…" indefinitely.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("cloud sync timed out")), ms))
  ]);
}

// Merge cloud + local: per note id, the newest timestamp wins; when an id
// appears both active and in the bin, the later event decides where it lives.
function mergeCloudState(cloudNotes, cloudBin) {
  const best = new Map();
  const offer = (n, inBin) => {
    const key = String(n.id);
    const current = best.get(key);
    if (!current || noteTimestamp(n) > noteTimestamp(current.note)) {
      best.set(key, { note: n, bin: inBin });
    }
  };
  for (const n of notes) offer(n, false);
  for (const n of deletedNotes) offer(n, true);
  for (const n of cloudNotes) offer(n, false);
  for (const n of cloudBin) offer(n, true);
  notes = [];
  deletedNotes = [];
  for (const { note, bin } of best.values()) (bin ? deletedNotes : notes).push(note);
  notes.sort((a, b) => ((a.created || "") < (b.created || "") ? -1 : 1));
}

async function pullAndMergeCloud() {
  if (!cloudReady()) return;
  cloudStatus = "syncing";
  renderAuth();
  try {
    const uid = currentUser.uid;
    const [noteSnap, binSnap] = await withTimeout(Promise.all([
      cloudApi.getDocs(cloudApi.collection(cloudApi.db, "users", uid, "notes")),
      cloudApi.getDocs(cloudApi.collection(cloudApi.db, "users", uid, "bin"))
    ]), 15000);
    const rawNotes = [], rawBin = [];
    noteSnap.forEach((d) => rawNotes.push(d.data()));
    binSnap.forEach((d) => rawBin.push(d.data()));
    // Reuse the localStorage normalizer so odd cloud docs can't crash us
    const cloudNotes = parseStoredNotes(JSON.stringify(rawNotes));
    const cloudBin = parseStoredNotes(JSON.stringify(rawBin));

    cloudNoteStamp = new Map(cloudNotes.map((n) => [String(n.id), noteTimestamp(n)]));
    cloudBinStamp = new Map(cloudBin.map((n) => [String(n.id), noteTimestamp(n)]));

    mergeCloudState(cloudNotes, cloudBin);
    cloudLastPull = Date.now();
    cloudStatus = "synced";
    save();        // persists merged state locally + schedules push of local-only notes
    saveDeleted();
    renderScreen();
  } catch (error) {
    markCloudFailure(error);
  }
  renderAuth();
}

function scheduleCloudPush() {
  if (!cloudReady()) return;
  clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(pushToCloud, 1500);
}

async function pushToCloud() {
  if (!cloudReady()) return;
  cloudStatus = "syncing";
  renderAuth();
  try {
    const jobs = [];
    const syncCollection = (list, kind, stamps) => {
      const localIds = new Set(list.map((n) => String(n.id)));
      for (const n of list) {
        const key = String(n.id);
        if (stamps.get(key) !== noteTimestamp(n)) {
          jobs.push(
            cloudApi.setDoc(cloudDocRef(kind, key), cloudDocFor(n))
              .then(() => stamps.set(key, noteTimestamp(n)))
          );
        }
      }
      for (const key of [...stamps.keys()]) {
        if (!localIds.has(key)) {
          jobs.push(cloudApi.deleteDoc(cloudDocRef(kind, key)).then(() => stamps.delete(key)));
        }
      }
    };
    syncCollection(notes, "notes", cloudNoteStamp);
    syncCollection(deletedNotes, "bin", cloudBinStamp);
    await withTimeout(Promise.all(jobs), 15000);
    cloudStatus = "synced";
  } catch (error) {
    markCloudFailure(error);
  }
  renderAuth();
}

function resetCloudState() {
  cloudStatus = "off";
  cloudNoteStamp = new Map();
  cloudBinStamp = new Map();
  clearTimeout(cloudPushTimer);
}

// Second device picks up changes when its tab regains focus (≥30s apart)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (cloudReady() && Date.now() - cloudLastPull > 30_000) pullAndMergeCloud();
});

// Best-effort flush of a pending debounced push when the tab closes
window.addEventListener("pagehide", () => {
  if (cloudPushTimer) pushToCloud();
});

async function initGoogleAuth() {
  const config = window.SATURN_FIREBASE_CONFIG;
  if (!hasFirebaseConfig(config)) {
    authStatus = "unconfigured";
    renderAuth();
    return;
  }

  try {
    const [{ initializeApp }, auth, firestore] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-auth.js"),
      CLOUD_SYNC_ENABLED
        ? import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-firestore.js")
        : Promise.resolve(null)
    ]);
    const app = initializeApp(config);
    const firebaseAuth = auth.getAuth(app);
    if (firestore) {
      cloudApi = {
        db: firestore.getFirestore(app),
        collection: firestore.collection,
        doc: firestore.doc,
        getDocs: firestore.getDocs,
        setDoc: firestore.setDoc,
        deleteDoc: firestore.deleteDoc
      };
    }
    const provider = new auth.GoogleAuthProvider();
    authApi = {
      auth: firebaseAuth,
      provider,
      signInWithPopup: auth.signInWithPopup,
      signInWithRedirect: auth.signInWithRedirect,
      signOut: auth.signOut
    };
    authStatus = "ready";
    renderAuth();
    // Surface errors from a redirect-based sign-in round trip (mobile flow).
    auth.getRedirectResult(firebaseAuth).catch((error) => {
      authStatus = "ready";
      authError = friendlyAuthError(error);
      renderAuth();
    });
    auth.onAuthStateChanged(
      firebaseAuth,
      (user) => {
        authStatus = "ready";
        switchNotebookForUser(user);
      },
      (error) => {
        authStatus = "error";
        authError = friendlyAuthError(error);
        renderAuth();
      }
    );
  } catch (error) {
    authStatus = "error";
    authError = friendlyAuthError(error);
    renderAuth();
  }
}

async function signInWithGoogle() {
  if (authStatus === "unconfigured") {
    alert("Add your Firebase web config in public/firebase-config.js first.");
    return;
  }
  if (!authApi) return;

  try {
    authStatus = "loading";
    renderAuth();
    // Popups are unreliable on touch devices — go straight to the
    // redirect flow there, and fall back to it if a popup is blocked.
    if (window.matchMedia("(pointer: coarse)").matches) {
      await authApi.signInWithRedirect(authApi.auth, authApi.provider);
      return;
    }
    await authApi.signInWithPopup(authApi.auth, authApi.provider);
  } catch (error) {
    if (error.code === "auth/popup-blocked") {
      try {
        await authApi.signInWithRedirect(authApi.auth, authApi.provider);
        return;
      } catch (redirectError) {
        error = redirectError;
      }
    }
    authStatus = "ready";
    authError = friendlyAuthError(error);
    renderAuth();
    if (error.code !== "auth/popup-closed-by-user") alert(authError);
  }
}

async function signOutGoogle() {
  if (!authApi) return;
  try {
    authStatus = "loading";
    renderAuth();
    await authApi.signOut(authApi.auth);
  } catch (error) {
    authStatus = "ready";
    authError = friendlyAuthError(error);
    renderAuth();
    alert(authError);
  }
}

// ---------- Actions ----------
function createNote({ title = "", tags = [], body = "" } = {}) {
  const now = new Date().toISOString();
  const note = { id: Date.now(), title, body, tags, created: now, updated: now };
  notes.push(note);
  selectedId = note.id;
  save();
  return note;
}

function updateSelected(patch) {
  const note = getNote(selectedId);
  if (!note) return;
  Object.assign(note, patch, { updated: new Date().toISOString() });
  save();
}

function uniqueActiveTitle(title) {
  const base = (title || "Untitled note").trim() || "Untitled note";
  if (!findByTitle(base)) return base;
  let i = 2;
  while (findByTitle(base + " restored " + i)) i += 1;
  return base + " restored " + i;
}

function saveDraft() {
  const note = getNote(selectedId);
  if (!note || !noteDraft) return;
  Object.assign(note, {
    title: noteDraft.title.trim() || "Untitled note",
    tags: draftTags(),
    body: noteDraft.body,
    updated: new Date().toISOString()
  });
  noteDraft = draftFrom(note);
  save();
  renderScreen();
}

function openNote(id, startMode) {
  if (screen === "note" && selectedId !== id && !confirmDiscardDraft()) return;
  selectedId = id;
  noteDraft = null;
  showScreen("note");
  if (startMode === "edit") renderedBody.focus();
}

function deleteNote(id) {
  const note = getNote(id);
  if (!note) return;
  if (!confirm(`Move “${note.title || "Untitled note"}” to the Dead Stars bin?`)) return;
  const now = new Date().toISOString();
  deletedNotes.unshift({ ...note, deletedAt: now });
  notes = notes.filter((n) => n.id !== id);
  if (selectedId === id) selectedId = null;
  noteDraft = null;
  save();
  saveDeleted();
  if (screen === "note") showScreen("home");
  else renderScreen();
}

function restoreNote(id) {
  const note = deletedNotes.find((n) => n.id === id);
  if (!note) return;
  const restored = { ...note };
  delete restored.deletedAt;
  if (notes.some((n) => n.id === restored.id)) restored.id = Date.now();
  restored.title = uniqueActiveTitle(restored.title);
  restored.updated = new Date().toISOString();
  notes.push(restored);
  deletedNotes = deletedNotes.filter((n) => n.id !== id);
  save();
  saveDeleted();
  selectedId = restored.id;
  noteDraft = null;
  openNote(restored.id, "view");
}

function purgeNote(id) {
  const note = deletedNotes.find((n) => n.id === id);
  if (!note) return;
  if (!confirm(`Delete “${note.title || "Untitled note"}” forever? This can't be undone.`)) return;
  deletedNotes = deletedNotes.filter((n) => n.id !== id);
  saveDeleted();
  renderBin();
}

// ---------- Events ----------
document.querySelectorAll(".nav-link").forEach((btn) =>
  btn.addEventListener("click", () => showScreen(btn.dataset.screen))
);

$("#add-nav").addEventListener("click", () => {
  if (!showScreen("add")) return;
  $("#add-title").value = "";
  $("#add-tags").value = "";
  $("#add-body").value = "";
  $("#add-save").disabled = true;
  $("#add-title").focus();
});

$("#theme-toggle").addEventListener("click", () => {
  dark = !dark;
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  applyTheme();
  renderScreen(); // re-tint tag chips for the new palette
});

googleSignIn.addEventListener("click", signInWithGoogle);
googleSignOut.addEventListener("click", signOutGoogle);

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim();
  renderHome();
});

// Tag pills: toggle filter
tagPillsEl.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if (!pill) return;
  const tag = pill.dataset.tag ?? null;
  activeTag = activeTag === tag ? null : tag;
  renderHome();
});

// Ledger rows: open note, or delete via the row button
ledgerEl.addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del) { deleteNote(Number(del.dataset.del)); return; }
  const row = e.target.closest(".row");
  if (row) openNote(Number(row.dataset.id));
});

// Note screen
$("#back-link").addEventListener("click", () => showScreen("home"));
saveNoteBtn.addEventListener("click", saveDraft);
$("#delete-btn").addEventListener("click", () => deleteNote(selectedId));

titleInput.addEventListener("input", () => {
  const note = getNote(selectedId);
  if (!note) return;
  ensureDraft(note).title = titleInput.value;
  updateSaveState();
});

tagsInput.addEventListener("input", () => {
  const note = getNote(selectedId);
  if (!note) return;
  ensureDraft(note).tagsText = tagsInput.value;
  updateSaveState();
});

renderedBody.addEventListener("input", () => {
  const note = getNote(selectedId);
  if (!note) return;
  ensureDraft(note).body = domToMarkdown(renderedBody);
  updateSaveState();
});

// Wiki links inside rendered markdown: open or create the target note.
// Shared by the note editor and the planner's task-notes preview.
function handleWikiLinkClick(link) {
  const target = findByTitle(link.dataset.link);
  if (target) {
    if (!closeTaskDetail()) return;
    openNote(target.id);
  } else if (confirm(`No note called “${link.dataset.link}” yet. Create it?`)) {
    if (!confirmDiscardDraft()) return;
    if (!closeTaskDetail()) return;
    createNote({ title: link.dataset.link });
    openNote(selectedId, "edit");
  }
}

renderedBody.addEventListener("click", (e) => {
  const link = e.target.closest(".wiki-link");
  if (link) handleWikiLinkClick(link);
});

// Backlinks: open on click
backlinksEl.addEventListener("click", (e) => {
  const row = e.target.closest(".row");
  if (row) openNote(Number(row.dataset.id));
});

// Tag accordion: expand / collapse, open notes
$("#tag-groups").addEventListener("click", (e) => {
  const head = e.target.closest(".group-head");
  if (head) {
    openTag = openTag === head.dataset.tag ? null : head.dataset.tag;
    renderTags();
    return;
  }
  const row = e.target.closest(".row");
  if (row) openNote(Number(row.dataset.id));
});

// Recently edited: open on click
$("#recent-list").addEventListener("click", (e) => {
  const row = e.target.closest(".row");
  if (row) openNote(Number(row.dataset.id));
});

// Dead Stars bin
deletedList.addEventListener("click", (e) => {
  const restore = e.target.closest("[data-restore]");
  if (restore) { restoreNote(Number(restore.dataset.restore)); return; }
  const purge = e.target.closest("[data-purge]");
  if (purge) purgeNote(Number(purge.dataset.purge));
});

// Add form
$("#add-title").addEventListener("input", () => {
  $("#add-save").disabled = $("#add-title").value.trim().length === 0;
});
$("#add-save").addEventListener("click", () => {
  const title = $("#add-title").value.trim();
  if (!title) return;
  const tags = $("#add-tags").value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  createNote({ title, tags, body: $("#add-body").value });
  openNote(selectedId, "view");
});

// ---------- Planner (projects + kanban boards) ----------
const projectNameInput = $("#project-name");
const projectCreateBtn = $("#project-create");
const projectListEl = $("#project-list");
const plannerEmpty = $("#planner-empty");
const boardTitleInput = $("#board-title");
const kbBoard = $("#kb-board");
const taskBackdrop = $("#task-backdrop");
const taskPop = $("#task-pop");
const taskTitleInput = $("#task-title");
const taskDueInput = $("#task-due");
const taskTagsInput = $("#task-tags");
const taskNotesInput = $("#task-notes");
const taskNotesPreview = $("#task-notes-preview");
const taskSaveBtn = $("#task-save");

function getProject(id) {
  return projects.find((p) => p.id === id);
}

function getTask(id) {
  return plannerTasks.find((t) => t.id === id);
}

function tasksFor(projectId, status) {
  return plannerTasks
    .filter((t) => t.projectId === projectId && t.status === status)
    .sort((a, b) => a.order - b.order);
}

function createProject(name) {
  const now = new Date().toISOString();
  const project = { id: Date.now(), name, created: now, updated: now };
  projects.push(project);
  saveProjects();
  return project;
}

function renameProject(id, name) {
  const project = getProject(id);
  if (!project) return;
  project.name = name;
  project.updated = new Date().toISOString();
  saveProjects();
}

function deleteProject(id) {
  const project = getProject(id);
  if (!project) return;
  const count = plannerTasks.filter((t) => t.projectId === id).length;
  const label = count === 1 ? "its 1 task" : `its ${count} tasks`;
  if (!confirm(`Delete “${project.name || "Untitled project"}” and ${label}? This can't be undone.`)) return;
  projects = projects.filter((p) => p.id !== id);
  plannerTasks = plannerTasks.filter((t) => t.projectId !== id);
  saveProjects();
  saveTasks();
  if (screen === "board" && activeProjectId === id) showScreen("planner");
  else renderScreen();
}

function openBoard(projectId) {
  activeProjectId = projectId;
  showScreen("board");
}

function createTask(projectId, status, title) {
  const now = new Date().toISOString();
  const task = {
    id: Date.now(), projectId, title, status,
    due: "", priority: "med", tags: [], notes: "",
    order: tasksFor(projectId, status).length,
    created: now, updated: now,
  };
  plannerTasks.push(task);
  saveTasks();
  return task;
}

function updateTask(id, patch) {
  const task = getTask(id);
  if (!task) return;
  Object.assign(task, patch, { updated: new Date().toISOString() });
  saveTasks();
}

function deleteTask(id) {
  const task = getTask(id);
  if (!task) return false;
  if (!confirm(`Delete “${task.title || "Untitled task"}”? This can't be undone.`)) return false;
  plannerTasks = plannerTasks.filter((t) => t.id !== id);
  saveTasks();
  return true;
}

// Move a task to `status` at position `index`, renumbering both columns
function moveTask(id, status, index) {
  const task = getTask(id);
  if (!task) return;
  const fromStatus = task.status;
  const target = tasksFor(task.projectId, status).filter((t) => t.id !== id);
  target.splice(Math.max(0, Math.min(index, target.length)), 0, task);
  task.status = status;
  task.updated = new Date().toISOString();
  target.forEach((t, i) => { t.order = i; });
  if (fromStatus !== status) tasksFor(task.projectId, fromStatus).forEach((t, i) => { t.order = i; });
  saveTasks();
}

// --- Planner rendering ---
function projectRow(project, index) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.id = project.id;

  const idx = document.createElement("div");
  idx.className = "row-index";
  idx.textContent = String(index + 1).padStart(2, "0");
  row.appendChild(idx);

  const title = document.createElement("div");
  title.className = "row-title";
  title.textContent = project.name || "Untitled project";
  row.appendChild(title);

  const count = plannerTasks.filter((t) => t.projectId === project.id).length;
  const chip = document.createElement("span");
  chip.className = "chip chip-muted";
  chip.textContent = count === 1 ? "1 task" : count + " tasks";
  row.appendChild(chip);

  const x = document.createElement("button");
  x.className = "row-delete";
  x.type = "button";
  x.title = "Delete project";
  x.setAttribute("aria-label", "Delete " + (project.name || "Untitled project"));
  x.textContent = "Delete";
  x.dataset.del = project.id;
  row.appendChild(x);
  return row;
}

function renderPlanner() {
  projectListEl.innerHTML = "";
  const list = [...projects].sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  list.forEach((p, i) => projectListEl.appendChild(projectRow(p, i)));
  plannerEmpty.hidden = list.length > 0;
}

function dueLabel(due) {
  const d = new Date(due + "T00:00:00");
  return MON[d.getMonth()] + " " + d.getDate();
}

function isOverdue(task) {
  if (!task.due || task.status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.due + "T00:00:00") < today;
}

function taskCard(task) {
  const card = document.createElement("div");
  card.className = "kb-card";
  card.dataset.id = task.id;

  const grip = document.createElement("span");
  grip.className = "kb-grip";
  grip.textContent = "⠿";
  grip.title = "Drag to move";
  card.appendChild(grip);

  const body = document.createElement("div");
  body.className = "kb-card-body";

  const title = document.createElement("div");
  title.className = "kb-card-title";
  title.textContent = task.title || "Untitled task";
  body.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "kb-meta";
  if (task.due) {
    const due = document.createElement("span");
    due.className = "chip kb-due" + (isOverdue(task) ? " overdue" : "");
    due.textContent = dueLabel(task.due);
    meta.appendChild(due);
  }
  const prio = document.createElement("span");
  prio.className = "chip kb-prio prio-" + task.priority;
  prio.textContent = task.priority === "med" ? "medium" : task.priority;
  meta.appendChild(prio);
  for (const tag of task.tags.slice(0, 2)) meta.appendChild(chipFor(tag));
  body.appendChild(meta);

  card.appendChild(body);
  return card;
}

function renderBoard() {
  const project = getProject(activeProjectId);
  if (!project) { showScreen("planner"); return; }
  if (document.activeElement !== boardTitleInput) boardTitleInput.value = project.name;
  for (const col of kbBoard.querySelectorAll(".kb-col")) {
    const status = col.dataset.status;
    const cardsEl = col.querySelector(".kb-cards");
    cardsEl.innerHTML = "";
    const list = tasksFor(project.id, status);
    for (const task of list) cardsEl.appendChild(taskCard(task));
    col.querySelector(".kb-count").textContent = list.length ? String(list.length) : "";
  }
}

// --- Task detail panel (draft-based, explicit Save) ---
function taskDraftFrom(task) {
  return {
    id: task.id, title: task.title, status: task.status, due: task.due,
    priority: task.priority, tagsText: task.tags.join(", "), notes: task.notes,
  };
}

function taskDraftIsDirty() {
  const task = getTask(taskDetailId);
  if (!task || !taskDraft) return false;
  return taskDraft.title !== task.title ||
    taskDraft.status !== task.status ||
    taskDraft.due !== task.due ||
    taskDraft.priority !== task.priority ||
    taskDraft.notes !== task.notes ||
    !arraysEqual(normalizeTagsText(taskDraft.tagsText), task.tags);
}

function updateTaskSaveState() {
  taskSaveBtn.disabled = !taskDraftIsDirty();
}

function renderTaskNotesPreview() {
  const text = (taskDraft?.notes || "").trim();
  taskNotesPreview.hidden = !text;
  taskNotesPreview.innerHTML = text ? renderMarkdown(taskDraft.notes) : "";
}

function renderTaskDetail() {
  taskTitleInput.value = taskDraft.title;
  taskDueInput.value = taskDraft.due;
  taskTagsInput.value = taskDraft.tagsText;
  taskNotesInput.value = taskDraft.notes;
  for (const pill of $("#task-status-pills").querySelectorAll(".pill"))
    pill.classList.toggle("active", pill.dataset.status === taskDraft.status);
  for (const pill of $("#task-prio-pills").querySelectorAll(".pill"))
    pill.classList.toggle("active", pill.dataset.prio === taskDraft.priority);
  renderTaskNotesPreview();
  updateTaskSaveState();
}

function openTaskDetail(id) {
  const task = getTask(id);
  if (!task) return;
  taskDetailId = id;
  taskDraft = taskDraftFrom(task);
  renderTaskDetail();
  taskBackdrop.hidden = false;
  taskPop.hidden = false;
  taskTitleInput.focus();
}

// Returns false if the user kept unsaved changes (so callers can bail out)
function closeTaskDetail() {
  if (taskDetailId == null) return true;
  if (taskDraftIsDirty() && !confirm("Discard unsaved changes?")) return false;
  taskDetailId = null;
  taskDraft = null;
  taskBackdrop.hidden = true;
  taskPop.hidden = true;
  return true;
}

function saveTaskDraft() {
  const task = getTask(taskDetailId);
  if (!task || !taskDraft) return;
  const patch = {
    title: taskDraft.title.trim() || "Untitled task",
    status: taskDraft.status,
    due: taskDraft.due,
    priority: taskDraft.priority,
    tags: normalizeTagsText(taskDraft.tagsText),
    notes: taskDraft.notes,
  };
  // A status change re-files the card at the end of its new column
  if (patch.status !== task.status) patch.order = tasksFor(task.projectId, patch.status).length;
  updateTask(taskDetailId, patch);
  taskDraft = taskDraftFrom(getTask(taskDetailId));
  updateTaskSaveState();
  if (screen === "board") renderBoard();
}

// --- Planner events ---
projectNameInput.addEventListener("input", () => {
  projectCreateBtn.disabled = projectNameInput.value.trim().length === 0;
});

function createProjectFromInput() {
  const name = projectNameInput.value.trim();
  if (!name) return;
  const project = createProject(name);
  projectNameInput.value = "";
  projectCreateBtn.disabled = true;
  openBoard(project.id);
}

projectCreateBtn.addEventListener("click", createProjectFromInput);
projectNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") createProjectFromInput();
});

projectListEl.addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del) { deleteProject(Number(del.dataset.del)); return; }
  const row = e.target.closest(".row");
  if (row) openBoard(Number(row.dataset.id));
});

$("#board-back").addEventListener("click", () => showScreen("planner"));
$("#board-delete").addEventListener("click", () => deleteProject(activeProjectId));
boardTitleInput.addEventListener("input", () => renameProject(activeProjectId, boardTitleInput.value));

// "+ Add task" swaps to an inline field: Enter creates, Esc cancels, blur commits
function startInlineAdd(btn) {
  if (btn.hidden) return;
  btn.hidden = true;
  const input = document.createElement("input");
  input.className = "field kb-add-field";
  input.placeholder = "Task title…";
  input.autocomplete = "off";
  btn.parentElement.insertBefore(input, btn);
  input.focus();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const title = input.value.trim();
    input.remove();
    btn.hidden = false;
    if (commit && title) {
      createTask(activeProjectId, btn.dataset.status, title);
      renderBoard();
    }
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") { e.stopPropagation(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true));
}

kbBoard.addEventListener("click", (e) => {
  const add = e.target.closest(".kb-add");
  if (add) { startInlineAdd(add); return; }
  // Tap/click on a card body opens the detail panel (the grip is drag-only —
  // its taps are handled in pointerup so a drag never doubles as a click)
  if (e.target.closest(".kb-grip")) return;
  const card = e.target.closest(".kb-card");
  if (card) openTaskDetail(Number(card.dataset.id));
});

// Task detail events
taskTitleInput.addEventListener("input", () => {
  if (!taskDraft) return;
  taskDraft.title = taskTitleInput.value;
  updateTaskSaveState();
});
taskDueInput.addEventListener("input", () => {
  if (!taskDraft) return;
  taskDraft.due = taskDueInput.value;
  updateTaskSaveState();
});
taskTagsInput.addEventListener("input", () => {
  if (!taskDraft) return;
  taskDraft.tagsText = taskTagsInput.value;
  updateTaskSaveState();
});
taskNotesInput.addEventListener("input", () => {
  if (!taskDraft) return;
  taskDraft.notes = taskNotesInput.value;
  renderTaskNotesPreview();
  updateTaskSaveState();
});
$("#task-status-pills").addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if (!pill || !taskDraft) return;
  taskDraft.status = pill.dataset.status;
  renderTaskDetail();
});
$("#task-prio-pills").addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if (!pill || !taskDraft) return;
  taskDraft.priority = pill.dataset.prio;
  renderTaskDetail();
});
taskSaveBtn.addEventListener("click", saveTaskDraft);
$("#task-close").addEventListener("click", closeTaskDetail);
taskBackdrop.addEventListener("click", closeTaskDetail);
$("#task-delete").addEventListener("click", () => {
  if (!deleteTask(taskDetailId)) return;
  taskDetailId = null;
  taskDraft = null;
  taskBackdrop.hidden = true;
  taskPop.hidden = true;
  if (screen === "board") renderBoard();
});
taskNotesPreview.addEventListener("click", (e) => {
  const link = e.target.closest(".wiki-link");
  if (link) handleWikiLinkClick(link);
});

// --- Drag & drop (pointer events, same tap-vs-drag pattern as the graph) ---
// Drags start only from the grip so card bodies keep native touch scrolling.
let kbPlaceholder = null;

function kbStartGhost(e) {
  const rect = kbDrag.card.getBoundingClientRect();
  const ghost = kbDrag.card.cloneNode(true);
  ghost.classList.add("kb-ghost");
  ghost.style.width = rect.width + "px";
  document.body.appendChild(ghost);
  kbDrag.ghost = ghost;
  kbDrag.offsetX = e.clientX - rect.left;
  kbDrag.offsetY = e.clientY - rect.top;
  kbDrag.card.classList.add("kb-lift");
  kbBoard.classList.add("kb-dragging"); // suspend scroll-snap so auto-scroll can move freely
  kbPlaceholder = document.createElement("div");
  kbPlaceholder.className = "kb-placeholder";
  kbPlaceholder.style.height = rect.height + "px";
}

function kbPlacePlaceholder(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const col = el && el.closest(".kb-col");
  if (!col) return;
  const cardsEl = col.querySelector(".kb-cards");
  let before = null;
  for (const c of cardsEl.querySelectorAll(".kb-card")) {
    if (c === kbDrag.card) continue;
    const r = c.getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) { before = c; break; }
  }
  cardsEl.insertBefore(kbPlaceholder, before);
}

// Nudge the board/column when dragging near an edge (vital on mobile,
// where only one column fits on screen)
function kbAutoScroll(e) {
  const edge = 48, step = 12;
  const br = kbBoard.getBoundingClientRect();
  if (e.clientX < br.left + edge) kbBoard.scrollLeft -= step;
  else if (e.clientX > br.right - edge) kbBoard.scrollLeft += step;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const cardsEl = el && el.closest(".kb-cards");
  if (cardsEl) {
    const cr = cardsEl.getBoundingClientRect();
    if (e.clientY < cr.top + edge) cardsEl.scrollTop -= step;
    else if (e.clientY > cr.bottom - edge) cardsEl.scrollTop += step;
  }
}

function kbEndDrag(drag) {
  drag.ghost?.remove();
  kbPlaceholder?.remove();
  kbPlaceholder = null;
  drag.card.classList.remove("kb-lift");
  kbBoard.classList.remove("kb-dragging");
}

kbBoard.addEventListener("pointerdown", (e) => {
  const grip = e.target.closest(".kb-grip");
  if (!grip) return;
  const card = grip.closest(".kb-card");
  if (!card) return;
  kbDrag = {
    id: Number(card.dataset.id), card,
    startX: e.clientX, startY: e.clientY, moved: false, ghost: null,
  };
  // Capture keeps the drag alive when the pointer leaves the grip; the
  // delegated handlers below still work if capture isn't available.
  try { grip.setPointerCapture(e.pointerId); } catch { /* no active pointer */ }
  e.preventDefault();
});

kbBoard.addEventListener("pointermove", (e) => {
  if (!kbDrag) return;
  if (!kbDrag.moved) {
    // a still-press stays a tap
    if (Math.hypot(e.clientX - kbDrag.startX, e.clientY - kbDrag.startY) < 6) return;
    kbDrag.moved = true;
    kbStartGhost(e);
  }
  kbDrag.ghost.style.left = (e.clientX - kbDrag.offsetX) + "px";
  kbDrag.ghost.style.top = (e.clientY - kbDrag.offsetY) + "px";
  kbPlacePlaceholder(e);
  kbAutoScroll(e);
});

kbBoard.addEventListener("pointerup", (e) => {
  if (!kbDrag) return;
  const drag = kbDrag;
  kbDrag = null;
  if (!drag.moved) { openTaskDetail(drag.id); return; }
  const cardsEl = kbPlaceholder?.parentElement;
  if (cardsEl) {
    const status = cardsEl.closest(".kb-col").dataset.status;
    let index = 0;
    for (const child of cardsEl.children) {
      if (child === kbPlaceholder) break;
      if (child.classList.contains("kb-card") && child !== drag.card) index += 1;
    }
    moveTask(drag.id, status, index);
  }
  kbEndDrag(drag);
  renderBoard();
});

kbBoard.addEventListener("pointercancel", () => {
  if (!kbDrag) return;
  const drag = kbDrag;
  kbDrag = null;
  kbEndDrag(drag);
  renderBoard();
});

// ---------- First run: a tiny linked starter web ----------
function seedIfEmpty() {
  if (notes.length) return;
  const now = new Date().toISOString();
  const mk = (id, title, body, tags) => ({ id, title, body, tags, created: now, updated: now });
  notes = [
    mk(1, "Welcome to Saturn", "# Welcome 🪐\nThis is your **knowledge base**. Every note can link to another with double brackets, like this: [[How linking works]].\n\n- Click a link to jump to that note\n- Dashed links point to notes that *don't exist yet* — click to create them\n- Try [[Ideas]] (it doesn't exist yet!)", ["meta"]),
    mk(2, "How linking works", "Links are written as `[[Note title]]` inside any note.\n\nSaturn scans every note to build **backlinks** — look below: this note is *linked from* [[Welcome to Saturn]].\n\nCheck **Progress** in the sidebar to see how connected your web is.", ["meta"]),
  ];
  save();
}

// ---------- Sidebar toggle (hamburger) ----------
// Desktop: the button collapses/restores the sidebar (body.nav-hidden).
// Mobile: the sidebar is a slide-in drawer (body.nav-open) with a backdrop.
const menuToggle = $("#menu-toggle");
const navBackdrop = $("#nav-backdrop");
const mobileNav = window.matchMedia("(max-width: 880px)");

function navIsOpen() {
  return mobileNav.matches
    ? document.body.classList.contains("nav-open")
    : !document.body.classList.contains("nav-hidden");
}

function setNav(open) {
  if (mobileNav.matches) {
    document.body.classList.toggle("nav-open", open);
    if (navBackdrop) navBackdrop.hidden = !open;
  } else {
    document.body.classList.toggle("nav-hidden", !open);
    document.body.classList.remove("nav-open");
    if (navBackdrop) navBackdrop.hidden = true;
  }
}

menuToggle?.addEventListener("click", () => setNav(!navIsOpen()));
navBackdrop?.addEventListener("click", () => setNav(false));

// Crossing the breakpoint: desktop always starts visible, mobile starts closed
mobileNav.addEventListener("change", () => setNav(!mobileNav.matches));

// Picking a destination closes the drawer on mobile
document.querySelector(".sidebar").addEventListener("click", (e) => {
  if (mobileNav.matches && e.target.closest(".nav-link, .add-nav")) setNav(false);
});

// ---------- Graph (force-directed map of the knowledge web) ----------
// Hand-rolled canvas simulation, no libraries: notes repel each other,
// [[links]] pull their two notes together, everything drifts toward the
// center. Drag a star to rearrange; tap one to open that note.
const graphCanvas = $("#graph-canvas");
const graphEmpty = $("#graph-empty");
let gNodes = [];        // {id, title, x, y, vx, vy, deg, r}
let gEdges = [];        // [indexA, indexB]
let gAnim = null;       // requestAnimationFrame handle
let gHeat = 0;          // remaining simulation frames
let gHot = null;        // hovered node
let gDrag = null;       // node being dragged

function buildGraphData() {
  const jitter = () => (Math.random() - 0.5) * 30;
  gNodes = notes.map((n, i) => {
    const angle = (i / Math.max(notes.length, 1)) * Math.PI * 2;
    return {
      id: n.id, title: n.title,
      x: Math.cos(angle) * 140 + jitter(),
      y: Math.sin(angle) * 140 + jitter(),
      vx: 0, vy: 0, deg: 0, r: 6
    };
  });
  const index = new Map(gNodes.map((g, i) => [g.id, i]));
  const seen = new Set();
  gEdges = [];
  for (const n of notes) {
    for (const t of linksIn(n.body)) {
      const target = findByTitle(t);
      if (!target || target.id === n.id) continue;
      const key = Math.min(n.id, target.id) + ":" + Math.max(n.id, target.id);
      if (seen.has(key)) continue;
      seen.add(key);
      const a = index.get(n.id), b = index.get(target.id);
      gEdges.push([a, b]);
      gNodes[a].deg++;
      gNodes[b].deg++;
    }
  }
  for (const g of gNodes) g.r = 6 + Math.min(g.deg, 6) * 1.6;
}

function graphStep() {
  // Pairwise repulsion
  for (let i = 0; i < gNodes.length; i++) {
    for (let j = i + 1; j < gNodes.length; j++) {
      const a = gNodes[i], b = gNodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
      const f = 5200 / d2;
      const d = Math.sqrt(d2);
      a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
  }
  // Springs along links
  for (const [i, j] of gEdges) {
    const a = gNodes[i], b = gNodes[j];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - 120) * 0.02;
    a.vx += (dx / d) * f; a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
  }
  // Gentle gravity toward the center + damping
  for (const g of gNodes) {
    if (g === gDrag) { g.vx = 0; g.vy = 0; continue; }
    g.vx -= g.x * 0.015; g.vy -= g.y * 0.015;
    g.vx *= 0.85; g.vy *= 0.85;
    g.x += g.vx; g.y += g.vy;
  }
}

function graphDraw() {
  const ctx = graphCanvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = graphCanvas.clientWidth, h = graphCanvas.clientHeight;
  if (graphCanvas.width !== w * dpr || graphCanvas.height !== h * dpr) {
    graphCanvas.width = w * dpr;
    graphCanvas.height = h * dpr;
  }
  const cs = getComputedStyle(document.body);
  const ink = cs.getPropertyValue("--ink").trim();
  const muted = cs.getPropertyValue("--muted").trim();
  const line = cs.getPropertyValue("--line").trim();
  const surface = cs.getPropertyValue("--surface").trim();

  ctx.setTransform(dpr, 0, 0, dpr, dpr * w / 2, dpr * h / 2);
  ctx.clearRect(-w / 2, -h / 2, w, h);

  const showLabels = gNodes.length <= 60;
  ctx.lineWidth = 1.2;
  for (const [i, j] of gEdges) {
    const a = gNodes[i], b = gNodes[j];
    const hotEdge = gHot && (a === gHot || b === gHot);
    ctx.strokeStyle = hotEdge ? ink : line;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const g of gNodes) {
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
    if (g === gHot) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.2;
    }
    if (showLabels || g === gHot) {
      const label = g.title.length > 20 ? g.title.slice(0, 19) + "…" : g.title;
      ctx.font = "600 11px Quicksand, sans-serif";
      ctx.textAlign = "center";
      // Halo so labels stay readable over edges
      ctx.strokeStyle = surface;
      ctx.lineWidth = 3;
      ctx.strokeText(label, g.x, g.y + g.r + 14);
      ctx.lineWidth = 1.2;
      ctx.fillStyle = g === gHot ? ink : muted;
      ctx.fillText(label, g.x, g.y + g.r + 14);
    }
  }
}

function graphLoop() {
  if (screen !== "graph") { gAnim = null; return; }
  if (gHeat > 0) { graphStep(); gHeat--; }
  graphDraw();
  gAnim = requestAnimationFrame(graphLoop);
}

function renderGraph() {
  if (!graphCanvas) return; // stale cached HTML
  const hasEdges = notes.length > 0;
  graphEmpty.hidden = notes.length > 0;
  graphCanvas.parentElement.hidden = !hasEdges;
  if (!hasEdges) return;
  buildGraphData();
  gHeat = 300;
  gHot = null;
  if (!gAnim) gAnim = requestAnimationFrame(graphLoop);
}

// Canvas coordinates -> simulation coordinates (origin at canvas center)
function graphPoint(e) {
  const rect = graphCanvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left - rect.width / 2,
    y: e.clientY - rect.top - rect.height / 2
  };
}

function graphNodeAt(p) {
  let best = null, bestD = Infinity;
  for (const g of gNodes) {
    const dx = g.x - p.x, dy = g.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < Math.max(g.r + 8, 16) && d < bestD) { best = g; bestD = d; }
  }
  return best;
}

graphCanvas?.addEventListener("pointerdown", (e) => {
  const node = graphNodeAt(graphPoint(e));
  if (!node) return;
  gDrag = node;
  gDrag.moved = false;
  graphCanvas.setPointerCapture(e.pointerId);
});

graphCanvas?.addEventListener("pointermove", (e) => {
  const p = graphPoint(e);
  if (gDrag) {
    gDrag.x = p.x; gDrag.y = p.y;
    gDrag.moved = true;
    gHeat = Math.max(gHeat, 60); // let neighbours settle around the new spot
    return;
  }
  gHot = graphNodeAt(p);
  graphCanvas.style.cursor = gHot ? "pointer" : "default";
});

graphCanvas?.addEventListener("pointerup", (e) => {
  if (!gDrag) return;
  const node = gDrag;
  gDrag = null;
  graphCanvas.releasePointerCapture(e.pointerId);
  // A press without movement is a tap: open the note
  if (!node.moved) openNote(node.id);
});

graphCanvas?.addEventListener("pointerleave", () => { gHot = null; });

window.addEventListener("resize", () => {
  if (screen === "graph") gHeat = Math.max(gHeat, 30);
});

// ---------- AI (Summarize + Ask Saturn) ----------
// The browser never holds the Gemini key: requests go to /api/ai (a Vercel
// serverless function) with the signed-in user's Firebase ID token, and the
// answer streams back as plain text, rendered as Markdown once complete.
const aiSummarizeBtn = $("#ai-summarize");
const aiSummaryPanel = $("#ai-summary");
const aiSummaryBody  = $("#ai-summary-body");
const aiInsertBtn    = $("#ai-insert");
const askFab   = $("#ask-fab");
const askPop   = $("#ask-pop");
const askForm  = $("#ask-form");
const askInput = $("#ask-input");
const askBtn   = $("#ask-btn");
const askHint  = $("#ask-hint");
const askPanel = $("#ask-answer");
const askBody  = $("#ask-answer-body");

let aiBusy = false;
let lastSummary = "";
let aiSummaryNoteId = null;

function aiReady() {
  return !!currentUser;
}

function renderAiAvailability() {
  if (!aiSummarizeBtn || !askBtn) return; // stale cached HTML — skip, don't crash
  const ready = aiReady();
  const hint = authStatus === "unconfigured"
    ? "Google sign-in isn't set up yet — AI needs it."
    : "Sign in with Google to use AI.";
  aiSummarizeBtn.disabled = !ready || aiBusy;
  aiSummarizeBtn.title = ready ? "Summarize this note with AI" : hint;
  askBtn.disabled = !ready || aiBusy;
  askInput.disabled = !ready;
  askHint.hidden = ready;
  askHint.textContent = hint;
}

// Called from renderNote: drop a stale summary when a different note opens.
function syncAiSummaryPanel(noteId) {
  if (aiSummaryNoteId === noteId) return;
  aiSummaryPanel.hidden = true;
  aiInsertBtn.hidden = true;
  lastSummary = "";
}

function noteForAi(note) {
  return { title: note.title, tags: note.tags, body: note.body };
}

async function streamAI(payload, bodyEl) {
  const token = await currentUser.getIdToken();
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    let message = "The AI request failed. Try again in a moment.";
    try { message = (await response.json()).error || message; } catch { /* keep default */ }
    throw new Error(message);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    bodyEl.classList.remove("pending");
    bodyEl.textContent = text;
  }
  return text;
}

async function runAI(payload, panel, bodyEl, onDone) {
  if (!aiReady() || aiBusy) return;
  aiBusy = true;
  renderAiAvailability();
  panel.hidden = false;
  bodyEl.classList.add("pending");
  bodyEl.classList.remove("error");
  bodyEl.textContent = "Thinking…";
  try {
    const text = await streamAI(payload, bodyEl);
    bodyEl.classList.remove("pending");
    bodyEl.innerHTML = renderMarkdown(text);
    if (onDone) onDone(text);
  } catch (error) {
    bodyEl.classList.remove("pending");
    bodyEl.classList.add("error");
    bodyEl.textContent = error.message;
  } finally {
    aiBusy = false;
    renderAiAvailability();
  }
}

aiSummarizeBtn.addEventListener("click", () => {
  const note = getNote(selectedId);
  if (!note) return;
  const draft = ensureDraft(note);
  aiSummaryNoteId = note.id;
  aiInsertBtn.hidden = true;
  runAI(
    { mode: "summarize", note: { title: draft.title, tags: draftTags(), body: draft.body } },
    aiSummaryPanel, aiSummaryBody,
    (text) => {
      lastSummary = text.trim();
      aiInsertBtn.hidden = lastSummary.length === 0;
    }
  );
});

aiInsertBtn.addEventListener("click", () => {
  const note = getNote(selectedId);
  if (!note || !lastSummary) return;
  const draft = ensureDraft(note);
  draft.body = draft.body.replace(/\s+$/, "") + "\n\n## AI summary\n" + lastSummary + "\n";
  renderedBody.innerHTML = renderMarkdown(draft.body);
  updateSaveState();
  aiSummaryPanel.hidden = true;
});

$("#ai-summary-close").addEventListener("click", () => { aiSummaryPanel.hidden = true; });
$("#ask-close").addEventListener("click", () => { askPanel.hidden = true; });

askFab?.addEventListener("click", () => {
  askPop.hidden = !askPop.hidden;
  if (!askPop.hidden && aiReady()) askInput.focus();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!taskPop.hidden) { closeTaskDetail(); return; }
  askPop.hidden = true;
  if (mobileNav.matches) setNav(false);
});

askForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const question = askInput.value.trim();
  if (!question) return;
  runAI({ mode: "ask", question, notes: notes.map(noteForAi) }, askPanel, askBody);
});

// ---------- Boot ----------
const versionEl = document.getElementById("app-version");
if (versionEl) versionEl.textContent = "SATURN " + APP_VERSION.toUpperCase();
load();
seedIfEmpty();
applyTheme();
wireFormatting();
renderAuth();
showScreen("home");
initGoogleAuth();
