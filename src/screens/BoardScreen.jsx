import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PROJECT_CATEGORIES, sameId } from "../lib/domain.js";
import {
  addLink, addLogEntry, canMoveToOrbit, moveStage, projectProgress, removeLink, updateProjectDetails,
} from "../lib/hq.js";
import { parseTags } from "../lib/notes.js";
import {
  TASK_STATUSES, createProject, createTask, deleteProject, deleteTask, liveProjects, moveTask, renameProject, tasksFor, updateTask,
} from "../lib/planner.js";
import { CATEGORY_LABELS, CategoryChip, CommitInput, MON, Modal, ProgressRing, Rendered, TagChip } from "../components/shared.jsx";
import { useApp } from "../AppContext.jsx";

const STAGE_LABELS = { orbit: "In orbit", next: "Next", parked: "Parked", done: "Done", dropped: "Dropped" };
const COLUMNS = [["todo", "To do"], ["doing", "In progress"], ["done", "Done"]];
const ORBIT_FULL_NOTE = "Both orbit slots are taken. Mark a project done or drop it to open a slot.";

function useDeleteProject() {
  const { state, store, run, device, screen, activeProjectId, navigate } = useApp();
  return (id) => {
    const project = state.projects.find((item) => !item.tombstone && sameId(item.id, id));
    if (!project) return;
    const count = state.tasks.filter((task) => !task.tombstone && sameId(task.projectId, id)).length;
    const label = count === 1 ? "its 1 task" : `its ${count} tasks`;
    if (!confirm(`Delete “${project.name || "Untitled project"}” and ${label}? This can't be undone.`)) return;
    if (run(deleteProject(store.getState(), id, device()))) return;
    if (screen === "board" && sameId(activeProjectId, id)) navigate("planner");
  };
}

export function PlannerScreen() {
  const { state, store, run, device, openBoard } = useApp();
  const removeProject = useDeleteProject();
  const [name, setName] = useState("");
  const projects = liveProjects(state).sort((a, b) => b.updated.localeCompare(a.updated));

  const create = () => {
    const clean = name.trim();
    if (!clean) return;
    const result = createProject(store.getState(), clean, device());
    if (run(result.state)) return;
    setName("");
    openBoard(result.project.id);
  };

  return (
    <section id="screen-planner">
      <div className="eyebrow">Boards</div>
      <h1 className="page-title tight">Planner</h1>
      <p className="page-sub">Plan your projects on kanban boards. Each project gets its own columns of tasks — drag cards along as work moves forward.</p>
      <div className="project-new">
        <input id="project-name" className="field" placeholder="Name a new project…" aria-label="New project name" autoComplete="off"
          value={name} onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") create(); }} />
        <button id="project-create" className="pill pill-save" type="button" disabled={!name.trim()} onClick={create}>Create</button>
      </div>
      <div className="ledger" id="project-list">
        {projects.map((project, index) => {
          const count = state.tasks.filter((task) => !task.tombstone && sameId(task.projectId, project.id)).length;
          return (
            <div className="row" key={project.id} onClick={() => openBoard(project.id)}>
              <div className="row-index">{String(index + 1).padStart(2, "0")}</div>
              <button className="row-title" type="button">{project.name || "Untitled project"}</button>
              <span className="chip chip-muted">{count === 1 ? "1 task" : `${count} tasks`}</span>
              <button className="row-delete" type="button" title="Delete project" aria-label={`Delete ${project.name || "Untitled project"}`}
                onClick={(event) => { event.stopPropagation(); removeProject(project.id); }}>Delete</button>
            </div>
          );
        })}
      </div>
      {projects.length === 0 && <div className="empty" id="planner-empty">No boards yet — name your first project above.</div>}
    </section>
  );
}

function logDate(value) {
  const date = new Date(value);
  return `${MON[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function ProjectHeader({ project }) {
  const { state, store, run, device, requestDrop } = useApp();
  const progress = projectProgress(state, project.id);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState(false);
  const [logText, setLogText] = useState("");
  const stageRef = useRef(null);

  const inOrbit = project.stage === "orbit";
  const blocked = !inOrbit && !canMoveToOrbit(state);

  const save = (patch) => run(updateProjectDetails(store.getState(), project.id, patch, device()));
  const move = (stage) => {
    // The pressed button may now be disabled, which would drop keyboard focus.
    if (!run(moveStage(store.getState(), project.id, stage, device()))) stageRef.current?.focus();
  };

  return (
    <div className="panel-card hq-header" id="project-header">
      <div className="hq-header-top">
        <div className="hq-ring-large" id="ph-ring"><ProgressRing done={progress.done} total={progress.total} size={112} /></div>
        <div className="hq-header-info">
          <div className="hq-chips">
            <span className="chip chip-muted" id="ph-stage" tabIndex={-1} ref={stageRef}>{STAGE_LABELS[project.stage]}</span>
            <span id="ph-category-chip"><CategoryChip category={project.category} /></span>
          </div>
          <label className="form-label" htmlFor="ph-next-step">Next step</label>
          <CommitInput id="ph-next-step" className="field" placeholder="The one next thing to do" autoComplete="off"
            value={project.nextStep} onCommit={(nextStep) => save({ nextStep })} />
          <label className="form-label" htmlFor="ph-done-when">Done when</label>
          <CommitInput id="ph-done-when" className="field" placeholder="How you'll know it's finished" autoComplete="off"
            value={project.doneWhen} onCommit={(doneWhen) => save({ doneWhen })} />
          <label className="form-label" htmlFor="ph-category">Category</label>
          <select id="ph-category" className="field" value={project.category} onChange={(event) => save({ category: event.target.value })}>
            {PROJECT_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}
          </select>
        </div>
      </div>

      <div className="note-tools">
        <button id="ph-orbit" className="pill pill-save" type="button" aria-describedby={blocked ? "ph-orbit-note" : undefined}
          disabled={inOrbit || blocked} onClick={() => move("orbit")}>Move to orbit</button>
        <button id="ph-done" className="pill" type="button" disabled={project.stage === "done"} onClick={() => move("done")}>Mark done</button>
        <button id="ph-drop" className="pill pill-danger" type="button" disabled={project.stage === "dropped"}
          onClick={() => requestDrop(project.id, () => stageRef.current?.focus())}>Drop with reason</button>
        <button id="ph-park" className="pill" type="button" disabled={project.stage === "parked"} onClick={() => move("parked")}>Park</button>
      </div>
      {blocked && <p className="hq-note" id="ph-orbit-note">{ORBIT_FULL_NOTE}</p>}

      <h2 className="form-label">Links</h2>
      <ul className="hq-links" id="ph-links">
        {project.links.map((link) => (
          <li key={link.id}>
            {/* Stored urls are limited to http and https by normalizeProject. */}
            <a className="hq-link" href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
            <button className="row-delete" type="button" aria-label={`Remove link ${link.label}`}
              onClick={() => run(removeLink(store.getState(), project.id, link.id, device()))}>Remove</button>
          </li>
        ))}
      </ul>
      <form id="ph-link-form" className="hq-link-form" noValidate onSubmit={(event) => {
        event.preventDefault();
        const error = run(addLink(store.getState(), project.id, { label: linkLabel, url: linkUrl }, device()));
        setLinkError(!!error);
        if (!error) { setLinkLabel(""); setLinkUrl(""); }
      }}>
        <label className="visually-hidden" htmlFor="ph-link-label">Link label</label>
        <input id="ph-link-label" className="field" placeholder="Label" autoComplete="off" value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} />
        <label className="visually-hidden" htmlFor="ph-link-url">Link address</label>
        <input id="ph-link-url" className="field" type="url" placeholder="https://…" autoComplete="off" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} />
        <button className="pill" type="submit">Add link</button>
      </form>
      {linkError && <p className="hq-note hq-error" id="ph-link-error" role="alert">Enter a full web address starting with http:// or https://.</p>}

      <h2 className="form-label">Session log</h2>
      <form id="ph-log-form" className="hq-log-form" onSubmit={(event) => {
        event.preventDefault();
        if (!run(addLogEntry(store.getState(), project.id, logText, undefined, store.deviceId()))) setLogText("");
      }}>
        <label className="visually-hidden" htmlFor="ph-log-text">Log a session</label>
        <textarea id="ph-log-text" className="field hq-log-text" placeholder="What happened this session?" value={logText} onChange={(event) => setLogText(event.target.value)} />
        <button id="ph-log-save" className="pill" type="submit" disabled={!logText.trim()}>+ Log a session</button>
      </form>
      <ol className="hq-log" id="ph-log">
        {project.log.map((entry) => (
          <li key={entry.id}>
            <span className="hq-log-date">{logDate(entry.date)}</span>
            <p className="hq-log-entry">{entry.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function InlineAdd({ onAdd }) {
  const [adding, setAdding] = useState(false);
  const done = useRef(false);
  if (!adding) {
    return <button className="kb-add" type="button" onClick={() => { done.current = false; setAdding(true); }}>＋ Add task</button>;
  }
  const finish = (value, commit) => {
    if (done.current) return;
    done.current = true;
    setAdding(false);
    if (commit && value.trim()) onAdd(value.trim());
  };
  return (
    <input className="field kb-add-field" placeholder="Task title…" aria-label="New task title" autoComplete="off" autoFocus
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(event.target.value, true);
        else if (event.key === "Escape") { event.stopPropagation(); finish(event.target.value, false); }
      }}
      onBlur={(event) => finish(event.target.value, true)} />
  );
}

function isOverdue(task) {
  if (!task.due || task.status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${task.due}T00:00:00`) < today;
}

function dueLabel(due) {
  const date = new Date(`${due}T00:00:00`);
  return `${MON[date.getMonth()]} ${date.getDate()}`;
}

function TaskCard({ task, onOpen, onGripKey }) {
  return (
    <div className="kb-card" data-id={task.id} onClick={(event) => { if (!event.target.closest(".kb-grip")) onOpen(task.id); }}>
      {/* A pointer tap on the grip is handled by the drag code; detail 0 means Enter or Space. */}
      <button type="button" className="kb-grip" title="Drag or use arrow keys to move"
        aria-label={`Move ${task.title}. Use left and right for columns; up and down for position. Press Enter to open.`}
        onClick={(event) => { if (event.detail === 0) onOpen(task.id); }}
        onKeyDown={(event) => onGripKey(event, task)}>⠿</button>
      <div className="kb-card-body">
        <div className="kb-card-title">{task.title || "Untitled task"}</div>
        <div className="kb-meta">
          {task.due && <span className={`chip kb-due${isOverdue(task) ? " overdue" : ""}`}>{dueLabel(task.due)}</span>}
          <span className={`chip kb-prio prio-${task.priority}`}>{task.priority === "med" ? "medium" : task.priority}</span>
          {task.tags.slice(0, 2).map((tag) => <TagChip key={tag} tag={tag} />)}
        </div>
      </div>
    </div>
  );
}

function TaskDialog({ taskId, onClose }) {
  const { state, store, run, device, followWikiLink } = useApp();
  const task = state.tasks.find((item) => !item.tombstone && sameId(item.id, taskId));
  const [draft, setDraft] = useState(() => task && {
    title: task.title, status: task.status, due: task.due, priority: task.priority, tagsText: task.tags.join(", "), notes: task.notes,
  });

  useEffect(() => { if (!task) onClose(); }, [task, onClose]);
  if (!task || !draft) return null;

  const tags = parseTags(draft.tagsText);
  const dirty = draft.title !== task.title || draft.status !== task.status || draft.due !== task.due ||
    draft.priority !== task.priority || draft.notes !== task.notes ||
    tags.length !== task.tags.length || tags.some((tag, index) => tag !== task.tags[index]);

  const close = () => {
    if (dirty && !confirm("Discard unsaved changes?")) return false;
    onClose();
    return true;
  };
  const save = () => {
    const patch = { title: draft.title.trim() || "Untitled task", status: draft.status, due: draft.due, priority: draft.priority, tags, notes: draft.notes };
    // A status change re-files the card at the end of its new column.
    if (patch.status !== task.status) patch.order = tasksFor(store.getState(), task.projectId, patch.status).length;
    if (!run(updateTask(store.getState(), task.id, patch, device()))) setDraft((current) => ({ ...current, title: patch.title }));
  };
  const remove = () => {
    if (!confirm(`Delete “${task.title || "Untitled task"}”? This can't be undone.`)) return;
    if (!run(deleteTask(store.getState(), task.id, device()))) onClose();
  };
  const pills = (name, field, options) => (
    <div className="pills tight-pills" id={`task-${name}-pills`} role="group" aria-labelledby={`task-${name}-label`}>
      {options.map(([value, label]) => (
        <button key={value} className={`pill${draft[field] === value ? " active" : ""}`} type="button" aria-pressed={draft[field] === value}
          onClick={() => setDraft({ ...draft, [field]: value })}>{label}</button>
      ))}
    </div>
  );

  return (
    <Modal open onClose={close} id="task-pop" className="task-pop" labelledBy="task-dialog-title" closeOnBackdrop>
      <div className="list-heading" id="task-dialog-title">Task</div>
      <input id="task-title" className="field" placeholder="What needs doing?" aria-label="Task title" autoComplete="off" data-autofocus
        value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      <div className="form-label" id="task-status-label">Status</div>
      {pills("status", "status", COLUMNS)}
      <label className="form-label" htmlFor="task-due">Due date</label>
      <input id="task-due" className="field" type="date" value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} />
      <div className="form-label" id="task-prio-label">Priority</div>
      {pills("prio", "priority", [["low", "Low"], ["med", "Medium"], ["high", "High"]])}
      <label className="form-label" htmlFor="task-tags">Tags</label>
      <input id="task-tags" className="field" placeholder="tags, comma, separated" autoComplete="off"
        value={draft.tagsText} onChange={(event) => setDraft({ ...draft, tagsText: event.target.value })} />
      <label className="form-label" htmlFor="task-notes">Notes</label>
      <textarea id="task-notes" className="field task-notes" placeholder="Details… link a Saturn note with [[double brackets]]."
        value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
      {draft.notes.trim() && (
        <Rendered id="task-notes-preview" className="task-notes-preview" text={draft.notes}
          onLink={(title) => { if (close()) followWikiLink(title); }} />
      )}
      <div className="note-tools task-tools">
        <button id="task-save" className="pill pill-save" type="button" disabled={!dirty} onClick={save}>Save task</button>
        <span className="spacer" />
        <button id="task-delete" className="pill pill-danger" type="button" onClick={remove}>Delete</button>
        <button id="task-close" className="pill" type="button" onClick={close}>Close</button>
      </div>
    </Modal>
  );
}

export function BoardScreen() {
  const { state, store, run, device, activeProjectId, navigate } = useApp();
  const removeProject = useDeleteProject();
  const project = liveProjects(state).find((item) => sameId(item.id, activeProjectId));
  const [taskId, setTaskId] = useState(null);
  const boardRef = useRef(null);
  const drag = useRef(null);
  const refocusTask = useRef(null);

  const missing = !project;
  useEffect(() => { if (missing) navigate("planner"); }, [missing, navigate]);

  // After a keyboard move React may rebuild the card in its new column.
  useLayoutEffect(() => {
    if (refocusTask.current == null) return;
    boardRef.current?.querySelector(`.kb-card[data-id="${CSS.escape(String(refocusTask.current))}"] .kb-grip`)?.focus();
    refocusTask.current = null;
  });

  if (!project) return null;

  const closeTask = () => {
    refocusTask.current = taskId;
    setTaskId(null);
  };

  const gripKey = (event, task) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const current = store.getState();
    const position = TASK_STATUSES.indexOf(task.status);
    let status = task.status;
    let index = tasksFor(current, task.projectId, task.status).findIndex((item) => sameId(item.id, task.id));
    if (event.key === "ArrowLeft") status = TASK_STATUSES[Math.max(0, position - 1)];
    if (event.key === "ArrowRight") status = TASK_STATUSES[Math.min(TASK_STATUSES.length - 1, position + 1)];
    if (event.key === "ArrowUp") index -= 1;
    if (event.key === "ArrowDown") index += 1;
    if (status !== task.status) index = tasksFor(current, task.projectId, status).length;
    refocusTask.current = task.id;
    run(moveTask(current, task.id, status, index, device()));
  };

  // Drag and drop: pointer events, starting only from the grip so card bodies
  // keep native touch scrolling. The ghost and placeholder live outside React's
  // tree for the drag, and are gone again before the move re-renders the board.
  const startGhost = (event) => {
    const { card } = drag.current;
    const box = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add("kb-ghost");
    ghost.style.width = `${box.width}px`;
    document.body.appendChild(ghost);
    const placeholder = document.createElement("div");
    placeholder.className = "kb-placeholder";
    placeholder.style.height = `${box.height}px`;
    Object.assign(drag.current, { ghost, placeholder, offsetX: event.clientX - box.left, offsetY: event.clientY - box.top });
    card.classList.add("kb-lift");
    boardRef.current.classList.add("kb-dragging"); // scroll-snap would fight the auto-scroll
  };

  const placePlaceholder = (event) => {
    const column = document.elementFromPoint(event.clientX, event.clientY)?.closest(".kb-col");
    if (!column) return;
    const cards = column.querySelector(".kb-cards");
    let before = null;
    for (const card of cards.querySelectorAll(".kb-card")) {
      if (card === drag.current.card) continue;
      const box = card.getBoundingClientRect();
      if (event.clientY < box.top + box.height / 2) { before = card; break; }
    }
    cards.insertBefore(drag.current.placeholder, before);
  };

  // Near an edge the board scrolls, which is vital on a phone showing one column.
  const autoScroll = (event) => {
    const edge = 48;
    const step = 12;
    const board = boardRef.current;
    const box = board.getBoundingClientRect();
    if (event.clientX < box.left + edge) board.scrollLeft -= step;
    else if (event.clientX > box.right - edge) board.scrollLeft += step;
    const cards = document.elementFromPoint(event.clientX, event.clientY)?.closest(".kb-cards");
    if (cards) {
      const cardBox = cards.getBoundingClientRect();
      if (event.clientY < cardBox.top + edge) cards.scrollTop -= step;
      else if (event.clientY > cardBox.bottom - edge) cards.scrollTop += step;
    }
  };

  const endDrag = (current) => {
    current.ghost?.remove();
    current.placeholder?.remove();
    current.card.classList.remove("kb-lift");
    boardRef.current?.classList.remove("kb-dragging");
  };

  const boardHandlers = {
    onPointerDown(event) {
      const grip = event.target.closest(".kb-grip");
      const card = grip?.closest(".kb-card");
      if (!card) return;
      drag.current = { id: card.dataset.id, card, startX: event.clientX, startY: event.clientY, moved: false };
      try { grip.setPointerCapture(event.pointerId); } catch { /* no active pointer */ }
      event.preventDefault();
    },
    onPointerMove(event) {
      if (!drag.current) return;
      if (!drag.current.moved) {
        if (Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY) < 6) return;
        drag.current.moved = true;
        startGhost(event);
      }
      drag.current.ghost.style.left = `${event.clientX - drag.current.offsetX}px`;
      drag.current.ghost.style.top = `${event.clientY - drag.current.offsetY}px`;
      placePlaceholder(event);
      autoScroll(event);
    },
    onPointerUp() {
      const current = drag.current;
      if (!current) return;
      drag.current = null;
      if (!current.moved) { setTaskId(current.id); return; }
      const cards = current.placeholder?.parentElement;
      let move = null;
      if (cards) {
        let index = 0;
        for (const child of cards.children) {
          if (child === current.placeholder) break;
          if (child.classList.contains("kb-card") && child !== current.card) index += 1;
        }
        move = { status: cards.closest(".kb-col").dataset.status, index };
      }
      endDrag(current);
      if (move) run(moveTask(store.getState(), current.id, move.status, move.index, device()));
    },
    onPointerCancel() {
      const current = drag.current;
      if (!current) return;
      drag.current = null;
      endDrag(current);
    },
  };

  return (
    <section id="screen-board">
      <button className="back-link" id="board-back" type="button" onClick={() => navigate("planner")}>← Projects</button>
      <div className="eyebrow">Board</div>
      <CommitInput id="board-title" className="title-input" placeholder="Untitled project" aria-label="Project name" autoComplete="off"
        value={project.name} onCommit={(name) => run(renameProject(store.getState(), project.id, name, device()))} />
      <div className="note-tools">
        <span className="spacer" />
        <button id="board-delete" className="pill pill-danger" type="button" onClick={() => removeProject(project.id)}>Delete project</button>
      </div>

      <ProjectHeader project={project} />

      <div className="kb-board j-scroll" id="kb-board" ref={boardRef} {...boardHandlers}>
        {COLUMNS.map(([status, label]) => {
          const tasks = tasksFor(state, project.id, status);
          return (
            <div className="kb-col" data-status={status} key={status}>
              <div className="kb-col-head">{label} <span className="kb-count">{tasks.length || ""}</span></div>
              <div className="kb-cards j-scroll">
                {tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={setTaskId} onGripKey={gripKey} />)}
              </div>
              <InlineAdd onAdd={(title) => run(createTask(store.getState(), project.id, status, title, device()))} />
            </div>
          );
        })}
      </div>
      {taskId != null && <TaskDialog key={taskId} taskId={taskId} onClose={closeTask} />}
    </section>
  );
}
