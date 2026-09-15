export const WAM_EVENTS = {
  CONTEXT_LOADED: "CONTEXT_LOADED",
  CONTEXT_INVALIDATED: "CONTEXT_INVALIDATED",
  CLAIM_CREATED: "CLAIM_CREATED",
  REQUIREMENT_CREATED: "REQUIREMENT_CREATED",
  ACTION_STARTED: "ACTION_STARTED",
  ACTION_COMPLETED: "ACTION_COMPLETED",
  OBSERVATION_CREATED: "OBSERVATION_CREATED",
  EVIDENCE_ADDED: "EVIDENCE_ADDED",
  EVIDENCE_CONFLICT: "EVIDENCE_CONFLICT",
  VERIFICATION_STARTED: "VERIFICATION_STARTED",
  VERIFICATION_COMPLETED: "VERIFICATION_COMPLETED",
  COMPLETION_BLOCKED: "COMPLETION_BLOCKED",
  TASK_COMPLETED: "TASK_COMPLETED",
};

export function createEvent(type, data = {}) {
  return {
    id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    data,
    timestamp: Date.now(),
  };
}

export function logEvent(type, data, eventLog = []) {
  const event = createEvent(type, data);
  eventLog.push(event);
  return event;
}

export function createDecisionTrace(decision) {
  return {
    id: `trace-${Date.now().toString(36)}`,
    decision,
    chain: [],
    timestamp: Date.now(),
  };
}

export function addToTrace(trace, step) {
  return {
    ...trace,
    chain: [...trace.chain, { ...step, timestamp: Date.now() }],
  };
}

export function formatDecisionTrace(trace) {
  return trace.chain
    .map((step, idx) => `${idx + 1}. [${step.type}] ${step.description}`)
    .join("\n");
}
