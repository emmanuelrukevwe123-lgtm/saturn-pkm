export const APP_VERSION = "v17";

// These values identify the Firebase project and aren't secrets: access is
// enforced by Firebase Auth and the owner-only rules. Sign-in is served through
// our own domain (see vercel.json), so mobile browsers never need firebaseapp.com.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyArkYHiyBalyozCwxa_vDxJlz8zmT3H9wc",
  authDomain: "saturn-pkm.vercel.app",
  projectId: "saturn-1165b",
  appId: "1:327963512429:web:0d3e7debd2fc69063bf964",
};

// Set VITE_CLOUD_SYNC=true at build time, after deploying the Firebase rules.
export const CLOUD_SYNC_ENABLED = import.meta.env?.VITE_CLOUD_SYNC === "true";
