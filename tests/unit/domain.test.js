import { describe, expect, it } from "vitest";
import { dedupeTitles, renameNoteState, rewriteWikiLinks, uniqueTitle } from "../../public/modules/domain.js";

describe("title and wiki-link domain rules", () => {
  it("deduplicates titles case-insensitively and deterministically", () => {
    const notes = dedupeTitles([
      { id: 1, title: "Orbit" }, { id: 2, title: " orbit " }, { id: 3, title: "ORBIT" },
    ]);
    expect(notes.map((note) => note.title)).toEqual(["Orbit", "orbit (2)", "ORBIT (3)"]);
    expect(uniqueTitle("orbit", notes)).toBe("orbit (4)");
  });

  it("rewrites only matching wiki links", () => {
    expect(rewriteWikiLinks("[[Old]] and [[older]] and [[ old ]]", "old", "New"))
      .toBe("[[New]] and [[older]] and [[New]]");
  });

  it("renames note and task links as one state transition", () => {
    const state = renameNoteState({
      notes: [
        { id: 1, title: "Old", body: "self [[Old]]", updated: "a" },
        { id: 2, title: "Ref", body: "see [[old]]", updated: "a" },
      ],
      tasks: [{ id: 3, notes: "do [[OLD]]", updated: "a" }],
    }, 1, "New", "2026-01-01T00:00:00.000Z");
    expect(state.notes.map((note) => note.body)).toEqual(["self [[New]]", "see [[New]]"]);
    expect(state.tasks[0].notes).toBe("do [[New]]");
  });
});
