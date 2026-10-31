import { useEffect, useRef, useState } from "react";
import { PROJECT_CATEGORIES, TRACK_ROLES, sameId } from "../lib/domain.js";
import {
  MAX_ORBIT, MAX_WEEK, activeTracks, addLogEntry, addStarterProjects, addTrack, canMoveToOrbit, clearFinishedThisWeek,
  markReviewed, moveStage, orbitProjects, parkIdea, parkedReviewDue, projectProgress, removeTrack, reviewStatus,
  setThisWeek, thisWeekTasks, updateTrack,
} from "../lib/hq.js";
import { moveTask } from "../lib/planner.js";
import { CATEGORY_LABELS, CategoryChip, CommitInput, Modal, ProgressRing } from "../components/shared.jsx";
import { useApp } from "../AppContext.jsx";

const PARKED_PREVIEW = 3;
const REVIEW_LABELS = { done: "Done this week", due_today: "Due today", due_sunday: "Due Sunday", overdue: "Overdue" };
const TRACK_ROLE_LABELS = { main: "Main", support: "Support", cert: "Certification", school: "School" };
const REVIEW_STEPS = [
  { title: "Tick off finished work", hint: "Tick anything you finished this week." },
  { title: "Update statuses", hint: "Bring the tasks in your orbit projects up to date." },
  { title: "Pick 3 tasks", hint: null },
  { title: "Drop anything stuck", hint: "If a project has stopped moving, let it go. A reason is required." },
];

function projectsInStage(state, stage) {
  return state.projects
    .filter((project) => !project.tombstone && project.stage === stage)
    .sort((a, b) => b.stageChangedAt.localeCompare(a.stageChangedAt));
}

function projectName(state, id) {
  return state.projects.find((project) => sameId(project.id, id))?.name || "Untitled project";
}

function openTasksFor(state, projects) {
  const ids = new Set(projects.map((project) => String(project.id)));
  return state.tasks.filter((task) => !task.tombstone && task.status !== "done" && ids.has(String(task.projectId)));
}

function TaskCheck({ task, checked, disabled = false, done = false, onChange, name }) {
  return (
    <li className={done ? "hq-check is-done" : "hq-check"}>
      <label>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(task, event.target.checked)} />
        <span className="hq-check-text">{task.title}</span>
        <span className="hq-check-project">{name}</span>
      </label>
    </li>
  );
}

function OrbitCards({ onLog }) {
  const { state, openBoard } = useApp();
  const inOrbit = orbitProjects(state);
  return (
    <section className="hq-section" aria-labelledby="hq-orbit-title">
      <div className="hq-section-head">
        <h2 className="list-heading" id="hq-orbit-title">In orbit</h2>
        <span className="chip chip-muted" id="hq-slots">{inOrbit.length} of {MAX_ORBIT} slots used</span>
      </div>
      <div className="hq-orbit-grid" id="hq-orbit-cards">
        {inOrbit.map((project) => {
          const progress = projectProgress(state, project.id);
          return (
            <article className="hq-card" key={project.id}>
              <div className="hq-card-top">
                <div className="hq-card-info">
                  <CategoryChip category={project.category} />
                  <h3 className="group-title">{project.name}</h3>
                </div>
                <ProgressRing done={progress.done} total={progress.total} />
              </div>
              <p className="hq-next-step">{project.nextStep || "No next step yet."}</p>
              <div className="note-tools">
                <button className="pill pill-save" type="button" aria-label={`Open ${project.name}`} onClick={() => openBoard(project.id)}>Open</button>
                <button className="pill" type="button" aria-label={`Log session for ${project.name}`} onClick={() => onLog(project)}>Log session</button>
              </div>
            </article>
          );
        })}
        <div className="hq-card hq-slot">
          {canMoveToOrbit(state)
            ? "Open slot: choose a project below and move it to orbit."
            : "Slot locked: mark a project done or drop it to open a slot."}
        </div>
      </div>
    </section>
  );
}

function WeekPicker({ listId, countId }) {
  const { state, store, run, device } = useApp();
  const active = [...orbitProjects(state), ...projectsInStage(state, "next")].map((project) => String(project.id));
  const options = state.tasks.filter((task) => !task.tombstone && (task.thisWeek || (task.status !== "done" && active.includes(String(task.projectId)))));
  const picked = thisWeekTasks(state).length;
  return (
    <>
      <p className="hq-note" id={countId} role="status">
        {options.length ? `${picked} of ${MAX_WEEK} picked` : "No open tasks yet. Add some to a project in orbit or next."}
      </p>
      <ul className="hq-check-list" id={listId}>
        {options.map((task) => (
          <TaskCheck key={task.id} task={task} checked={task.thisWeek} name={projectName(state, task.projectId)}
            disabled={!task.thisWeek && picked >= MAX_WEEK}
            onChange={(item, on) => run(setThisWeek(store.getState(), item.id, on, device()))} />
        ))}
      </ul>
    </>
  );
}

function ThisWeek() {
  const { state, store, run, device } = useApp();
  const [picking, setPicking] = useState(false);
  const tasks = thisWeekTasks(state);
  const toggle = (task, on) => run(moveTask(store.getState(), task.id, on ? "done" : "todo", Infinity, device()));
  return (
    <section className="hq-section" aria-labelledby="hq-week-title">
      <div className="hq-section-head">
        <h2 className="list-heading" id="hq-week-title">This week's 3 tasks</h2>
        <button id="hq-week-pick" className="pill" type="button" onClick={() => setPicking(true)}>Pick tasks</button>
      </div>
      {tasks.length > 0
        ? (
          <ul className="hq-check-list" id="hq-week-list">
            {tasks.map((task) => (
              <TaskCheck key={task.id} task={task} checked={task.status === "done"} done={task.status === "done"}
                name={projectName(state, task.projectId)} onChange={toggle} />
            ))}
          </ul>
        )
        : <div className="empty small" id="hq-week-empty">No tasks picked for this week.</div>}
      <Modal open={picking} onClose={() => setPicking(false)} id="hq-week-dialog" labelledBy="hq-week-dialog-title">
        <h2 className="list-heading" id="hq-week-dialog-title">Pick this week's tasks</h2>
        <WeekPicker listId="hq-week-options" countId="hq-week-count" />
        <div className="note-tools">
          <button className="pill pill-save" type="button" onClick={() => setPicking(false)}>Done</button>
        </div>
      </Modal>
    </section>
  );
}

function ParkIdea() {
  const { store, run, device } = useApp();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("portfolio");
  const [status, setStatus] = useState("");
  const inputRef = useRef(null);
  return (
    <section className="hq-section hq-park" aria-labelledby="hq-park-title">
      <h2 className="list-heading" id="hq-park-title">New idea? Park it.</h2>
      <form id="hq-park-form" className="panel-card hq-park-form" onSubmit={(event) => {
        event.preventDefault();
        const clean = name.trim();
        if (run(parkIdea(store.getState(), { name: clean, category, ...device() }))) {
          setStatus("Give the idea a name first.");
          return;
        }
        setName("");
        setStatus(`Parked “${clean}”.`);
        inputRef.current?.focus();
      }}>
        <label className="form-label first" htmlFor="hq-park-name">Idea name</label>
        <input id="hq-park-name" ref={inputRef} className="field" placeholder="What's the idea?" autoComplete="off" value={name}
          onChange={(event) => { setName(event.target.value); setStatus(""); }} />
        <div className="pills" id="hq-park-category" role="group" aria-label="Category">
          {PROJECT_CATEGORIES.map((item) => (
            <button key={item} className={item === category ? "pill active" : "pill"} type="button" aria-pressed={item === category}
              onClick={() => setCategory(item)}>{CATEGORY_LABELS[item]}</button>
          ))}
        </div>
        <button id="hq-park-save" className="pill pill-save" type="submit" disabled={!name.trim()}>Park idea</button>
        <div id="hq-park-status" className="save-status hq-status" role="status">{status}</div>
      </form>
    </section>
  );
}

function ReviewTicks() {
  const { state, store, run, device } = useApp();
  // The list is fixed for the step, so a ticked task stays visible and can be unticked.
  const [ids] = useState(() => [...new Set([
    ...thisWeekTasks(state).filter((task) => task.status !== "done"),
    ...openTasksFor(state, orbitProjects(state)),
  ].map((task) => task.id))]);
  const tasks = ids.map((id) => state.tasks.find((task) => sameId(task.id, id))).filter((task) => task && !task.tombstone);
  if (!tasks.length) return <p className="empty small">Nothing open to tick off.</p>;
  return (
    <ul className="hq-check-list">
      {tasks.map((task) => (
        <TaskCheck key={task.id} task={task} checked={task.status === "done"} done={task.status === "done"} name={projectName(state, task.projectId)}
          onChange={(item, on) => run(moveTask(store.getState(), item.id, on ? "done" : "todo", Infinity, device()))} />
      ))}
    </ul>
  );
}

function ReviewStatuses() {
  const { state, store, run, device } = useApp();
  const [ids] = useState(() => openTasksFor(state, orbitProjects(state)).map((task) => task.id));
  const tasks = ids.map((id) => state.tasks.find((task) => sameId(task.id, id))).filter((task) => task && !task.tombstone);
  if (!tasks.length) return <p className="empty small">No open tasks in your orbit projects.</p>;
  return (
    <ul className="hq-check-list">
      {tasks.map((task) => (
        <li className="hq-status-row" key={task.id}>
          <span className="hq-check-text">{task.title}</span>
          <select className="field hq-status-select" aria-label={`Status of ${task.title}`} value={task.status}
            onChange={(event) => run(moveTask(store.getState(), task.id, event.target.value, Infinity, device()))}>
            <option value="todo">To do</option>
            <option value="doing">In progress</option>
            <option value="done">Done</option>
          </select>
        </li>
      ))}
    </ul>
  );
}

function ReviewDrops({ headingRef }) {
  const { state, requestDrop } = useApp();
  const candidates = [...orbitProjects(state), ...projectsInStage(state, "next")];
  if (!candidates.length) return <p className="empty small">No active projects to drop.</p>;
  return (
    <div className="ledger">
      {candidates.map((project) => (
        <div className="hq-status-row" key={project.id}>
          <span className="hq-check-text">{project.name}</span>
          <button className="pill" type="button" aria-label={`Drop ${project.name}`}
            onClick={() => requestDrop(project.id, () => headingRef.current?.focus())}>Drop</button>
        </div>
      ))}
    </div>
  );
}

function WeeklyReview() {
  const { state, store, run, device } = useApp();
  const [step, setStep] = useState(null);
  const headingRef = useRef(null);
  const startRef = useRef(null);

  const goTo = (index) => {
    // Entering "pick 3" is what frees the slots held by finished tasks.
    if (index === 2) run(clearFinishedThisWeek(store.getState(), device()));
    setStep(index);
  };
  useEffect(() => { if (step != null) headingRef.current?.focus(); }, [step]);

  const current = step == null ? null : REVIEW_STEPS[step];
  const last = step === REVIEW_STEPS.length - 1;
  return (
    <div className="panel-card hq-review-card">
      <span className="chip chip-muted" id="hq-review-status">{REVIEW_LABELS[reviewStatus(state.hq)]}</span>
      <span className="spacer" />
      <button id="hq-review-start" ref={startRef} className="pill pill-save" type="button" onClick={() => goTo(0)}>Start review</button>
      <Modal open={step != null} onClose={() => setStep(null)} id="hq-review-dialog" labelledBy="hq-review-heading">
        {current && (
          <>
            <div className="eyebrow" id="hq-review-step">Step {step + 1} of {REVIEW_STEPS.length}</div>
            <h2 className="hq-dialog-title" id="hq-review-heading" tabIndex={-1} ref={headingRef} data-autofocus>{current.title}</h2>
            {current.hint && <p className="hq-note" role="status">{current.hint}</p>}
            <div id="hq-review-body">
              {step === 0 && <ReviewTicks />}
              {step === 1 && <ReviewStatuses />}
              {step === 2 && <WeekPicker listId="hq-review-options" countId="hq-review-hint" />}
              {step === 3 && <ReviewDrops headingRef={headingRef} />}
            </div>
            <div className="note-tools">
              {step > 0 && <button id="hq-review-back" className="pill" type="button" onClick={() => goTo(step - 1)}>Back</button>}
              <button id="hq-review-next" className="pill pill-save" type="button" onClick={() => {
                if (!last) { goTo(step + 1); return; }
                run(markReviewed(store.getState(), "lastReviewAt"));
                setStep(null);
                startRef.current?.focus();
              }}>{last ? "Finish review" : "Next"}</button>
              <span className="spacer" />
              <button className="pill" type="button" onClick={() => setStep(null)}>Close</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function ParkedReview() {
  const { state, store, run, device, requestDrop } = useApp();
  const [open, setOpen] = useState(false);
  const headingRef = useRef(null);
  const parked = projectsInStage(state, "parked");
  // Stays while its dialog is open, or finishing the last project would remove it mid-review.
  if (!open && !(parkedReviewDue(state.hq) && parked.length)) return null;
  const refocus = () => headingRef.current?.focus();
  return (
    <div className="panel-card hq-review-card hq-parked-prompt" id="hq-parked-prompt">
      <span>Monthly check: is anything parked worth picking up, or letting go?</span>
      <span className="spacer" />
      <button id="hq-parked-review" className="pill" type="button" onClick={() => setOpen(true)}>Review parked</button>
      <Modal open={open} onClose={() => setOpen(false)} id="hq-parked-dialog" labelledBy="hq-parked-heading">
        <h2 className="hq-dialog-title" id="hq-parked-heading" tabIndex={-1} ref={headingRef}>Parked review</h2>
        <p className="hq-note">Move what's ready to Next, and drop what you've let go of. The rest stays parked.</p>
        <div className="ledger" id="hq-parked-options">
          {parked.length === 0 && <p className="empty small">Nothing left in Parked.</p>}
          {parked.map((project) => (
            <div className="hq-status-row" key={project.id}>
              <span className="hq-check-text">{project.name}</span>
              <button className="pill" type="button" aria-label={`Move ${project.name} to Next`} onClick={() => {
                run(moveStage(store.getState(), project.id, "next", device()));
                refocus();
              }}>Move to Next</button>
              <button className="pill" type="button" aria-label={`Drop ${project.name}`} onClick={() => requestDrop(project.id, refocus)}>Drop</button>
            </div>
          ))}
        </div>
        <div className="note-tools">
          <button id="hq-parked-finish" className="pill pill-save" type="button" onClick={() => {
            run(markReviewed(store.getState(), "lastParkedReviewAt"));
            setOpen(false);
          }}>Finish review</button>
          <button className="pill" type="button" onClick={() => setOpen(false)}>Close</button>
        </div>
      </Modal>
    </div>
  );
}

function ProjectMini({ project }) {
  const { openBoard } = useApp();
  return (
    <button className="hq-mini" type="button" onClick={() => openBoard(project.id)}>
      <span className="hq-mini-title">{project.name}</span>
      <CategoryChip category={project.category} />
      {project.nextStep && <span className="hq-mini-next">{project.nextStep}</span>}
    </button>
  );
}

function AllProjects() {
  const { state, openBoard } = useApp();
  const [expanded, setExpanded] = useState(false);
  const dropped = projectsInStage(state, "dropped");
  const extra = projectsInStage(state, "parked").length - PARKED_PREVIEW;
  return (
    <section className="hq-section" aria-labelledby="hq-projects-title">
      <h2 className="list-heading" id="hq-projects-title">All projects</h2>
      <div className="hq-columns">
        {[["next", "Next"], ["parked", "Parked"], ["done", "Done"]].map(([stage, label]) => {
          const all = projectsInStage(state, stage);
          const shown = stage === "parked" && !expanded ? all.slice(0, PARKED_PREVIEW) : all;
          return (
            <div className="hq-column" key={stage}>
              <h3 className="kb-col-head">{label} <span className="kb-count" id={`hq-${stage}-count`}>{all.length}</span></h3>
              <div className="hq-column-list" id={`hq-${stage}-list`}>
                {shown.map((project) => <ProjectMini key={project.id} project={project} />)}
              </div>
              {stage === "parked" && extra > 0 && (
                <button id="hq-parked-more" className="hq-more" type="button" onClick={() => setExpanded(!expanded)}>
                  {expanded ? "Show fewer" : `Show ${extra} more`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {dropped.length > 0 && (
        <details className="hq-dropped" id="hq-dropped">
          <summary>Dropped ({dropped.length})</summary>
          <div className="ledger" id="hq-dropped-list">
            {dropped.map((project) => (
              <button className="hq-dropped-row" type="button" key={project.id} onClick={() => openBoard(project.id)}>
                <span className="hq-mini-title">{project.name}</span>
                <span className="hq-mini-next">{project.droppedReason}</span>
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function LearningTracks() {
  const { state, store, run, device } = useApp();
  const tracks = activeTracks(state);
  const [name, setName] = useState("");
  const [role, setRole] = useState(TRACK_ROLES[0]);
  const update = (id, patch) => run(updateTrack(store.getState(), id, patch, device()));
  return (
    <section className="hq-section" aria-labelledby="hq-tracks-title">
      <h2 className="list-heading" id="hq-tracks-title">Learning tracks</h2>
      <div className="hq-tracks" id="hq-tracks">
        {tracks.map((track) => (
          <article className="hq-track" key={track.id}>
            <div className="break-head">
              <h3 className="hq-mini-title">{track.name}</h3>
              <span className="chip chip-muted">{TRACK_ROLE_LABELS[track.role]}</span>
            </div>
            <div className="bar-track" role="progressbar" aria-label={`${track.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={track.progress}>
              <div className="bar-fill" style={{ width: `${track.progress}%`, background: "var(--accent)" }} />
            </div>
            <div className="hq-track-controls">
              <label className="hq-track-percent">
                <CommitInput className="field" type="number" min="0" max="100" aria-label={`${track.name} progress percent`}
                  value={String(track.progress)} onCommit={(progress) => update(track.id, { progress })} />%
              </label>
              <CommitInput className="field" placeholder="Next step" aria-label={`${track.name} next step`}
                value={track.nextStep} onCommit={(nextStep) => update(track.id, { nextStep })} />
              <button className="row-delete" type="button" aria-label={`Remove ${track.name}`} onClick={() => {
                if (confirm("Remove this learning track? This can't be undone.")) run(removeTrack(store.getState(), track.id, device()));
              }}>Remove</button>
            </div>
          </article>
        ))}
      </div>
      {tracks.length === 0 && <div className="empty small" id="hq-tracks-empty">No learning tracks yet.</div>}
      <form id="hq-track-form" className="hq-track-form" onSubmit={(event) => {
        event.preventDefault();
        if (!run(addTrack(store.getState(), { name, role, ...device() }))) setName("");
      }}>
        <label className="visually-hidden" htmlFor="hq-track-name">Track name</label>
        <input id="hq-track-name" className="field" placeholder="Name a track…" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
        <label className="visually-hidden" htmlFor="hq-track-role">Track role</label>
        <select id="hq-track-role" className="field" value={role} onChange={(event) => setRole(event.target.value)}>
          {TRACK_ROLES.map((item) => <option key={item} value={item}>{TRACK_ROLE_LABELS[item]}</option>)}
        </select>
        <button id="hq-track-add" className="pill" type="submit" disabled={!name.trim()}>Add track</button>
      </form>
    </section>
  );
}

function LogDialog({ project, onClose }) {
  const { state, store, run } = useApp();
  const [text, setText] = useState("");
  return (
    <Modal open={!!project} onClose={onClose} id="hq-log-dialog" labelledBy="hq-log-title">
      {project && (
        <form id="hq-log-form" onSubmit={(event) => {
          event.preventDefault();
          if (run(addLogEntry(store.getState(), project.id, text, undefined, store.deviceId()))) return;
          setText("");
          onClose();
        }}>
          <h2 className="list-heading" id="hq-log-title">Log a session</h2>
          <p className="hq-note" id="hq-log-project">{projectName(state, project.id)}</p>
          <label className="form-label first" htmlFor="hq-log-text">What happened?</label>
          <textarea id="hq-log-text" className="field hq-log-text" data-autofocus value={text} onChange={(event) => setText(event.target.value)} />
          <div className="note-tools">
            <button id="hq-log-save" className="pill pill-save" type="submit" disabled={!text.trim()}>Save to log</button>
            <button className="pill" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function OrbitScreen() {
  const { state, store, run, device } = useApp();
  const [logProject, setLogProject] = useState(null);
  return (
    <section id="screen-orbit">
      <div className="eyebrow">Saturn HQ</div>
      <h1 className="page-title tight">Orbit</h1>
      <p className="page-sub">Two projects at a time. New ideas get parked, not started.</p>
      {!state.hq.starterAddedAt && (
        <div className="panel-card hq-starter" id="hq-starter">
          <p>Start with your project list: anything with a name you already use is skipped.</p>
          <button id="hq-starter-add" className="pill pill-save" type="button" onClick={() => run(addStarterProjects(store.getState(), device()))}>Add my starter projects</button>
        </div>
      )}
      <div className="hq-sections">
        <OrbitCards onLog={setLogProject} />
        <ThisWeek />
        <ParkIdea />
        <section className="hq-section" aria-labelledby="hq-review-title">
          <h2 className="list-heading" id="hq-review-title">Weekly review</h2>
          <WeeklyReview />
          <ParkedReview />
        </section>
        <AllProjects />
        <LearningTracks />
      </div>
      <LogDialog project={logProject} onClose={() => setLogProject(null)} />
    </section>
  );
}
