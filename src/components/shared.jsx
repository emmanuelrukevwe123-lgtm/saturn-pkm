import { useEffect, useRef, useState } from "react";
import { PROJECT_CATEGORIES } from "../lib/domain.js";
import { allTags } from "../lib/notes.js";
import { renderMarkdown } from "../lib/markdown.js";
import { useApp } from "../AppContext.jsx";

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const CATEGORY_LABELS = { career: "Career", portfolio: "Portfolio", creative: "Creative", learning: "Learning" };

// Retro tag palette: teal / orange / brown / olive (light / dark values)
const TAG_LIGHT = ["#2F5D54", "#9A3A10", "#6A4225", "#566425"];
const TAG_DARK = ["#8FD0C2", "#EFA067", "#D9B48A", "#C2CC8B"];

export function hexA(hex, alpha) {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

export function useTagColor() {
  const { state, dark } = useApp();
  const tags = allTags(state.notes);
  return (tag) => (dark ? TAG_DARK : TAG_LIGHT)[Math.max(0, tags.indexOf(tag)) % 4];
}

export function TagChip({ tag }) {
  const { dark } = useApp();
  const color = useTagColor()(tag);
  return <span className="chip" style={{ color, background: hexA(color, dark ? 0.2 : 0.13) }}>{tag}</span>;
}

export function CategoryChip({ category }) {
  const { dark } = useApp();
  const color = (dark ? TAG_DARK : TAG_LIGHT)[PROJECT_CATEGORIES.indexOf(category)];
  // Fainter than tag chips in dark mode: these sit on raised cards, where the
  // stronger tint falls below readable contrast.
  return <span className="chip" style={{ color, background: hexA(color, dark ? 0.08 : 0.13) }}>{CATEGORY_LABELS[category]}</span>;
}

export function ProgressRing({ done, total, size = 64 }) {
  const radius = size / 2 - 6;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  return (
    <div className="group-ring" style={{ width: size, height: size }} role="img" aria-label={`${done} of ${total} tasks done`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={center} cy={center} r={radius} fill="none" strokeWidth="6" />
        <circle className="ring-progress" cx={center} cy={center} r={radius} fill="none" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - (total ? done / total : 0))}
          transform={`rotate(-90 ${center} ${center})`} />
      </svg>
      <div className="group-pct">{done}/{total}</div>
    </div>
  );
}

export function editedLabel(note) {
  const date = new Date(note.updated);
  if (date.toDateString() === new Date().toDateString()) return "edited today";
  return `edited ${MON[date.getMonth()]} ${date.getDate()}`;
}

export function NoteRow({ note, index = null, onDelete = null }) {
  const { openNote } = useApp();
  return (
    <div className="row" onClick={() => openNote(note.id)}>
      {index != null && <div className="row-index">{String(index + 1).padStart(2, "0")}</div>}
      {/* The click bubbles to the row, so the whole row works with a mouse and this button with a keyboard. */}
      <button className="row-title" type="button">{note.title || "Untitled note"}</button>
      {note.tags.length > 0 && <TagChip tag={note.tags[0]} />}
      <span className="row-date">{editedLabel(note)}</span>
      {onDelete && (
        <button className="row-delete" type="button" title="Delete note" aria-label={`Delete ${note.title || "Untitled note"}`}
          onClick={(event) => { event.stopPropagation(); onDelete(note.id); }}>Delete</button>
      )}
    </div>
  );
}

// Rendered through renderMarkdown, which escapes all user text before building
// HTML; that's the one reason this innerHTML is safe. Keep it the only source.
export function Rendered({ text, className = "", onLink, ...props }) {
  const { markdownContext } = useApp();
  return (
    <div {...props} className={`rendered ${className}`.trim()}
      onClick={(event) => {
        const link = event.target.closest(".wiki-link");
        if (link && onLink) onLink(link.dataset.link);
      }}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text, markdownContext) }} />
  );
}

// Native <dialog>: traps focus, handles Esc and restores focus for free.
export function Modal({ open, onClose, labelledBy, id, className = "hq-dialog", closeOnBackdrop = false, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);
  return (
    <dialog ref={ref} id={id} className={className} aria-labelledby={labelledBy}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        if (!closeOnBackdrop || event.target !== ref.current) return;
        const box = ref.current.getBoundingClientRect();
        const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
        if (!inside) onClose();
      }}>
      {open && children}
    </dialog>
  );
}

// Holds typed text locally and commits on blur or Enter, so a half-typed value
// is never normalized out from under the cursor.
export function CommitInput({ value, onCommit, onBlur, onKeyDown, ...props }) {
  const [text, setText] = useState(value);
  const [tick, setTick] = useState(0);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value, tick]);
  return (
    <input {...props} value={text}
      onChange={(event) => setText(event.target.value)}
      onFocus={() => { focused.current = true; }}
      onBlur={(event) => {
        focused.current = false;
        if (text !== String(value)) onCommit(text);
        setTick((current) => current + 1);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.target.blur();
        onKeyDown?.(event);
      }} />
  );
}
