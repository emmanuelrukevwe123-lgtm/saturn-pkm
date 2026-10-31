import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider, getAuth, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut,
} from "firebase/auth";

// Imported together as one chunk, so auth registers against this same app module.
export function startAuth(config) {
  const app = initializeApp(config);
  return {
    app,
    auth: {
      instance: getAuth(app),
      provider: new GoogleAuthProvider(),
      signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
    },
  };
}
