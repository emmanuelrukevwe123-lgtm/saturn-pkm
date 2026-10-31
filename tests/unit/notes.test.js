import { describe, expect, it } from "vitest";
import { mergeSyncCollection } from "../../src/lib/cloud-sync.js";
import {
  backlinksTo, createNote, deleteNote, draftIsDirty, noteForAi, orphanIds, parseTags, purgeNote, reconcileExternalNote,
  relevantNotesFor, restoreNote, saveNoteDraft,
} from "../../src/lib/notes.js";

const NOW = "2026-06-10T12:00:00.000Z";
const note = (id, extra = {}) => ({ id, title: `Note ${id}`, body: "", tags: [], created: "2026-01-01", updated: "2026-01-01T00:00:00.000Z", revision: 1, ...extra });
const notebook = (notes = [], deletedNotes = []) => Object.freeze({ notes, deletedNotes, projects: [], tasks: [], tracks: [], hq: {} });

describe("links", () => {
  it("matches backlinks the same way titles match everywhere else", () => {
    const notes = [note(1, { title: "My  Idea" }), note(2, { body: "see [[my idea]]" })];
    expect(backlinksTo(notes, notes[0]).map((item) => item.id)).toEqual([2]);
  });

  it("finds orphans in one pass", () => {
    const notes = [note(1, { body: "[[Note 2]]" }), note(2), note(3)];
    expect([...orphanIds(notes)]).toEqual(["3"]);
  });
});

describe("parseTags", () => {
  it("trims, lowercases and drops duplicates", () => {
    expect(parseTags(" A, b ,a,,")).toEqual(["a", "b"]);
  });
});

describe("note lifecycle", () => {
  it("creates with a unique title", () => {
    const { state } = createNote(notebook([note(1, { title: "A" })]), { title: "a", now: NOW });
    expect(state.notes[1].title).toBe("a (2)");
  });

  it("saving a rename rewrites links and stamps the note", () => {
    const state = notebook([note(1, { title: "Old" }), note(2, { body: "[[Old]]" })]);
    const next = saveNoteDraft(state, { id: 1, title: "New", tags: ["x"], body: "self [[Old]]" }, { now: NOW, deviceId: "d" });
    expect(next.notes[0]).toMatchObject({ title: "New", tags: ["x"], body: "self [[New]]", updated: NOW, revision: 2, baseRevision: 1, deviceId: "d" });
    expect(next.notes[1].body).toBe("[[New]]");
    expect(state.notes[0].title).toBe("Old");
  });

  it("a deletion moves `updated`, so it beats the older cloud copy in a merge", () => {
    const original = note(1);
    const deleted = deleteNote(notebook([original]), 1, { now: NOW }).deletedNotes[0];
    expect(deleted).toMatchObject({ updated: NOW, deletedAt: NOW, tombstone: true });
    const merged = mergeSyncCollection([deleted], [original], "note");
    expect(merged).toHaveLength(1);
    expect(merged[0].tombstone).toBe(true);
  });

  it("restoring leaves no tombstone behind to delete it again", () => {
    const deleted = { ...note(1), deletedAt: "2026-02-01T00:00:00.000Z", tombstone: true };
    const { state, note: restored } = restoreNote(notebook([], [deleted]), 1, { now: NOW });
    expect(state.deletedNotes).toEqual([]);
    expect(restored.tombstone).toBeUndefined();
    expect(restored.deletedAt).toBeUndefined();
    expect(state.notes[0].id).toBe(1);
  });

  it("restoring gives a clashing title a new number", () => {
    const deleted = { ...note(1, { title: "A" }), tombstone: true };
    expect(restoreNote(notebook([note(2, { title: "A" })], [deleted]), 1, { now: NOW }).note.title).toBe("A (2)");
  });

  it("delete forever erases the content but tells other devices", () => {
    const deleted = { ...note(1, { title: "Secret", body: "private", tags: ["t"] }), tombstone: true, deletedAt: "2026-02-01T00:00:00.000Z" };
    const [purged] = purgeNote(notebook([], [deleted]), 1, { now: NOW }).deletedNotes;
    expect(purged).toMatchObject({ title: "Deleted note", body: "", tags: [], purged: true, tombstone: true, updated: NOW });
    expect(JSON.stringify(purged)).not.toContain("private");
    expect(mergeSyncCollection([purged], [deleted], "note")[0].purged).toBe(true);
  });
});

describe("drafts", () => {
  it("notices real changes only", () => {
    const base = note(1, { tags: ["a"] });
    expect(draftIsDirty({ title: base.title, body: "", tagsText: " A, a" }, base)).toBe(false);
    expect(draftIsDirty({ title: "x", body: "", tagsText: "a" }, base)).toBe(true);
    expect(draftIsDirty({ title: base.title, body: "", tagsText: "a, b" }, base)).toBe(true);
  });

  it("keeps both versions when another tab changed the open note", () => {
    const local = note(1, { body: "base" });
    const external = notebook([note(1, { body: "theirs" })]);
    const { state, conflict } = reconcileExternalNote(external, local);
    expect(conflict).toBe(true);
    expect(state.notes.map((item) => item.body).sort()).toEqual(["base", "theirs"]);
    expect(state.notes.find((item) => item.body === "theirs").title).toContain("conflict");
  });

  it("reports no conflict when nothing differs", () => {
    const local = note(1);
    expect(reconcileExternalNote(notebook([local]), local).conflict).toBe(false);
  });
});

describe("what's sent to AI", () => {
  it("strips image tokens and respects the API's limits", () => {
    const slim = noteForAi({ title: "t".repeat(400), tags: Array(40).fill("x"), body: "a {{img:abc:50}} b" });
    expect(slim.title).toHaveLength(300);
    expect(slim.tags).toHaveLength(30);
    expect(slim.body).toBe("a  b");
  });

  it("sends only matching notes when the question matches, capped in size", () => {
    const notes = [note(1, { title: "Docker", body: "x".repeat(5000) }), note(2, { title: "Cooking" })];
    const picked = relevantNotesFor(notes, "docker images");
    expect(picked.map((item) => item.title)).toEqual(["Docker"]);
    expect(picked[0].body).toHaveLength(1500);
  });
});
