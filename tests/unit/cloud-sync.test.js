import { describe, expect, it } from "vitest";
import { mergeSyncCollection, syncRecord, tombstoneExpired } from "../../public/modules/cloud-sync.js";

describe("cloud sync domain", () => {
  it("preserves divergent note edits as a conflict copy", () => {
    const base = { id: "n", title: "Note", body: "", revision: 2, baseRevision: 1, deviceId: "a" };
    const records = mergeSyncCollection(
      [{ ...base, body: "local", updated: "2026-01-01" }],
      [{ ...base, body: "remote", deviceId: "b", updated: "2026-01-02" }], "note");
    expect(records).toHaveLength(2);
    expect(records.some((record) => record.title.includes("conflict"))).toBe(true);
  });

  it("retains tombstones for thirty days", () => {
    const deletedAt = "2026-01-01T00:00:00.000Z";
    expect(tombstoneExpired({ tombstone: true, deletedAt }, Date.parse("2026-01-30T00:00:00.000Z"))).toBe(false);
    expect(tombstoneExpired({ tombstone: true, deletedAt }, Date.parse("2026-02-01T00:00:00.000Z"))).toBe(true);
  });

  it("emits the complete synced-record contract", () => {
    const record = syncRecord({ id: "x", revision: 1, baseRevision: 0 }, { type: "task", deviceId: "d", serverTimestamp: "server" });
    expect(record).toMatchObject({ id: "x", revision: 1, baseRevision: 0, deviceId: "d", updatedAt: "server", tombstone: false });
  });
});
