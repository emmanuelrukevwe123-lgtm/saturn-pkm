import { IMAGE_TOKEN } from "./notes.js";

/* Photos would overflow localStorage as base64, so blobs live in IndexedDB and
   note text carries only a {{img:ID}} token. */

const DB_NAME = "saturn-pkm-images";
const MAX_SIDE = 1400;
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
const GRACE_MS = 86_400_000;

let dbPromise = null;
const urls = new Map();
const listeners = new Set();
let version = 0;

function changed() {
  version += 1;
  for (const listener of listeners) listener();
}

export const imageVersion = {
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  get: () => version,
};

export function imageUrl(id) {
  return urls.get(String(id)) || null;
}

function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function writeAll(apply) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("images", "readwrite");
    apply(tx.objectStore("images"));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Image write was cancelled."));
  });
}

export async function allImages() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("images").objectStore("images").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function setUrl(id, blob) {
  const key = String(id);
  if (urls.has(key)) URL.revokeObjectURL(urls.get(key));
  urls.set(key, URL.createObjectURL(blob));
}

export async function putImages(records) {
  await writeAll((store) => { for (const record of records) store.put(record); });
  for (const record of records) setUrl(record.id, record.blob);
  changed();
}

export async function deleteImages(ids) {
  await writeAll((store) => { for (const id of ids) store.delete(id); });
  for (const id of ids) {
    const key = String(id);
    if (urls.has(key)) URL.revokeObjectURL(urls.get(key));
    urls.delete(key);
  }
  changed();
}

// Every image any notebook on this browser mentions, read from the raw stored
// JSON, so cleanup can't remove an image another account's notes still use.
function referencedByAnyNotebook(storage) {
  const ids = new Set();
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key.startsWith("saturn-pkm-notes") && !key.startsWith("saturn-pkm-deleted-notes")) continue;
    for (const match of (storage.getItem(key) || "").matchAll(IMAGE_TOKEN)) ids.add(match[1]);
  }
  return ids;
}

export async function initImages(storage) {
  const records = await allImages();
  const referenced = referencedByAnyNotebook(storage);
  const cutoff = Date.now() - GRACE_MS;
  // Fresh uploads get a day's grace, as they may sit in an unsaved draft.
  const stale = records.filter((record) => !referenced.has(String(record.id)) && Date.parse(record.created || "") < cutoff);
  if (stale.length) await deleteImages(stale.map((record) => record.id));
  const staleIds = new Set(stale.map((record) => record.id));
  for (const record of records) {
    if (!staleIds.has(record.id)) setUrl(record.id, record.blob);
  }
  changed();
}

// Downscales and re-encodes, which also strips metadata (such as a photo's GPS
// position) and anything active in the file, like scripts in an SVG.
export function compressImage(file) {
  if (file.size > MAX_UPLOAD_BYTES) return Promise.reject(new Error("that image is too large (40 MB limit)"));
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#FFFFFF"; // JPEG has no alpha channel
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("could not encode image"))), "image/jpeg", 0.82);
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("that file isn't an image")); };
    image.src = url;
  });
}
