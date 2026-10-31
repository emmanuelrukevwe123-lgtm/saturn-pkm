import { newId, sameId } from "./domain.js";

/* Planner rules, as pure functions over the notebook state. */

export const TASK_STATUSES = ["todo", "doing", "done"];

function bumped(record, now, deviceId) {
  return { ...record, updated: now, baseRevision: record.revision || 0, revision: (record.revision || 0) + 1, deviceId };
}

export function liveProjects(state) {
  return state.projects.filter((project) => !project.tombstone);
}

export function tasksFor(state, projectId, status) {
  return state.tasks
    .filter((task) => !task.tombstone && sameId(task.projectId, projectId) && task.status === status)
    .sort((a, b) => a.order - b.order);
}

export function createProject(state, name, { now = new Date().toISOString(), deviceId } = {}) {
  const project = { id: newId(), name, created: now, updated: now, revision: 0, baseRevision: 0, deviceId };
  return { state: { ...state, projects: [...state.projects, project] }, project };
}

export function renameProject(state, id, name, { now = new Date().toISOString(), deviceId } = {}) {
  return {
    ...state,
    projects: state.projects.map((project) => (sameId(project.id, id) ? bumped({ ...project, name }, now, deviceId) : project)),
  };
}

export function deleteProject(state, id, { now = new Date().toISOString(), deviceId } = {}) {
  const tombstoned = (record) => ({ ...bumped(record, now, deviceId), tombstone: true, deletedAt: now });
  return {
    ...state,
    projects: state.projects.map((project) => (sameId(project.id, id) ? tombstoned(project) : project)),
    tasks: state.tasks.map((task) => (sameId(task.projectId, id) ? tombstoned(task) : task)),
  };
}

export function createTask(state, projectId, status, title, { now = new Date().toISOString(), deviceId } = {}) {
  const task = {
    id: newId(), projectId, title, status, due: "", priority: "med", tags: [], notes: "",
    order: tasksFor(state, projectId, status).length,
    created: now, updated: now, revision: 0, baseRevision: 0, deviceId,
  };
  return { ...state, tasks: [...state.tasks, task] };
}

export function updateTask(state, id, patch, { now = new Date().toISOString(), deviceId } = {}) {
  return {
    ...state,
    tasks: state.tasks.map((task) => (sameId(task.id, id) ? bumped({ ...task, ...patch }, now, deviceId) : task)),
  };
}

export function deleteTask(state, id, { now = new Date().toISOString(), deviceId } = {}) {
  return {
    ...state,
    tasks: state.tasks.map((task) => (sameId(task.id, id)
      ? { ...bumped(task, now, deviceId), tombstone: true, deletedAt: now, thisWeek: false } : task)),
  };
}

// Files the task at `index` in its new column and renumbers both columns.
export function moveTask(state, id, status, index, { now = new Date().toISOString(), deviceId } = {}) {
  const task = state.tasks.find((item) => !item.tombstone && sameId(item.id, id));
  if (!task) return { error: "not_found" };
  const target = tasksFor(state, task.projectId, status).filter((item) => !sameId(item.id, id));
  target.splice(Math.max(0, Math.min(index, target.length)), 0, task);
  const orders = new Map(target.map((item, position) => [String(item.id), position]));
  if (task.status !== status) {
    tasksFor(state, task.projectId, task.status)
      .filter((item) => !sameId(item.id, id))
      .forEach((item, position) => orders.set(String(item.id), position));
  }
  return {
    ...state,
    tasks: state.tasks.map((item) => {
      if (sameId(item.id, id)) return bumped({ ...item, status, order: orders.get(String(id)) }, now, deviceId);
      const order = orders.get(String(item.id));
      return order == null || order === item.order ? item : { ...item, order };
    }),
  };
}
