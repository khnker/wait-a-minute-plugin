export const CONTEXT_EVENT_TYPES = Object.freeze({
  TASK_CREATED: "TASK_CREATED",
  TASK_UPDATED: "TASK_UPDATED",
  REQUIREMENT_CREATED: "REQUIREMENT_CREATED",
  REQUIREMENT_UPDATED: "REQUIREMENT_UPDATED",
  HYPOTHESIS_PROPOSED: "HYPOTHESIS_PROPOSED",
  HYPOTHESIS_ASSESSED: "HYPOTHESIS_ASSESSED",
  EXPERIMENT_STARTED: "EXPERIMENT_STARTED",
  EXPERIMENT_COMPLETED: "EXPERIMENT_COMPLETED",
  TOOL_STARTED: "TOOL_STARTED",
  TOOL_FINISHED: "TOOL_FINISHED",
  OBSERVATION_RECORDED: "OBSERVATION_RECORDED",
  ASSESSMENT_COMPLETED: "ASSESSMENT_COMPLETED",
  EVIDENCE_CREATED: "EVIDENCE_CREATED",
  VERIFICATION_COMPLETED: "VERIFICATION_COMPLETED",
  FILE_CHANGED: "FILE_CHANGED",
  DECISION_RECORDED: "DECISION_RECORDED",
  CONTEXT_INVALIDATED: "CONTEXT_INVALIDATED",
});

const VALID_CONTEXT_EVENT_TYPES = new Set(Object.values(CONTEXT_EVENT_TYPES));

let _contextEventBus = [];

export function resetContextEventBus() {
  _contextEventBus = [];
}

export function ingestContextEvent(event) {
  if (!event || typeof event !== "object") {
    throw new Error("ingestContextEvent requires an event object");
  }
  if (!event.type || !VALID_CONTEXT_EVENT_TYPES.has(event.type)) {
    throw new Error(`Invalid event type: ${event.type}`);
  }
  if (!event.taskId) {
    throw new Error("event.taskId is required");
  }
  if (!event.timestamp) {
    event.timestamp = Date.now();
  }
  const enriched = {
    id: `evt-${event.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: event.sessionId || null,
    executionId: event.executionId || null,
    payload: event.payload || null,
    provenance: event.provenance || null,
    ...event,
  };
  _contextEventBus.push(enriched);
  return enriched;
}

export function getContextEvents(filter = {}) {
  return _contextEventBus.filter((event) => {
    if (filter.taskId && event.taskId !== filter.taskId) return false;
    if (filter.type && event.type !== filter.type) return false;
    if (filter.since && event.timestamp < filter.since) return false;
    if (filter.until && event.timestamp > filter.until) return false;
    return true;
  });
}

export function getLastContextEvent(taskId, type) {
  const events = getContextEvents({ taskId, type });
  return events.length > 0 ? events[events.length - 1] : null;
}

export function emitToolStarted({ taskId, callID, tool, args, sessionId }) {
  return ingestContextEvent({
    type: CONTEXT_EVENT_TYPES.TOOL_STARTED,
    taskId,
    sessionId,
    executionId: callID,
    payload: { tool, args },
  });
}

export function emitToolFinished({ taskId, callID, tool, result, sessionId }) {
  return ingestContextEvent({
    type: CONTEXT_EVENT_TYPES.TOOL_FINISHED,
    taskId,
    sessionId,
    executionId: callID,
    payload: { tool, result },
  });
}

export function emitObservation({ taskId, experimentId, assessment, executionId }) {
  return ingestContextEvent({
    type: CONTEXT_EVENT_TYPES.OBSERVATION_RECORDED,
    taskId,
    executionId,
    payload: { experimentId, assessment },
  });
}

export function getContextEventBus() {
  return _contextEventBus.slice();
}
