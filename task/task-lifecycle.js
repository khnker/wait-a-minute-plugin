/**
 * Task Lifecycle — Task state transitions (Create, Resume, Switch, Pause, Complete, Block).
 */

import { createState, normalizeState, validateState } from "./task-state.js";
import { loadTask, saveTask, taskExists, deleteTask } from "./task-store.js";

export function create(taskId, root) {
  if (taskExists(taskId, root)) {
    throw new Error(`Task ${taskId} already exists`);
  }
  const state = createState(taskId);
  saveTask(taskId, state, root);
  return state;
}

export function resume(taskId, root) {
  const state = loadTask(taskId, root);
  if (!state) {
    throw new Error(`Task ${taskId} not found`);
  }
  return normalizeState(state);
}

export function switchTo(taskId, newPhase, root) {
  const state = loadTask(taskId, root);
  if (!state) throw new Error(`Task ${taskId} not found`);
  
  state.phase = newPhase;
  state.updatedAt = Date.now();
  saveTask(taskId, state, root);
  return state;
}

export function pause(taskId, root) {
  return switchTo(taskId, "WAITING", root);
}

export function complete(taskId, root) {
  return switchTo(taskId, "DONE", root);
}

export function block(taskId, reason, root) {
  const state = loadTask(taskId, root);
  if (!state) throw new Error(`Task ${taskId} not found`);
  
  state.blocked = reason;
  state.updatedAt = Date.now();
  saveTask(taskId, state, root);
  return state;
}

export { createState, normalizeState, validateState };
