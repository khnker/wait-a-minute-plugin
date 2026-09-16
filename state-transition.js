/**
 * State Transition — Unified transition layer for all WAM lifecycles.
 * 
 * Guarantees: All state transitions follow (OldState + Event) → NewState pattern.
 * No scattered state mutation across modules.
 */

import { PHASE_TRANSITIONS } from "../orchestration.js";

/**
 * Transition Task state based on event
 */
export function transitionTask(state, event) {
  const { type, payload } = event;
  
  switch (type) {
    case "REQUIREMENT_VERIFIED":
      return {
        ...state,
        requirements: state.requirements.map(r => 
          r.id === payload.requirementId ? { ...r, status: "verified" } : r
        ),
        updatedAt: Date.now()
      };
      
    case "PHASE_CHANGE":
      const allowed = PHASE_TRANSITIONS[state.phase] || [];
      if (!allowed.includes(payload.phase)) {
        throw new Error(`Invalid phase transition: ${state.phase} → ${payload.phase}`);
      }
      return { ...state, phase: payload.phase, updatedAt: Date.now() };
      
    case "CONTRACT_APPROVED":
      return { ...state, contract: { ...state.contract, status: "APPROVED" }, updatedAt: Date.now() };
      
    case "NEXT_ACTION":
      return { ...state, nextAction: payload.action, updatedAt: Date.now() };
      
    default:
      return state;
  }
}

/**
 * Transition Verification state
 */
export function transitionVerification(state, event) {
  const { type, payload } = event;
  
  switch (type) {
    case "VERIFY_START":
      return { ...state, verificationStatus: "VERIFYING", updatedAt: Date.now() };
    case "VERIFY_PASS":
      return { ...state, verificationStatus: "VERIFIED", updatedAt: Date.now() };
    case "VERIFY_FAIL":
      return { ...state, verificationStatus: "FAILED", updatedAt: Date.now() };
    case "INVALIDATE":
      return { ...state, verificationStatus: "INVALIDATED", updatedAt: Date.now() };
    default:
      return state;
  }
}

/**
 * Transition Cognition (Hypothesis) state
 */
export function transitionHypothesis(state, event) {
  const { type, payload } = event;
  
  switch (type) {
    case "HYPOTHESIS_PROPOSED":
      return { ...state, hypotheses: [...(state.hypotheses || []), payload.hypothesis] };
    case "HYPOTHESIS_SUPPORTED":
      return { ...state, hypotheses: state.hypotheses.map(h => 
        h.id === payload.hypothesisId ? { ...h, status: "SUPPORTED" } : h
      )};
    case "HYPOTHESIS_REJECTED":
      return { ...state, hypotheses: state.hypotheses.map(h => 
        h.id === payload.hypothesisId ? { ...h, status: "REJECTED" } : h
      )};
    default:
      return state;
  }
}
