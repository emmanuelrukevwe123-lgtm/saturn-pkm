import { CLOUD_SYNC_ENABLED, FIREBASE_CONFIG } from "../config.js";

/* Firebase is bundled from npm with locked versions rather than loaded from a
   CDN at runtime, and split into its own chunks, so the app stays quick to open. */

export async function loadFirebase() {
  const { startAuth } = await import("./firebase-sdk.js");
  const { app, auth } = startAuth(FIREBASE_CONFIG);
  if (!CLOUD_SYNC_ENABLED) return { auth, cloudApi: null, imageApi: null };
  const { startCloud } = await import("./firebase-cloud.js");
  return { auth, ...startCloud(app) };
}
