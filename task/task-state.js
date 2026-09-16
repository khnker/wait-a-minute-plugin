/**
 * Task State — Create, normalize, and validate task state.
 */

import { PHASE_PROPOSED } from "../orchestration.js";

export function createState(taskId) {
  return {
    taskId,
    phase: PHASE_PROPOSED,
    contract: { status: "DRAFT", requirements: [] },
    requirements: [],
    nextAction: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function normalizeState(state) {
  if (!state) return createState("unknown");
  
  return {
    ...state,
    phase: state.phase || PHASE_PROPOSED,
    contract: state.contract || { status: "DRAFT", requirements: [] },
    requirements: state.requirements || [],
    nextAction: state.nextAction || null,
    createdAt: state.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

export function validateState(state) {
  if (!state || !state.taskId) {
    return { valid: false, error: "Missing taskId" };
  }
  if (!state.phase) {
    return { valid: false, error: "Missing phase" };
  }
  return { valid: true };
}
