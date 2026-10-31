import { describe, expect, it } from "vitest";
import { dedupeTitles, isHttpUrl, normalizeProject, normalizeTask, renameNoteState, rewriteWikiLinks, uniqueTitle } from "../../public/modules/domain.js";

describe("HQ fields on records", () => {
  it("drops links that are not http or https", () => {
    const project = normalizeProject({ id: 1, links: [
      { id: "a", label: "Site", url: "https://example.com" },
      { id: "b", label: "Bad", url: "javascript:alert(1)" },
      { id: "c", label: "Data", url: "data:text/html,hi" },
      { id: "d", label: "Junk", url: "not a url" },
    ] });
    expect(project.links.map((link) => link.id)).toEqual(["a"]);
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
  });

  it("replaces unknown stages and categories with the defaults", () => {
    expect(normalizeProject({ id: 1, stage: "x", category: "y" })).toMatchObject({ stage: "next", category: "portfolio" });
  });

  it("is stable: normalizing twice changes nothing", () => {
    const once = normalizeProject({ id: 1, updated: "2026-01-01T00:00:00.000Z", log: [{ text: "hi" }], links: [{ url: "https://a.b" }] });
    expect(normalizeProject(once)).toEqual(once);
  });

  it("only treats a real true as this week", () => {
    expect(normalizeTask({ id: 1, projectId: 2, thisWeek: "yes" }).thisWeek).toBe(false);
    expect(normalizeTask({ id: 1, projectId: 2, thisWeek: true }).thisWeek).toBe(true);
  });
});

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
