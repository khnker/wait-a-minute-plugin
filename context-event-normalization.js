import { CONTEXT_EVENT_TYPES } from "./context-event-ingress.js";

export function normalizeContextItem(event) {
  const type = event.type || "";
  const payload = event.payload || {};

  return {
    id: event.id || `evt-${event.timestamp || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    eventType: type,
    taskId: event.taskId,
    sessionId: event.sessionId || null,
    executionId: event.executionId || null,
    timestamp: event.timestamp || Date.now(),
    content: normalizeContentByType(type, payload),
    source: event.provenance || null,
    lifecycle: inferLifecycle(type, payload),
    classification: inferClassification(type, payload),
    scope: inferScope(type, payload),
    importance: inferImportance(type, payload),

    requirementId: extractSingleId(payload.requirementId, payload.requirements),
    hypothesisId: extractSingleId(payload.hypothesisId, payload.hypotheses),
    experimentId: extractSingleId(payload.experimentId, payload.experiments),
    observationId: extractObservationId(payload),
    evidenceId: extractEvidenceId(payload),

    requirementIds: extractRequirementIds(payload),
    hypothesisIds: extractHypothesisIds(payload),
    experimentIds: extractExperimentIds(payload),

    mandatoryIncluded: inferMandatoryIncluded(type),
    unresolvedCriticalUnknowns: inferUnresolvedCriticalUnknowns(type, payload),
  };
}

function extractSingleId(single, array) {
  if (single) return single;
  if (Array.isArray(array) && array.length > 0) return array[0];
  return null;
}

function extractObservationId(payload) {
  if (payload?.observationId) return payload.observationId;
  if (payload?.observation && payload?.observation?.id) return payload.observation.id;
  // In some events, observation might be in the content after normalization, but we keep it simple.
  return null;
}

function extractEvidenceId(payload) {
  if (payload?.evidenceId) return payload.evidenceId;
  if (payload?.evidence && payload?.evidence?.id) return payload.evidence.id;
  return null;
}

function normalizeContentByType(eventType, payload) {
  const op = eventType.toLowerCase();

  if (op.includes("tool_started") || op.includes("tool_finished")) {
    return {
      tool: payload.tool || null,
      args: payload.args || null,
      result: payload.result || null,
      error: payload.error || null,
    };
  }

  if (op.includes("observation_recorded") || op.includes("assessment_completed")) {
    return {
      experimentId: payload.experimentId || null,
      status: payload.status || null,
      outcome: payload.outcome || null,
      evidence: payload.evidence || null,
      assessment: payload.assessment || null,
    };
  }

  if (op.includes("requirement_created") || op.includes("requirement_updated")) {
    return {
      requirementId: payload.requirementId || null,
      title: payload.title || null,
      status: payload.status || null,
      verified: payload.verified || null,
    };
  }

  if (op.includes("hypothesis_proposed") || op.includes("hypothesis_assessed")) {
    return {
      hypothesisId: payload.hypothesisId || null,
      statement: payload.statement || null,
      status: payload.status || null,
      confidence: payload.confidence || null,
    };
  }

  if (op.includes("evidence_created")) {
    return {
      evidenceId: payload.evidenceId || null,
      type: payload.type || null,
      content: payload.content || null,
      linkedTo: payload.linkedTo || null,
    };
  }

  if (op.includes("verification_completed")) {
    return {
      requirementId: payload.requirementId || null,
      verified: payload.verified || null,
      level: payload.level || null,
    };
  }

  if (op.includes("context_invalidated")) {
    return {
      reason: payload.reason || null,
      invalidatedIds: payload.invalidatedIds || null,
      scope: payload.scope || null,
    };
  }

  if (op.includes("file_changed")) {
    return {
      path: payload.path || null,
      changeType: payload.changeType || null,
    };
  }

  if (op.includes("decision_recorded")) {
    return {
      decisionId: payload.decisionId || null,
      content: payload.content || null,
      basis: payload.basis || null,
    };
  }

  return { raw: JSON.stringify(payload) };
}

function inferLifecycle(eventType) {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("created")) return "CREATED";
  if (normalized.includes("updated")) return "UPDATED";
  if (normalized.includes("started")) return "STARTED";
  if (normalized.includes("finished")) return "FINISHED";
  if (normalized.includes("completed")) return "COMPLETED";
  if (normalized.includes("invalidated")) return "INVALIDATED";
  if (normalized.includes("archived")) return "ARCHIVED";
  return "ACTIVE";
}

function inferClassification(eventType) {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("decision")) return "DECISION";
  if (normalized.includes("assessment")) return "ASSESSMENT";
  if (normalized.includes("verified")) return "VERIFIED";
  if (normalized.includes("invalidate")) return "INVALIDATION";
  if (normalized.includes("recovery")) return "RECOVERY";
  if (normalized.includes("tool")) return "ACTION";
  if (normalized.includes("hypothesis")) return "HYPOTHESIS";
  if (normalized.includes("requirement")) return "REQUIREMENT";
  if (normalized.includes("context")) return "CONTEXT";
  return "UNCLASSIFIED";
}

function inferScope(eventType) {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("session")) return "SESSION";
  if (normalized.includes("task")) return "TASK";
  if (normalized.includes("task")) return "TASK";
  if (normalized.includes("project")) return "PROJECT";
  if (normalized.includes("global")) return "GLOBAL";
  return "LOCAL";
}

function inferImportance(eventType) {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("decision") || normalized.includes("critical")) return "HIGH";
  if (normalized.includes("verification") || normalized.includes("completed")) return "MEDIUM";
  if (normalized.includes("tool") || normalized.includes("action")) return "MEDIUM";
  if (normalized.includes("hypothesis") || normalized.includes("hypo")) return "LOW";
  if (normalized.includes("requirement")) return "LOW";
  return "LOW";
}

function extractRequirementIds(payload) {
  const ids = [];
  if (payload?.requirementId) ids.push(payload.requirementId);
  if (payload?.requirements && Array.isArray(payload.requirements)) {
    payload.requirements.forEach((r) => { if (r && r.id) ids.push(r.id); });
  }
  return ids;
}

function extractHypothesisIds(payload) {
  const ids = [];
  if (payload?.hypothesisId) ids.push(payload.hypothesisId);
  if (payload?.hypotheses && Array.isArray(payload.hypotheses)) {
    payload.hypotheses.forEach((h) => { if (h && h.id) ids.push(h.id); });
  }
  return ids;
}

function extractExperimentIds(payload) {
  const ids = [];
  if (payload?.experimentId) ids.push(payload.experimentId);
  if (payload?.experiments && Array.isArray(payload.experiments)) {
    payload.experiments.forEach((e) => { if (e && e.id) ids.push(e.id); });
  }
  return ids;
}

function inferMandatoryIncluded(eventType) {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("verification") || normalized.includes("decision") || normalized.includes("assessment")) return true;
  return false;
}

function inferUnresolvedCriticalUnknowns(eventType, payload) {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("invalidate") || normalized.includes("context")) {
    if (payload?.unresolvedCriticalUnknowns) return payload.unresolvedCriticalUnknowns;
    return [];
  }
  return [];
}