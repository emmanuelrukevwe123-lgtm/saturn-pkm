/* ============================================================
   Saturn PKM — all app logic
   State = an array of note objects, saved to localStorage.
   Links are NOT stored: they are found by scanning note bodies
   for [[Note title]] patterns.
   Screens (home / note / tags / progress / add) mirror the
   Saturn design export's Today / Topics / Progress / Add views.
   ============================================================ */

const STORAGE_KEY = "saturn-pkm-notes";
const TRASH_KEY = "saturn-pkm-deleted-notes";
const THEME_KEY = "saturn-pkm-theme";
const FIREBASE_SDK_VERSION = "12.15.0";

// ---------- State ----------
let notes = [];          // the whole knowledge base
let deletedNotes = [];   // recoverable notes in the Dead Stars bin
let storageKey = STORAGE_KEY;
let deletedStorageKey = TRASH_KEY;
let selectedId = null;   // which note is open on the note screen
let activeTag = null;    // tag filter (null = all)
let searchQuery = "";    // live search text
let mode = "view";       // "view" | "edit"
let screen = "home";     // "home" | "note" | "tags" | "progress" | "bin" | "add"
let openTag = null;      // which tag accordion is expanded
let dark = false;
let currentUser = null;
let authStatus = "checking";
let authError = "";
let authApi = null;
let noteDraft = null;

const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Grayscale tag palette from the Saturn design (light / dark values)
const TAG_LIGHT = ["#2B2B2B", "#555555", "#7A7A7A", "#9E9E9E"];
const TAG_DARK  = ["#E8E8E8", "#BDBDBD", "#969696", "#707070"];

// ---------- Elements ----------
const $ = (sel) => document.querySelector(sel);

const screens = {
  home: $("#screen-home"),
  note: $("#screen-note"),
  tags: $("#screen-tags"),
  progress: $("#screen-progress"),
  bin: $("#screen-bin"),
  add: $("#screen-add"),
};

const ledgerEl     = $("#ledger");
const listHeading  = $("#list-heading");
const tagPillsEl   = $("#tag-pills");
const searchInput  = $("#search-input");
const homeEmpty    = $("#home-empty");

const titleInput   = $("#note-title");
const tagsInput    = $("#note-tags");
const noteEyebrow  = $("#note-eyebrow");
const renderedBody = $("#rendered-body");
const bodyEditor   = $("#note-body");
const backlinksEl  = $("#backlinks");
const noBacklinks  = $("#no-backlinks");
const modeToggle   = $("#mode-toggle");
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
    return Array.isArray(parsed) ? parsed : [];
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

function save() {
  localStorage.setItem(storageKey, JSON.stringify(notes));
}

function saveDeleted() {
  localStorage.setItem(deletedStorageKey, JSON.stringify(deletedNotes));
}

function loadNotes() {
  notes = storedNotesFor(storageKey);
  deletedNotes = storedNotesFor(deletedStorageKey);
}

function load() {
  loadNotes();
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
  return html || '<p class="muted">Empty note — switch to Edit to write.</p>';
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
  document.querySelectorAll(".nav-link").forEach((b) =>
    // the note screen still belongs to "Notes" in the nav
    b.classList.toggle("active", b.dataset.screen === (name === "note" ? "home" : name))
  );
  renderScreen();
  return true;
}

function renderScreen() {
  if (screen === "home") renderHome();
  else if (screen === "note") renderNote();
  else if (screen === "tags") renderTags();
  else if (screen === "progress") renderProgress();
  else if (screen === "bin") renderBin();
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
  if (document.activeElement !== bodyEditor) bodyEditor.value = draft.body;

  renderedBody.hidden = mode !== "view";
  bodyEditor.hidden = mode !== "edit";
  modeToggle.textContent = mode === "view" ? "Edit" : "Preview";
  modeToggle.classList.toggle("active", mode === "edit");

  if (mode === "view") renderedBody.innerHTML = renderMarkdown(draft.body);
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
  authName.textContent = signedIn
    ? currentUser.displayName || currentUser.email || "Google account"
    : "Not signed in";

  if (signedIn) {
    authMeta.textContent = currentUser.email || "Local Google notebook";
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

function switchNotebookForUser(user) {
  currentUser = user;
  const nextKey = userStorageKey(user);
  const nextDeletedKey = userDeletedStorageKey(user);
  if (user) {
    copyLocalNotesToUserStore(nextKey);
    copyLocalDeletedToUserStore(nextDeletedKey);
  }

  if (nextKey !== storageKey || nextDeletedKey !== deletedStorageKey) {
    storageKey = nextKey;
    deletedStorageKey = nextDeletedKey;
    selectedId = null;
    noteDraft = null;
    activeTag = null;
    searchQuery = "";
    mode = "view";
    openTag = null;
    searchInput.value = "";
    loadNotes();
    seedIfEmpty();
    showScreen("home");
  } else {
    renderScreen();
  }

  renderAuth();
}

async function initGoogleAuth() {
  const config = window.SATURN_FIREBASE_CONFIG;
  if (!hasFirebaseConfig(config)) {
    authStatus = "unconfigured";
    renderAuth();
    return;
  }

  try {
    const [{ initializeApp }, auth] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-auth.js")
    ]);
    const app = initializeApp(config);
    const firebaseAuth = auth.getAuth(app);
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
  mode = "view";
  renderScreen();
}

function openNote(id, startMode = "view") {
  if (screen === "note" && selectedId !== id && !confirmDiscardDraft()) return;
  selectedId = id;
  mode = startMode;
  noteDraft = null;
  showScreen("note");
  if (startMode === "edit") bodyEditor.focus();
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
modeToggle.addEventListener("click", () => {
  mode = mode === "view" ? "edit" : "view";
  renderNote();
  if (mode === "edit") bodyEditor.focus();
});
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

bodyEditor.addEventListener("input", () => {
  const note = getNote(selectedId);
  if (!note) return;
  ensureDraft(note).body = bodyEditor.value;
  updateSaveState();
});

// Wiki links inside rendered markdown: open or create the target note
renderedBody.addEventListener("click", (e) => {
  const link = e.target.closest(".wiki-link");
  if (!link) return;
  const target = findByTitle(link.dataset.link);
  if (target) openNote(target.id);
  else if (confirm(`No note called “${link.dataset.link}” yet. Create it?`)) {
    if (!confirmDiscardDraft()) return;
    createNote({ title: link.dataset.link });
    openNote(selectedId, "edit");
  }
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
  bodyEditor.value = draft.body;
  if (mode === "view") renderedBody.innerHTML = renderMarkdown(draft.body);
  updateSaveState();
  aiSummaryPanel.hidden = true;
});

$("#ai-summary-close").addEventListener("click", () => { aiSummaryPanel.hidden = true; });
$("#ask-close").addEventListener("click", () => { askPanel.hidden = true; });

askFab.addEventListener("click", () => {
  askPop.hidden = !askPop.hidden;
  if (!askPop.hidden && aiReady()) askInput.focus();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") askPop.hidden = true;
});

askForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const question = askInput.value.trim();
  if (!question) return;
  runAI({ mode: "ask", question, notes: notes.map(noteForAi) }, askPanel, askBody);
});

// ---------- Boot ----------
load();
seedIfEmpty();
applyTheme();
renderAuth();
showScreen("home");
initGoogleAuth();
