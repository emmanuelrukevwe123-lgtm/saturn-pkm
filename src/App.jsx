import { Component, useEffect, useMemo, useRef, useState } from "react";
import { APP_VERSION } from "./config.js";
import { sameId } from "./lib/domain.js";
import { streamAI } from "./lib/ai.js";
import { moveStage } from "./lib/hq.js";
import { relevantNotesFor } from "./lib/notes.js";
import { useApp } from "./AppContext.jsx";
import { Modal, Rendered } from "./components/shared.jsx";
import { AddScreen, BinScreen, HomeScreen, ProgressScreen, TagsScreen } from "./screens/simple.jsx";
import { BoardScreen, PlannerScreen } from "./screens/BoardScreen.jsx";
import { DataScreen } from "./screens/DataScreen.jsx";
import { GraphScreen } from "./screens/GraphScreen.jsx";
import { NoteScreen } from "./screens/NoteScreen.jsx";
import { OrbitScreen } from "./screens/OrbitScreen.jsx";

const NAV = [
  ["home", "Notes"], ["tags", "Tags"], ["graph", "Graph"], ["progress", "Progress"],
  ["orbit", "Orbit"], ["planner", "Planner"], ["bin", "Bin"], ["data", "Data & Sync"],
];
const CLOUD_LABELS = {
  syncing: "Syncing…", synced: "Synced across your devices", pending: "Offline — changes pending",
  conflict: "Synced — conflict copy created", error: "Sync error — will retry", unavailable: "Signed in — cloud sync not set up",
};
const SCREENS = {
  home: HomeScreen, note: NoteScreen, tags: TagsScreen, graph: GraphScreen, progress: ProgressScreen, bin: BinScreen,
  add: AddScreen, orbit: OrbitScreen, planner: PlannerScreen, board: BoardScreen, data: DataScreen,
};

function AuthCard() {
  const { auth, signIn, signOut, cloudStatus } = useApp();
  const { user, status, error } = auth;
  const checking = status === "checking" || status === "loading";
  let meta = "Notes stay on this browser.";
  if (user) meta = CLOUD_LABELS[cloudStatus] || "Signed in with Google";
  else if (checking) meta = "Checking Google sign-in...";
  else if (error) meta = error;
  const initial = (user?.displayName || "Google").trim().charAt(0).toUpperCase() || "G";
  return (
    <div className="auth-card" id="auth-card">
      <div className="auth-profile">
        <div className="auth-avatar" id="auth-avatar">
          {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : (user ? initial : "G")}
        </div>
        <div className="auth-copy">
          {/* Privacy: the email address is never shown, only a name or a generic label. */}
          <div className="auth-name" id="auth-name">{user ? user.displayName || "Google account" : "Not signed in"}</div>
          <div className="auth-meta" id="auth-meta">{meta}</div>
        </div>
      </div>
      {user
        ? <button id="google-signout" className="auth-btn auth-btn-secondary" type="button" disabled={status === "loading"} onClick={signOut}>Sign out</button>
        : <button id="google-signin" className="auth-btn" type="button" disabled={status !== "ready"} onClick={signIn}>{checking ? "Checking Google sign-in" : "Sign in with Google"}</button>}
    </div>
  );
}

function AskSaturn({ open, setOpen }) {
  const { state, auth, aiBusy, setAiBusy, followWikiLink } = useApp();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const inputRef = useRef(null);
  const ready = !!auth.user;

  useEffect(() => { if (open && ready) inputRef.current?.focus(); }, [open, ready]);

  const ask = async (event) => {
    event.preventDefault();
    const clean = question.trim();
    if (!clean || !ready || aiBusy) return;
    setAiBusy(true);
    setAnswer({ status: "pending", text: "Thinking…" });
    try {
      const text = await streamAI(auth.user, { mode: "ask", question: clean, notes: relevantNotesFor(state.notes, clean) },
        (partial) => setAnswer({ status: "streaming", text: partial }));
      setAnswer({ status: "done", text });
    } catch (error) {
      setAnswer({ status: "error", text: error.message });
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <>
      <button id="ask-fab" className="ask-fab" type="button" title="Ask Saturn" aria-label="Ask Saturn" aria-expanded={open} onClick={() => setOpen(!open)}>✦</button>
      {open && (
        <div id="ask-pop" className="ask-pop">
          <div className="list-heading">Ask Saturn ✦</div>
          <form id="ask-form" className="ask-form" onSubmit={ask}>
            <input id="ask-input" ref={inputRef} className="field" type="text" placeholder="Ask about your notes…" aria-label="Question for Saturn" autoComplete="off"
              maxLength={2000} disabled={!ready} value={question} onChange={(event) => setQuestion(event.target.value)} />
            <button id="ask-btn" className="pill pill-ai" type="submit" disabled={!ready || aiBusy}>Ask</button>
          </form>
          {!ready && <div id="ask-hint" className="empty small">Sign in with Google to use AI.</div>}
          {answer && (
            <div id="ask-answer" className="ai-panel">
              <div className="ai-panel-head">
                <span className="eyebrow">Answer</span>
                <span className="spacer" />
                <button id="ask-close" className="pill" type="button" onClick={() => setAnswer(null)}>Close</button>
              </div>
              {answer.status === "done"
                ? <Rendered id="ask-answer-body" className="ai-panel-body" text={answer.text} onLink={(title) => { setOpen(false); followWikiLink(title); }} />
                : <div id="ask-answer-body" className={`ai-panel-body rendered ${answer.status === "pending" ? "pending" : ""} ${answer.status === "error" ? "error" : ""}`}>{answer.text}</div>}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function DropDialog() {
  const { state, store, run, device, dropRequest, setDropRequest } = useApp();
  const [reason, setReason] = useState("");
  const project = dropRequest && state.projects.find((item) => sameId(item.id, dropRequest.id));
  const close = () => { setReason(""); setDropRequest(null); };
  return (
    <Modal open={!!dropRequest} onClose={close} id="hq-drop-dialog" labelledBy="hq-drop-title">
      <form id="hq-drop-form" onSubmit={(event) => {
        event.preventDefault();
        if (run(moveStage(store.getState(), dropRequest.id, "dropped", { ...device(), reason }))) return;
        const { onDropped } = dropRequest;
        close();
        queueMicrotask(() => onDropped?.());
      }}>
        <h2 className="list-heading" id="hq-drop-title">Drop project</h2>
        <p className="hq-note" id="hq-drop-project">{project?.name}</p>
        <label className="form-label first" htmlFor="hq-drop-reason">Why are you dropping it?</label>
        <input id="hq-drop-reason" className="field" autoComplete="off" data-autofocus value={reason} onChange={(event) => setReason(event.target.value)} />
        <div className="note-tools">
          <button id="hq-drop-save" className="pill pill-save" type="submit" disabled={!reason.trim()}>Drop project</button>
          <button className="pill" type="button" onClick={close}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function useNav() {
  const query = useRef(window.matchMedia("(max-width: 880px)")).current;
  const [mobile, setMobile] = useState(query.matches);
  const [open, setOpen] = useState(!query.matches);
  useEffect(() => {
    // Crossing the breakpoint: desktop starts visible, mobile starts closed.
    const onChange = () => { setMobile(query.matches); setOpen(!query.matches); };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [query]);
  useEffect(() => {
    document.body.classList.toggle("nav-open", mobile && open);
    document.body.classList.toggle("nav-hidden", !mobile && !open);
  }, [mobile, open]);
  return { mobile, open, setOpen };
}

export class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="content">
        <h1 className="page-title tight">Something went wrong</h1>
        <p className="page-sub">Your saved notes are safe. Reload the page to continue.</p>
        <button className="pill pill-save" type="button" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}

export function App() {
  const { screen, selectedId, navigate, dark, toggleTheme, storageProblem } = useApp();
  const { mobile, open, setOpen } = useNav();
  const [askOpen, setAskOpen] = useState(false);
  const Screen = SCREENS[screen] || HomeScreen;
  const closeOnMobile = () => { if (mobile) setOpen(false); };

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
      setAskOpen(false);
      if (mobile) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobile, setOpen]);

  const activeNav = { note: "home", board: "planner" }[screen] || screen;
  // The same element between renders, so opening the menu doesn't re-render the
  // screen behind it. Screens still update themselves through useApp().
  const screenKey = screen === "note" ? `note-${selectedId}` : screen;
  const currentScreen = useMemo(() => <Screen key={screenKey} />, [Screen, screenKey]);

  return (
    <>
      {storageProblem && (
        <div id="app-error" className="app-error" role="alert">
          {storageProblem}
          <button type="button" onClick={() => navigate("data")}>Open Data &amp; Sync to export</button>
        </div>
      )}
      <button id="menu-toggle" className="menu-toggle" type="button" aria-label="Show or hide the menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span /><span /><span />
      </button>
      {mobile && open && <div id="nav-backdrop" className="nav-backdrop" onClick={() => setOpen(false)} />}

      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <svg width="40" height="40" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <ellipse cx="32" cy="32" rx="30" ry="9" transform="rotate(-22 32 32)" fill="none" className="logo-ring" strokeWidth="2.4" opacity="0.9" />
              <circle cx="32" cy="32" r="14" className="logo-planet" />
              <circle cx="27" cy="28" r="14" className="logo-glow" opacity="0.14" />
            </svg>
            <div>
              <div className="brand-name">Saturn</div>
              <div className="brand-tag">Connect ideas</div>
            </div>
          </div>
          <div className="menu-label">Menu</div>
          <nav className="side-nav">
            {NAV.map(([name, label]) => (
              <button key={name} className={`nav-link${activeNav === name ? " active" : ""}`} type="button" data-screen={name}
                aria-current={activeNav === name ? "page" : undefined}
                onClick={() => { closeOnMobile(); navigate(name); }}>{label}</button>
            ))}
          </nav>
          <div className="divider" />
          <button id="add-nav" className="add-nav" type="button" onClick={() => { closeOnMobile(); navigate("add"); }}>＋ New note</button>
          <AuthCard />
          <div className="spacer" />
          <button id="theme-toggle" className="theme-toggle" type="button" onClick={toggleTheme}>
            <span id="theme-label">{dark ? "Dark mode" : "Light mode"}</span>
            <span id="theme-glyph" aria-hidden="true">{dark ? "☾" : "☀"}</span>
          </button>
          <div className="app-version" id="app-version">SATURN {APP_VERSION.toUpperCase()}</div>
        </aside>
        <main className="main j-scroll">
          <div className="content">
            <ErrorBoundary>
              {/* The key gives each open note a fresh editor and AI panel. */}
              {currentScreen}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <AskSaturn open={askOpen} setOpen={setAskOpen} />
      <DropDialog />
    </>
  );
}
