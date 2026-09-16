/**
 * Decision Types — Standardized outcomes for WAM orchestration.
 * 
 * Every decision returns a consistent structure:
 * {
 *   action: string, // 'CONTINUE', 'BLOCK', 'REPLAN', 'VERIFY'
 *   reason: string,
 *   stateChange: object | null, // Optional state delta
 *   evidenceNeeded: boolean,
 *   critical: boolean
 * }
 */

export function createDecision(action, reason, { stateChange = null, evidenceNeeded = false, critical = false } = {}) {
  return { action, reason, stateChange, evidenceNeeded, critical };
}

export const ACTIONS = {
  CONTINUE: "CONTINUE",
  BLOCK: "BLOCK",
  REPLAN: "REPLAN",
  VERIFY: "VERIFY",
  DONE: "DONE"
};
