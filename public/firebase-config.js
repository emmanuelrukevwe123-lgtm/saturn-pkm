// Firebase web config for Saturn's Google sign-in.
// These values identify the project but are not private secrets.
window.SATURN_FIREBASE_CONFIG = {
  apiKey: "AIzaSyArkYHiyBalyozCwxa_vDxJlz8zmT3H9wc",
  // Sign-in is served through our own domain (see vercel.json rewrites),
  // so mobile browsers never need to reach firebaseapp.com directly.
  authDomain: "saturn-pkm.vercel.app",
  projectId: "saturn-1165b",
  appId: "1:327963512429:web:0d3e7debd2fc69063bf964"
};

// Roll cloud sync out deliberately: false is local-only; production can set
// this to true after deploying the owner-only Firestore and Storage rules.
window.SATURN_FEATURES = { cloudSync: false };
