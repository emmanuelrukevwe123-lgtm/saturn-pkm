import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CLOUD_SYNC_ENABLED } from "./config.js";
import { sameId } from "./lib/domain.js";
import { imageUrl, imageVersion, initImages, allImages, putImages } from "./lib/images.js";
import { createCloudSync } from "./lib/cloud-client.js";
import { loadFirebase } from "./lib/firebase.js";
import { TabCoordinator } from "./lib/tab-sync.js";
import {
  createNote, draftFrom, draftIsDirty, findByTitle, parseTags, reconcileExternalNote, saveNoteDraft,
} from "./lib/notes.js";

/* Everything screens share: the notebook, navigation, the open note's draft,
   theme, sign-in and cloud sync. Rules live in src/lib; this only wires them. */

const UI_STATE_KEY = "saturn-pkm-ui";
const THEME_KEY = "saturn-pkm-theme";
const RESTORABLE = new Set(["home", "tags", "graph", "progress", "orbit", "planner", "bin", "add", "data"]);

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

function readSavedUi() {
  try { return JSON.parse(sessionStorage.getItem(UI_STATE_KEY)); } catch { return null; }
}

function friendlyAuthError(error) {
  console.warn("Sign-in problem:", error?.code || error?.message || "unknown");
  if (error?.code === "auth/popup-closed-by-user") return "Sign-in window was closed.";
  if (error?.code === "auth/popup-blocked") return "Allow popups to sign in.";
  if (error?.code === "auth/unauthorized-domain") return "Add this domain in Firebase Authentication.";
  return "Google sign-in is unavailable. Try again in a moment.";
}

export function AppProvider({ store, children }) {
  const { state, storageProblem } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const imagesVersion = useSyncExternalStore(imageVersion.subscribe, imageVersion.get);

  const [screen, setScreen] = useState("home");
  const [selectedId, setSelectedId] = useState(null);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [rawDraft, setRawDraft] = useState(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [homeFilter, setHomeFilter] = useState({ tag: null, search: "" });
  const [openTag, setOpenTag] = useState(null);
  const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) === "dark");
  const [dataMessage, setDataMessage] = useState("");
  const [auth, setAuth] = useState({ status: "checking", error: "", user: null });
  const [cloudStatus, setCloudStatus] = useState("off");
  const [aiBusy, setAiBusy] = useState(false);
  const [dropRequest, setDropRequest] = useState(null);

  const focusEditor = useRef(false);
  const coordinator = useRef(null);
  const firebase = useRef(null);
  const cloud = useRef(null);
  // A signed-in refresh only knows its notebook once auth answers, so its saved
  // spot waits here. Everything else may restore and save straight away.
  const pendingRestore = useRef(null);

  const selectedNote = state.notes.find((note) => sameId(note.id, selectedId)) || null;
  const draft = selectedNote
    ? (rawDraft && sameId(rawDraft.id, selectedId) ? rawDraft : draftFrom(selectedNote))
    : null;
  const dirty = draftIsDirty(draft, selectedNote);

  const latest = useRef(null);
  latest.current = { screen, selectedId, activeProjectId, draft, dirty, selectedNote };

  const restoreSaved = useCallback((saved) => {
    const notebook = store.getState();
    if (saved?.screen === "note" && notebook.notes.some((note) => sameId(note.id, saved.selectedId))) {
      setSelectedId(saved.selectedId);
      setScreen("note");
    } else if (saved?.screen === "board" && notebook.projects.some((project) => !project.tombstone && sameId(project.id, saved.activeProjectId))) {
      setActiveProjectId(saved.activeProjectId);
      setScreen("board");
    } else {
      setScreen(RESTORABLE.has(saved?.screen) ? saved.screen : "home");
    }
  }, [store]);

  const started = useRef(false);
  if (!started.current) {
    started.current = true;
    const saved = readSavedUi();
    if (saved?.uid) pendingRestore.current = saved;
    else if (saved) queueMicrotask(() => restoreSaved(saved));
  }

  useEffect(() => {
    if (pendingRestore.current) return;
    try {
      sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({ uid: store.getUid(), screen, selectedId, activeProjectId }));
    } catch { /* private mode: a refresh just lands on Notes */ }
  }, [store, screen, selectedId, activeProjectId, auth.user]);

  useEffect(() => { document.querySelector(".main")?.scrollTo?.(0, 0); }, [screen]);

  useEffect(() => { document.body.classList.toggle("dark", dark); }, [dark]);

  const toggleTheme = useCallback(() => {
    setDark((current) => {
      const next = !current;
      try { localStorage.setItem(THEME_KEY, next ? "dark" : "light"); } catch { /* still applies this session */ }
      return next;
    });
  }, []);

  const applyTheme = useCallback((theme) => {
    setDark(theme === "dark");
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* still applies this session */ }
  }, []);

  const confirmDiscard = useCallback(() => {
    if (!latest.current.dirty) return true;
    if (!confirm("Discard unsaved changes?")) return false;
    setRawDraft(null);
    return true;
  }, []);

  const navigate = useCallback((name) => {
    if (latest.current.screen === "note" && name !== "note" && !confirmDiscard()) return false;
    if (name !== "note") setRawDraft(null);
    setScreen(name);
    return true;
  }, [confirmDiscard]);

  const openNote = useCallback((id, { edit = false } = {}) => {
    const current = latest.current;
    if (current.screen === "note" && !sameId(current.selectedId, id) && !confirmDiscard()) return;
    focusEditor.current = edit;
    setSelectedId(id);
    setRawDraft(null);
    setScreen("note");
  }, [confirmDiscard]);

  const openBoard = useCallback((id) => {
    if (latest.current.screen === "note" && !confirmDiscard()) return;
    setRawDraft(null);
    setActiveProjectId(id);
    setScreen("board");
  }, [confirmDiscard]);

  const updateDraft = useCallback((patch) => {
    setRawDraft((current) => {
      const base = current && sameId(current.id, latest.current.selectedId) ? current : latest.current.draft;
      return base ? { ...base, ...patch } : current;
    });
  }, []);

  const replaceEditorBody = useCallback((body) => {
    updateDraft({ body });
    setEditorRevision((value) => value + 1);
  }, [updateDraft]);

  const saveDraft = useCallback(() => {
    const current = latest.current.draft;
    if (!current) return;
    const error = store.apply(saveNoteDraft(store.getState(), {
      id: current.id, title: current.title, tags: parseTags(current.tagsText), body: current.body,
    }, store.withDevice()));
    if (error) {
      alert(store.getSnapshot().storageProblem || "Saturn could not save this note.");
      return;
    }
    setRawDraft(null);
    setEditorRevision((value) => value + 1);
  }, [store]);

  const addNote = useCallback(({ title, tags = [], body = "", edit = false }) => {
    if (latest.current.screen === "note" && !confirmDiscard()) return null;
    const { state: next, note } = createNote(store.getState(), { title, tags, body, ...store.withDevice() });
    if (!store.commit(next)) return null;
    focusEditor.current = edit;
    setSelectedId(note.id);
    setRawDraft(null);
    setScreen("note");
    return note;
  }, [store, confirmDiscard]);

  // Links in notes, task notes and AI answers: open the target, or offer to create it.
  const followWikiLink = useCallback((title) => {
    const target = findByTitle(store.getState().notes, title);
    if (target) {
      openNote(target.id);
    } else if (confirm(`No note called “${title}” yet. Create it?`)) {
      addNote({ title, edit: true });
    }
  }, [store, openNote, addNote]);

  const requestDrop = useCallback((id, onDropped = null) => setDropRequest({ id, onDropped }), []);

  // --- Other tabs ---
  const handleExternalChange = useCallback((message) => {
    const relevant = new Set(Object.values(store.keys()));
    if (message?.key && !relevant.has(message.key)) return;
    const external = store.readExternal();
    const { dirty: hasEdits, selectedNote: note } = latest.current;
    if (hasEdits && note) {
      const { state: merged, conflict } = reconcileExternalNote(external, note);
      if (conflict) {
        store.commit(merged, { announce: false });
        setDataMessage("Another tab changed this open note. Your draft was kept and its version was saved as a conflict copy.");
        return;
      }
    }
    store.adopt(external);
    setDataMessage("Changes from another tab were loaded.");
  }, [store]);

  useEffect(() => {
    const tabs = new TabCoordinator(handleExternalChange);
    coordinator.current = tabs;
    store.setCommitListener(({ announce, key }) => {
      if (announce) tabs.announce(key);
      cloud.current?.schedulePush();
    });
    return () => { tabs.close(); store.setCommitListener(() => {}); };
  }, [store, handleExternalChange]);

  useEffect(() => {
    // Images load after first paint; a failure just shows placeholders.
    initImages(localStorage).catch(() => {});
  }, []);

  // --- Sign-in and sync ---
  const handleUser = useCallback((user) => {
    const uid = user?.uid || "";
    const saved = pendingRestore.current;
    pendingRestore.current = null;
    if (uid !== store.getUid()) {
      if (user) store.adoptLocalNotebook(uid);
      store.load(uid, { seed: !user || !CLOUD_SYNC_ENABLED });
      setSelectedId(null);
      setActiveProjectId(null);
      setRawDraft(null);
      setHomeFilter({ tag: null, search: "" });
      setOpenTag(null);
      if (saved?.uid === uid) restoreSaved(saved);
      else setScreen("home");
    }
    setAuth({ status: "ready", error: "", user });
    if (user && CLOUD_SYNC_ENABLED && firebase.current?.cloudApi) {
      cloud.current ||= createCloudSync({
        store,
        api: firebase.current.cloudApi,
        imageApi: firebase.current.imageApi,
        images: { allImages, putImages },
        onStatus: setCloudStatus,
      });
      cloud.current.start(user);
    } else {
      cloud.current?.stop();
    }
  }, [store, restoreSaved]);

  const authStarted = useRef(false);
  useEffect(() => {
    if (authStarted.current) return;
    authStarted.current = true;
    loadFirebase().then((loaded) => {
      firebase.current = loaded;
      const { instance, getRedirectResult, onAuthStateChanged } = loaded.auth;
      // Surfaces errors from a redirect sign-in round trip (the mobile flow).
      getRedirectResult(instance).catch((error) => {
        setAuth((current) => ({ ...current, status: "ready", error: friendlyAuthError(error) }));
      });
      onAuthStateChanged(instance, handleUser, (error) => {
        pendingRestore.current = null;
        setAuth({ status: "error", error: friendlyAuthError(error), user: null });
      });
    }).catch((error) => {
      pendingRestore.current = null;
      setAuth({ status: "error", error: friendlyAuthError(error), user: null });
    });
  }, [handleUser]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") cloud.current?.pullIfStale(); };
    const onOnline = () => cloud.current?.push();
    const onHide = () => cloud.current?.flush();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  const signIn = useCallback(async () => {
    const api = firebase.current?.auth;
    if (!api) return;
    setAuth((current) => ({ ...current, status: "loading", error: "" }));
    try {
      // Popups are unreliable on touch devices, so they go straight to redirect.
      if (window.matchMedia("(pointer: coarse)").matches) {
        await api.signInWithRedirect(api.instance, api.provider);
        return;
      }
      await api.signInWithPopup(api.instance, api.provider);
    } catch (error) {
      let failure = error;
      if (failure.code === "auth/popup-blocked") {
        try {
          await api.signInWithRedirect(api.instance, api.provider);
          return;
        } catch (redirectError) {
          failure = redirectError;
        }
      }
      const message = friendlyAuthError(failure);
      setAuth((current) => ({ ...current, status: "ready", error: message }));
      if (failure.code !== "auth/popup-closed-by-user") alert(message);
    }
  }, []);

  const signOut = useCallback(async () => {
    const api = firebase.current?.auth;
    if (!api) return;
    if (!confirmDiscard()) return;
    setAuth((current) => ({ ...current, status: "loading" }));
    try {
      await api.signOut(api.instance);
    } catch (error) {
      const message = friendlyAuthError(error);
      setAuth((current) => ({ ...current, status: "ready", error: message }));
      alert(message);
    }
  }, [confirmDiscard]);

  const markdownContext = useMemo(() => ({
    noteExists: (title) => !!findByTitle(state.notes, title),
    imageUrl,
  }), [state.notes]);

  const value = {
    store, state, storageProblem, imagesVersion,
    screen, navigate, selectedId, selectedNote, activeProjectId, openNote, openBoard,
    draft, dirty, updateDraft, saveDraft, replaceEditorBody, editorRevision, focusEditor, addNote, followWikiLink,
    homeFilter, setHomeFilter, openTag, setOpenTag,
    dark, toggleTheme, applyTheme, dataMessage, setDataMessage,
    auth, signIn, signOut, cloudStatus,
    aiBusy, setAiBusy, markdownContext,
    dropRequest, setDropRequest, requestDrop,
    run: store.apply, device: store.withDevice,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
