import { describe, expect, it } from "vitest";
import { createBackup, prepareImport, validateBackup } from "../../public/modules/backup.js";

const empty = { notes: [], deletedNotes: [], projects: [], tasks: [] };

describe("backup contract", () => {
  it("round-trips a valid versioned bundle", () => {
    const backup = createBackup({ appVersion: "v15", state: { ...empty, notes: [{ id: 1, title: "A", body: "", tags: [] }] } });
    expect(validateBackup(backup).valid).toBe(true);
    expect(prepareImport(empty, backup, "replace").notes[0].title).toBe("A");
  });

  it("rejects corrupt data before preparing mutation", () => {
    expect(validateBackup({ format: "saturn-backup", schemaVersion: 999 }).valid).toBe(false);
    expect(() => prepareImport(empty, { format: "wrong" }, "replace")).toThrow();
  });
});
