import { conflictCopy, newId, sameId, uniqueTitle } from "./domain.js";

export const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function syncRecord(record, { type, deviceId, serverTimestamp, tombstone = false }) {
  return {
    ...record,
    id: record.id,
    type,
    revision: Number.isInteger(record.revision) ? record.revision : 0,
    baseRevision: Number.isInteger(record.baseRevision) ? record.baseRevision : 0,
    deviceId: record.deviceId || deviceId,
    updatedAt: serverTimestamp,
    tombstone: tombstone || !!record.deletedAt,
    deletedAt: tombstone || record.deletedAt ? (record.deletedAt || new Date().toISOString()) : null,
  };
}

export function tombstoneExpired(record, now = Date.now()) {
  return !!record?.tombstone && !!record.deletedAt && now - Date.parse(record.deletedAt) >= TOMBSTONE_RETENTION_MS;
}

function changedFromBase(local, remote) {
  const localRevision = local.revision || 0;
  const remoteRevision = remote.revision || 0;
  const directDescendant = (local.baseRevision || 0) === remoteRevision || (remote.baseRevision || 0) === localRevision;
  if (directDescendant) return false;
  const payload = (record) => JSON.stringify(Object.fromEntries(Object.entries(record)
    .filter(([key]) => ![
      "updated", "updatedAt", "deviceId", "type", "tombstone", "deletedAt", "revision", "baseRevision",
    ].includes(key))));
  return payload(local) !== payload(remote) &&
    (localRevision !== remoteRevision || localRevision > (local.baseRevision || 0));
}

function conflictFor(record, records, type) {
  if (type === "note") return conflictCopy(record, records, record.deviceId || "device");
  const title = uniqueTitle(`${record.title || "Untitled task"} (conflict ${record.deviceId || "device"})`, records);
  return { ...record, id: newId(), title, revision: 0, baseRevision: 0, deletedAt: null, tombstone: false };
}

export function mergeSyncCollection(localRecords, remoteRecords, type) {
  const merged = [];
  const ids = new Set([...localRecords, ...remoteRecords].map((record) => String(record.id)));
  for (const id of ids) {
    const local = localRecords.find((record) => sameId(record.id, id));
    const remote = remoteRecords.find((record) => sameId(record.id, id));
    if (!local || !remote) { merged.push(local || remote); continue; }
    const remoteWins = (remote.updated || remote.deletedAt || "") > (local.updated || local.deletedAt || "");
    const winner = remoteWins ? remote : local;
    const loser = remoteWins ? local : remote;
    merged.push(winner);
    if ((type === "note" || type === "task") && !winner.tombstone && !loser.tombstone && changedFromBase(local, remote))
      merged.push(conflictFor(loser, [...localRecords, ...remoteRecords, ...merged], type));
  }
  return merged;
}
