import { useState } from "react";
import { APP_VERSION, CLOUD_SYNC_ENABLED } from "../config.js";
import { MAX_BACKUP_BYTES, base64ToBlob, blobToBase64, createBackup, prepareImport, summarizeImport, validateBackup } from "../lib/backup.js";
import { allImages, deleteImages, putImages } from "../lib/images.js";
import { imageIdsIn } from "../lib/notes.js";
import { useApp } from "../AppContext.jsx";

async function backupImages(state) {
  const referenced = imageIdsIn([...state.notes, ...state.deletedNotes]);
  const records = (await allImages()).filter((record) => referenced.has(String(record.id)));
  return Promise.all(records.map(async (record) => ({
    id: record.id,
    type: record.blob.type || "image/jpeg",
    created: record.created || "",
    data: await blobToBase64(record.blob),
  })));
}

export function DataScreen() {
  const { state, store, storageProblem, dark, applyTheme, auth, cloudStatus, dataMessage, setDataMessage } = useApp();
  const [exporting, setExporting] = useState(false);
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState("merge");
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState(null);

  const fallback = CLOUD_SYNC_ENABLED && auth.user ? "Cloud sync enabled; local cache is ready." : "Local data ready. Export regularly to keep a portable copy.";
  let syncDetail = "Local-only. Cloud sync is behind a deployment feature flag until Firebase rules and indexes are deployed.";
  if (CLOUD_SYNC_ENABLED) {
    syncDetail = auth.user ? `Sync state: ${cloudStatus}. Changes remain cached offline.` : "Sign in to sync; this notebook remains local until then.";
  }

  const exportBackup = async () => {
    setExporting(true);
    setDataMessage("Preparing backup…");
    try {
      const images = await backupImages(state);
      const envelope = createBackup({
        appVersion: APP_VERSION,
        notebook: auth.user ? { scope: "account", uid: auth.user.uid } : { scope: "local" },
        state, images,
        settings: { theme: dark ? "dark" : "light", cloudSyncEnabled: CLOUD_SYNC_ENABLED },
      });
      const url = URL.createObjectURL(new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `saturn-${new Date().toISOString().slice(0, 10)}.saturn`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDataMessage(`Backup exported: ${state.notes.length} notes and ${images.length} images.`);
    } catch (error) {
      setDataMessage(`Backup failed: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  const importBackup = async () => {
    if (!file) return;
    setImporting(true);
    setSummary(null);
    let addedImageIds = [];
    let overwritten = [];
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("This file is too large to be a Saturn backup.");
      const envelope = JSON.parse(await file.text());
      const validation = validateBackup(envelope);
      if (!validation.valid) throw new Error(validation.errors.join(" "));
      const current = store.getState();
      const next = prepareImport(current, envelope, mode);
      const counts = summarizeImport(current, next, envelope.images);
      const text = `${mode === "replace" ? "Replace with" : "Restore"} ${counts.notes} active notes, ${counts.deletedNotes} deleted notes, ${counts.projects} projects, ${counts.tasks} tasks, ${counts.tracks} learning tracks, and ${counts.images} images.`;
      setSummary({ text, error: false });
      if (!confirm(`${text}\n\nContinue?`)) return;

      // Decoding happens first, so a corrupt image can't leave a half-finished import.
      const imported = envelope.images.map((record) => ({
        id: record.id, created: record.created || new Date().toISOString(), blob: base64ToBlob(record.data, record.type),
      }));
      const existing = await allImages();
      const importedIds = new Set(imported.map((record) => String(record.id)));
      overwritten = existing.filter((record) => importedIds.has(String(record.id)));
      const existingIds = new Set(existing.map((record) => String(record.id)));
      addedImageIds = imported.filter((record) => !existingIds.has(String(record.id))).map((record) => record.id);
      // Images are shared by every notebook on this browser, so "replace" leaves
      // the others alone. Ones nothing refers to are cleaned up on a later load.
      await putImages(imported);
      if (!store.commit(next)) throw new Error(store.getSnapshot().storageProblem);
      if (envelope.settings?.theme === "dark" || envelope.settings?.theme === "light") applyTheme(envelope.settings.theme);
      setDataMessage("Import completed and validated successfully.");
    } catch (error) {
      try {
        if (addedImageIds.length) await deleteImages(addedImageIds);
        if (overwritten.length) await putImages(overwritten);
      } catch { /* keep the original failure */ }
      setSummary({ text: `Import made no changes: ${error.message}`, error: true });
    } finally {
      setImporting(false);
    }
  };

  return (
    <section id="screen-data">
      <div className="eyebrow">Safety first</div>
      <h1 className="page-title tight">Data &amp; Sync</h1>
      <p className="page-sub">Download a complete, portable backup or restore one after Saturn validates it.</p>
      <div id="storage-state" className={`sync-state${storageProblem ? " error" : ""}`} role="status">{storageProblem || dataMessage || fallback}</div>
      <div className="panel-card data-panel">
        <h2 className="list-heading">Full backup</h2>
        <p>Includes notes, bin, projects, tasks, learning tracks, Orbit review dates, settings, and every referenced image.</p>
        <button id="data-export" className="pill pill-save" type="button" disabled={exporting} onClick={exportBackup}>Export .saturn backup</button>
      </div>
      <div className="panel-card data-panel">
        <h2 className="list-heading">Restore backup</h2>
        <input id="data-import-file" className="field" type="file" accept=".saturn,application/json" aria-label="Backup file"
          onChange={(event) => { setFile(event.target.files?.[0] || null); setSummary(null); }} />
        <fieldset className="import-mode">
          <legend>Import mode</legend>
          <label><input type="radio" name="import-mode" value="merge" checked={mode === "merge"} onChange={() => setMode("merge")} /> Merge with this notebook</label>
          <label><input type="radio" name="import-mode" value="replace" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace this notebook</label>
        </fieldset>
        {summary && <div id="import-summary" className={`sync-state${summary.error ? " error" : ""}`} role="status">{summary.text}</div>}
        <button id="data-import" className="pill pill-save" type="button" disabled={!file || importing} onClick={importBackup}>Validate and import</button>
      </div>
      <div className="panel-card data-panel">
        <h2 className="list-heading">Cloud sync</h2>
        <p id="sync-detail">{syncDetail}</p>
      </div>
    </section>
  );
}
