import { conflictCopy, newId, renameNoteState, rewriteWikiLinks, sameId, titleKey, uniqueTitle } from "./domain.js";

/* Note rules, as pure functions over the notebook state. */

export const IMAGE_TOKEN = /\{\{img:([\w-]+)(?::\d+)?\}\}/g;
const ASK_MAX_NOTES = 12;
const ASK_MAX_BODY_CHARS = 1500;

export function linksIn(body) {
  return [...String(body).matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1].trim());
}

export function findByTitle(notes, title) {
  const key = titleKey(title);
  return notes.find((note) => titleKey(note.title) === key);
}

export function backlinksTo(notes, note) {
  const key = titleKey(note.title);
  return notes.filter((other) => !sameId(other.id, note.id) && linksIn(other.body).some((title) => titleKey(title) === key));
}

// One pass over the notebook, so screens don't rescan every note per note.
export function orphanIds(notes) {
  const targets = new Set(notes.flatMap((note) => linksIn(note.body).map(titleKey)));
  return new Set(notes
    .filter((note) => linksIn(note.body).length === 0 && !targets.has(titleKey(note.title)))
    .map((note) => String(note.id)));
}

export function allTags(notes) {
  return [...new Set(notes.flatMap((note) => note.tags))].sort();
}

export function parseTags(text) {
  return [...new Set(String(text).split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export function imageIdsIn(notes) {
  const ids = new Set();
  for (const note of notes) {
    for (const match of String(note.body).matchAll(IMAGE_TOKEN)) ids.add(match[1]);
  }
  return ids;
}

export function createNote(state, { title = "", tags = [], body = "", now = new Date().toISOString(), deviceId } = {}) {
  const note = {
    id: newId(), title: uniqueTitle(title, state.notes), body, tags, created: now, updated: now,
    revision: 0, baseRevision: 0, deviceId,
  };
  return { state: { ...state, notes: [...state.notes, note] }, note };
}

function bumped(note, now, deviceId) {
  return { ...note, updated: now, baseRevision: note.revision || 0, revision: (note.revision || 0) + 1, deviceId };
}

export function saveNoteDraft(state, { id, title, tags, body }, { now = new Date().toISOString(), deviceId } = {}) {
  const current = state.notes.find((note) => sameId(note.id, id));
  if (!current) return { error: "not_found" };
  const nextTitle = uniqueTitle(title, state.notes, id);
  const renamed = renameNoteState(state, id, nextTitle, now);
  return {
    ...renamed,
    notes: renamed.notes.map((note) => (sameId(note.id, id)
      ? bumped({ ...note, title: nextTitle, tags, body: rewriteWikiLinks(body, current.title, nextTitle) }, now, deviceId)
      : note)),
  };
}

export function deleteNote(state, id, { now = new Date().toISOString(), deviceId } = {}) {
  const note = state.notes.find((item) => sameId(item.id, id));
  if (!note) return { error: "not_found" };
  return {
    ...state,
    notes: state.notes.filter((item) => !sameId(item.id, id)),
    // `updated` must move too: sync picks winners by it, so a deletion that
    // kept the old date would lose to the cloud's copy and come back.
    deletedNotes: [{ ...bumped(note, now, deviceId), deletedAt: now, tombstone: true }, ...state.deletedNotes],
  };
}

export function restoreNote(state, id, { now = new Date().toISOString(), deviceId } = {}) {
  const note = state.deletedNotes.find((item) => sameId(item.id, id));
  if (!note) return { error: "not_found" };
  const { deletedAt: _deletedAt, tombstone: _tombstone, purged: _purged, ...rest } = note;
  const restored = bumped({ ...rest, title: uniqueTitle(note.title, state.notes) }, now, deviceId);
  if (state.notes.some((item) => sameId(item.id, restored.id))) restored.id = newId();
  // The bin copy goes entirely: keeping a tombstone under the same id would
  // let sync delete the note that was just restored.
  return {
    state: { ...state, notes: [...state.notes, restored], deletedNotes: state.deletedNotes.filter((item) => !sameId(item.id, id)) },
    note: restored,
  };
}

// Content is erased now. An empty tombstone stays so other devices learn the
// note is gone instead of syncing it back; it expires with the usual retention.
export function purgeNote(state, id, { now = new Date().toISOString(), deviceId } = {}) {
  const note = state.deletedNotes.find((item) => sameId(item.id, id));
  if (!note) return { error: "not_found" };
  const emptied = {
    ...bumped(note, now, deviceId), title: "Deleted note", body: "", tags: [],
    deletedAt: note.deletedAt || now, tombstone: true, purged: true,
  };
  return { ...state, deletedNotes: state.deletedNotes.map((item) => (sameId(item.id, id) ? emptied : item)) };
}

export function draftFrom(note) {
  return { id: note.id, title: note.title, tagsText: note.tags.join(", "), body: note.body };
}

export function draftIsDirty(draft, note) {
  if (!draft || !note) return false;
  const tags = parseTags(draft.tagsText);
  return draft.title !== note.title || draft.body !== note.body ||
    tags.length !== note.tags.length || tags.some((tag, index) => tag !== note.tags[index]);
}

// Another tab saved while this one has unsaved edits: this tab's base stays,
// and the other tab's version is kept as a conflict copy, so nothing is lost.
export function reconcileExternalNote(external, localNote) {
  const incoming = external.notes.find((note) => sameId(note.id, localNote.id));
  if (!incoming || JSON.stringify(incoming) === JSON.stringify(localNote)) return { state: external, conflict: false };
  const others = external.notes.filter((note) => !sameId(note.id, localNote.id));
  return {
    state: { ...external, notes: [...others, localNote, conflictCopy(incoming, [...others, localNote], "other tab")] },
    conflict: true,
  };
}

export function noteForAi({ title, tags, body }) {
  // Image tokens mean nothing to the model. Limits match the API's validation.
  return {
    title: String(title).slice(0, 300),
    tags: tags.slice(0, 30).map((tag) => tag.slice(0, 100)),
    body: String(body).replace(IMAGE_TOKEN, "").trim(),
  };
}

// Rank notes against the question and cap the payload, so the first word
// arrives quickly and only relevant notes leave the browser.
export function relevantNotesFor(notes, question) {
  const terms = [...new Set(question.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2))];
  const hits = notes
    .map((note) => {
      const title = note.title.toLowerCase();
      const body = note.body.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += 6;
        if (note.tags.some((tag) => tag.includes(term))) score += 4;
        if (body.includes(term)) score += 2;
      }
      return { note, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.note);
  const picked = hits.length ? hits : [...notes].sort((a, b) => b.updated.localeCompare(a.updated));
  return picked.slice(0, ASK_MAX_NOTES).map((note) => {
    const slim = noteForAi(note);
    return { ...slim, body: slim.body.slice(0, ASK_MAX_BODY_CHARS) };
  });
}

export function starterNotes(now = new Date().toISOString()) {
  const note = (id, title, body, tags) => ({ id, title, body, tags, created: now, updated: now });
  return [
    note(1, "Welcome to Saturn", "# Welcome 🪐\nThis is your **knowledge base**. Every note can link to another with double brackets, like this: [[How linking works]].\n\n- Click a link to jump to that note\n- Dashed links point to notes that *don't exist yet* — click to create them\n- Try [[Ideas]] (it doesn't exist yet!)", ["meta"]),
    note(2, "How linking works", "Links are written as `[[Note title]]` inside any note.\n\nSaturn scans every note to build **backlinks** — look below: this note is *linked from* [[Welcome to Saturn]].\n\nCheck **Progress** in the sidebar to see how connected your web is.", ["meta"]),
  ];
}
