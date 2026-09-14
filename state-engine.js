/**
 * Formal Execution State — WAM 1.2
 *
 * Implementa el lifecycle formal de la tarea.
 */
export const STATE = {
  INITIALIZING: "INITIALIZING",
  INVESTIGATING: "INVESTIGATING",
  EXECUTING: "EXECUTING",
  VERIFYING: "VERIFYING",
  COMPLETED: "COMPLETED",
  BLOCKED: "BLOCKED",
  WAITING_AUTHORIZATION: "WAITING_AUTHORIZATION",
  FAILED: "FAILED",
};

export function getPhaseLabel(phase) {
  return phase || STATE.INITIALIZING;
}
