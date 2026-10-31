import { useMemo, useState } from "react";
import { sameId } from "../lib/domain.js";
import { allTags, deleteNote, linksIn, orphanIds, parseTags, purgeNote, restoreNote } from "../lib/notes.js";
import { MON, NoteRow, TagChip, WD, hexA, useTagColor } from "../components/shared.jsx";
import { useApp } from "../AppContext.jsx";

function byUpdated(a, b) {
  return b.updated.localeCompare(a.updated);
}

function useDeleteNote() {
  const { state, store, run, device, selectedId, navigate } = useApp();
  return (id) => {
    const note = state.notes.find((item) => sameId(item.id, id));
    if (!note || !confirm(`Move “${note.title || "Untitled note"}” to the Dead Stars bin?`)) return false;
    const leaving = sameId(selectedId, id);
    if (run(deleteNote(store.getState(), id, device()))) return false;
    if (leaving) navigate("home");
    return true;
  };
}
export { useDeleteNote };

export function HomeScreen() {
  const { state, dark, homeFilter, setHomeFilter } = useApp();
  const { notes } = state;
  const removeNote = useDeleteNote();
  const tagColor = useTagColor();
  const orphans = useMemo(() => orphanIds(notes), [notes]);
  const tags = allTags(notes);
  const { tag: activeTag, search } = homeFilter;
  const query = search.trim().toLowerCase();

  const total = notes.length;
  const linked = total - orphans.size;
  const circumference = 2 * Math.PI * 96;
  const today = new Date();
  let headline = `${orphans.size} ${orphans.size === 1 ? "orphan" : "orphans"} adrift`;
  if (total === 0) headline = "No notes yet";
  else if (orphans.size === 0) headline = "Every note in orbit.";

  const visible = [...notes].sort(byUpdated)
    .filter((note) => !activeTag || note.tags.includes(activeTag))
    .filter((note) => !query || note.title.toLowerCase().includes(query) || note.body.toLowerCase().includes(query));
  let heading = "All notes";
  if (activeTag) heading = activeTag;
  else if (query) heading = `Results for “${search.trim()}”`;

  return (
    <section id="screen-home">
      <div className="eyebrow" id="today-eyebrow">{WD[today.getDay()]} · {MON[today.getMonth()]} {today.getDate()}</div>
      <h1 className="page-title">Notes</h1>

      <div className="hero">
        <div className="hero-ring">
          <svg width="212" height="212" viewBox="0 0 212 212" aria-hidden="true">
            <circle className="ring-track" cx="106" cy="106" r="96" fill="none" strokeWidth="8" />
            <circle id="home-ring" className="ring-progress" cx="106" cy="106" r="96" fill="none" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={circumference * (1 - (total ? linked / total : 0))} transform="rotate(-90 106 106)" />
            <ellipse className="ring-ellipse" cx="106" cy="106" rx="88" ry="26" transform="rotate(-20 106 106)" fill="none" strokeWidth="3" opacity="0.85" />
            <circle className="ring-inner" cx="106" cy="106" r="71" strokeWidth="1" />
          </svg>
          <div className="hero-center">
            <div className="hero-num" id="hero-num">{linked}</div>
            <div className="hero-sub" id="hero-sub">of {total} notes linked</div>
          </div>
        </div>
        <div className="hero-copy">
          <div className="hero-headline" id="hero-headline">{headline}</div>
          <div className="hero-motto">Keep your orbit steady.</div>
        </div>
      </div>

      <input id="search-input" className="field search-field" type="search" placeholder="Search notes…" aria-label="Search notes"
        autoComplete="off" value={search} onChange={(event) => setHomeFilter({ ...homeFilter, search: event.target.value })} />

      <div className="pills" id="tag-pills">
        {[null, ...tags].map((tag) => {
          const active = tag === activeTag;
          const color = tag && active ? tagColor(tag) : null;
          return (
            <button key={tag ?? "__all"} type="button" className={`pill${active ? " active" : ""}`} aria-pressed={active}
              style={color ? { borderColor: color, background: hexA(color, dark ? 0.2 : 0.13), color } : undefined}
              onClick={() => setHomeFilter({ ...homeFilter, tag: active ? null : tag })}>{tag ?? "All"}</button>
          );
        })}
      </div>

      <div className="list-heading" id="list-heading">{heading}</div>
      {visible.length > 0
        ? <div className="ledger" id="ledger">{visible.map((note, index) => <NoteRow key={note.id} note={note} index={index} onDelete={removeNote} />)}</div>
        : <div className="empty" id="home-empty">A clear page today.</div>}
    </section>
  );
}

export function TagsScreen() {
  const { state, openTag, setOpenTag } = useApp();
  const { notes } = state;
  const orphans = useMemo(() => orphanIds(notes), [notes]);
  const untagged = notes.filter((note) => note.tags.length === 0);
  const keys = [...allTags(notes), ...(untagged.length ? ["__untagged"] : [])];
  const circumference = 2 * Math.PI * 26;

  return (
    <section id="screen-tags">
      <div className="eyebrow">Grouped notes</div>
      <h1 className="page-title tight">Tags</h1>
      <p className="page-sub">Each tag gathers the notes you've filed under it. Open one to see what's inside and how connected it is.</p>
      <div id="tag-groups">
        {keys.map((key) => {
          const group = key === "__untagged" ? untagged : notes.filter((note) => note.tags.includes(key));
          const linked = group.filter((note) => !orphans.has(String(note.id))).length;
          const percent = group.length ? Math.round((linked / group.length) * 100) : 0;
          const open = openTag === key;
          return (
            <div key={key} className={`group${open ? " open" : ""}`}>
              <button className="group-head" type="button" aria-expanded={open} onClick={() => setOpenTag(open ? null : key)}>
                <div className="group-ring">
                  <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
                    <circle className="ring-track" cx="32" cy="32" r="26" fill="none" strokeWidth="6" />
                    <circle className="ring-progress" cx="32" cy="32" r="26" fill="none" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)} transform="rotate(-90 32 32)" />
                  </svg>
                  <div className="group-pct">{percent}%</div>
                </div>
                <div className="group-info">
                  <div className="group-title">{key === "__untagged" ? "Untagged" : key}</div>
                  <div className="group-sub">{linked} of {group.length} linked · {group.length} {group.length === 1 ? "note" : "notes"}</div>
                </div>
                <span className="group-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
              </button>
              {open && (
                <div className="group-body group-rows">
                  {[...group].sort(byUpdated).map((note) => <NoteRow key={note.id} note={note} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {keys.length === 0 && <div className="empty" id="tags-empty">No tags yet — add some to a note.</div>}
    </section>
  );
}

export function ProgressScreen() {
  const { state } = useApp();
  const { notes } = state;
  const tagColor = useTagColor();
  const orphans = useMemo(() => orphanIds(notes), [notes]);
  const total = notes.length;
  const linked = total - orphans.size;
  const fraction = total ? linked / total : 0;
  const circumference = 2 * Math.PI * 64;
  const untagged = notes.filter((note) => note.tags.length === 0);
  const entries = allTags(notes).map((tag) => [tag, notes.filter((note) => note.tags.includes(tag))]);
  if (untagged.length) entries.push(["Untagged", untagged]);

  return (
    <section id="screen-progress">
      <div className="eyebrow">Your record</div>
      <h1 className="page-title tight-lg">Progress</h1>
      <div className="stats-grid">
        <div className="stat-ring-card">
          <div className="stat-ring">
            <svg width="148" height="148" viewBox="0 0 148 148" aria-hidden="true">
              <circle className="ring-track" cx="74" cy="74" r="64" fill="none" strokeWidth="8" />
              <circle id="progress-ring" className="ring-progress" cx="74" cy="74" r="64" fill="none" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fraction)} transform="rotate(-90 74 74)" />
              <ellipse className="ring-ellipse" cx="74" cy="74" rx="58" ry="17" transform="rotate(-20 74 74)" fill="none" strokeWidth="2.4" opacity="0.85" />
              <circle className="ring-inner" cx="74" cy="74" r="47" strokeWidth="1" />
            </svg>
            <div className="stat-ring-pct" id="stat-pct">{Math.round(fraction * 100)}%</div>
          </div>
          <div>
            <div className="stat-big" id="stat-linked">{linked} of {total}</div>
            <div className="stat-note">notes linked — the ring fills as ideas connect.</div>
          </div>
        </div>
        <div className="stat-stack">
          <div className="stat-card">
            <div className="stat-num" id="stat-links">{notes.reduce((sum, note) => sum + linksIn(note.body).length, 0)}</div>
            <div className="stat-label">links between notes</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" id="stat-orphans">{orphans.size}</div>
            <div className="stat-label">orphan notes</div>
          </div>
        </div>
      </div>

      <div className="panel-card">
        <div className="list-heading pad">By tag</div>
        <div id="breakdown">
          {entries.map(([label, group]) => {
            const done = group.filter((note) => !orphans.has(String(note.id))).length;
            const isUntagged = label === "Untagged";
            return (
              <div className="break-item" key={label}>
                <div className="break-head">
                  {isUntagged
                    ? <span className="chip" style={{ color: "var(--muted)", background: "var(--surface-2)" }}>Untagged</span>
                    : <TagChip tag={label} />}
                  <span className="break-count">{done} / {group.length}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${group.length ? Math.round((done / group.length) * 100) : 0}%`, background: isUntagged ? "var(--muted)" : tagColor(label) }} />
                </div>
              </div>
            );
          })}
          {entries.length === 0 && <div className="empty small">Nothing to chart yet.</div>}
        </div>
      </div>

      <div className="panel-card">
        <div className="list-heading pad">Recently edited</div>
        <div className="group-rows" id="recent-list">
          {[...notes].sort(byUpdated).slice(0, 5).map((note) => <NoteRow key={note.id} note={note} />)}
        </div>
      </div>
    </section>
  );
}

function deletedLabel(note) {
  const date = new Date(note.deletedAt || note.updated || note.created);
  if (date.toDateString() === new Date().toDateString()) return "deleted today";
  return `deleted ${MON[date.getMonth()]} ${date.getDate()}`;
}

export function BinScreen() {
  const { state, store, run, device, openNote } = useApp();
  const list = state.deletedNotes.filter((note) => !note.purged)
    .sort((a, b) => (b.deletedAt || b.updated || "").localeCompare(a.deletedAt || a.updated || ""));

  const restore = (id) => {
    const result = restoreNote(store.getState(), id, device());
    if (result.error || run(result.state)) return;
    openNote(result.note.id);
  };
  const purge = (note) => {
    if (!confirm(`Delete “${note.title || "Untitled note"}” forever? This can't be undone.`)) return;
    run(purgeNote(store.getState(), note.id, device()));
  };

  return (
    <section id="screen-bin">
      <div className="eyebrow">Deleted notes</div>
      <h1 className="page-title tight">Dead Stars</h1>
      <p className="page-sub">Deleted notes wait here as dim stars. Restore one to bring it back into orbit, or remove it for good.</p>
      {list.length > 0 && (
        <div className="dead-bin" id="deleted-list">
          {list.map((note) => (
            <div className="dead-star-row" key={note.id}>
              <div className="dead-star-shape" aria-hidden="true" />
              <div className="dead-star-info">
                <div className="dead-star-title">{note.title || "Untitled note"}</div>
                <div className="dead-star-meta">{deletedLabel(note)}{note.tags.length ? ` · ${note.tags.join(", ")}` : ""}</div>
                {note.body.trim() && <div className="dead-star-excerpt">{note.body.trim().replace(/\s+/g, " ").slice(0, 130)}</div>}
              </div>
              <div className="dead-star-actions">
                <button className="pill" type="button" onClick={() => restore(note.id)}>Restore</button>
                <button className="pill pill-danger" type="button" onClick={() => purge(note)}>Delete forever</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {list.length === 0 && <div className="empty" id="bin-empty">No dead stars in the bin.</div>}
    </section>
  );
}

export function AddScreen() {
  const { addNote } = useApp();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  return (
    <section id="screen-add">
      <div className="add-wrap">
        <div className="eyebrow">New entry</div>
        <h1 className="page-title tight-xl">Add a note</h1>
        <label className="form-label first" htmlFor="add-title">What's the note called?</label>
        <input id="add-title" className="field" placeholder="e.g. How linking works" autoComplete="off" autoFocus
          value={title} onChange={(event) => setTitle(event.target.value)} />
        <label className="form-label" htmlFor="add-tags">Tags</label>
        <input id="add-tags" className="field" placeholder="tags, comma, separated" autoComplete="off"
          value={tags} onChange={(event) => setTags(event.target.value)} />
        <label className="form-label" htmlFor="add-body">First lines</label>
        <textarea id="add-body" className="field add-body" placeholder="Write your first lines… you can format and link after adding."
          value={body} onChange={(event) => setBody(event.target.value)} />
        <button id="add-save" className="save-btn" type="button" disabled={!title.trim()}
          onClick={() => addNote({ title: title.trim(), tags: parseTags(tags), body })}>Add to Saturn</button>
      </div>
    </section>
  );
}
