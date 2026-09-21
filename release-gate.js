/**
 * Release Gate
 *
 * Aggregates the guarantees from all prior phases into a single green/red
 * signal before any production rollout. Seven sub-gates:
 *
 *   1. assessmentContract    — every task has a valid, non-stale assessment
 *   2. completionIntegrity   — every task has a VERIFIED completion report
 *   3. executionDecoupling   — no unpredicted file changes; no out-of-scope
 *   4. durableState          — durable state is consistent and recoverable
 *   5. contextProduction     — canonical context artifacts are fresh/valid
 *   6. runtimeHardening      — no unresolved BLOCKED/ESCALATE events
 *   7. observability         — release manifest exposes required fields
 *
 * API:
 *   evaluateRelease({ tasks, manifest, hardeningLog, durableState, context })
 *     -> {
 *        allowed: boolean,
 *        reason: string,
 *        gates: Array<{ id, allowed, reason, blockers }>,
 *        summary: { total, passed, failed }
 *      }
 *
 *   gateSubGate(name, payload) -> { allowed, reason, blockers }
 */

export const SUB_GATES = [
  "assessmentContract",
  "completionIntegrity",
  "executionDecoupling",
  "durableState",
  "contextProduction",
  "runtimeHardening",
  "observability",
];

/* ---------- helpers ---------- */

function safe(fn, fallback) {
  try {
    const r = fn();
    return Array.isArray(r) ? r : r === undefined ? fallback : r;
  } catch {
    return fallback;
  }
}

function hasField(obj, field) {
  return obj && typeof obj === "object" && field in obj && obj[field] !== undefined;
}

/* ---------- gate: assessmentContract ---------- */

function gateAssessmentContract(tasks) {
  const blockers = [];
  if (!Array.isArray(tasks)) {
    return { allowed: false, reason: "tasks array missing", blockers: [] };
  }
  for (const t of tasks) {
    if (!t || typeof t !== "object") {
      blockers.push({ taskId: null, reason: "non-object task entry" });
      continue;
    }
    if (!hasField(t, "assessment") || !t.assessment) {
      blockers.push({ taskId: t.id ?? null, reason: "missing assessment" });
      continue;
    }
    const a = t.assessment;
    if (a.stale === true) {
      blockers.push({ taskId: t.id ?? null, reason: "assessment marked stale" });
    }
    if (typeof a.valid === "boolean" && a.valid === false) {
      blockers.push({ taskId: t.id ?? null, reason: "assessment explicitly invalid" });
    }
    if (!hasField(a, "objective") || !a.objective) {
      blockers.push({ taskId: t.id ?? null, reason: "assessment missing objective" });
    }
  }
  return {
    allowed: blockers.length === 0,
    reason: blockers.length === 0 ? "all assessments valid" : "assessment defects",
    blockers,
  };
}

/* ---------- gate: completionIntegrity ---------- */

function gateCompletionIntegrity(tasks) {
  const blockers = [];
  if (!Array.isArray(tasks)) {
    return { allowed: false, reason: "tasks array missing", blockers: [] };
  }
  for (const t of tasks) {
    if (!t || typeof t !== "object") {
      blockers.push({ taskId: null, reason: "non-object task entry" });
      continue;
    }
    const c = t.completion;
    if (!c) {
      blockers.push({ taskId: t.id ?? null, reason: "missing completion report" });
      continue;
    }
    if (c.status !== "VERIFIED") {
      blockers.push({
        taskId: t.id ?? null,
        reason: `completion status=${c.status ?? "undefined"} (expected VERIFIED)`,
      });
    }
  }
  return {
    allowed: blockers.length === 0,
    reason: blockers.length === 0 ? "all completions VERIFIED" : "completion defects",
    blockers,
  };
}

/* ---------- gate: executionDecoupling ---------- */

function gateExecutionDecoupling(tasks) {
  const blockers = [];
  if (!Array.isArray(tasks)) {
    return { allowed: false, reason: "tasks array missing", blockers: [] };
  }
  for (const t of tasks) {
    if (!t || typeof t !== "object") continue;
    const predicted = Array.isArray(t.predictedFiles) ? t.predictedFiles : [];
    const actual = Array.isArray(t.actualFiles) ? t.actualFiles : [];
    const outOfScope = actual.filter((f) => !predicted.includes(f));
    for (const f of outOfScope) {
      blockers.push({
        taskId: t.id ?? null,
        reason: `out-of-scope mutation: ${f}`,
      });
    }
    if (Array.isArray(t.scope) && t.scope.length > 0 && Array.isArray(t.violations)) {
      for (const v of t.violations) {
        blockers.push({ taskId: t.id ?? null, reason: v });
      }
    }
  }
  return {
    allowed: blockers.length === 0,
    reason: blockers.length === 0 ? "no out-of-scope mutations" : "scope drift detected",
    blockers,
  };
}

/* ---------- gate: durableState ---------- */

function gateDurableState(durableState) {
  const blockers = [];
  if (!durableState || typeof durableState !== "object") {
    return {
      allowed: false,
      reason: "durable state payload missing",
      blockers: [{ reason: "no durable state provided" }],
    };
  }
  if (durableState.corrupted === true) {
    blockers.push({ reason: "durable state flagged corrupted" });
  }
  if (typeof durableState.recoverable === "boolean" && durableState.recoverable === false) {
    blockers.push({ reason: "durable state not recoverable" });
  }
  if (!Array.isArray(durableState.snapshots) || durableState.snapshots.length === 0) {
    blockers.push({ reason: "no pre-release snapshot available for rollback" });
  }
  return {
    allowed: blockers.length === 0,
    reason: blockers.length === 0 ? "durable state consistent" : "durable state defects",
    blockers,
  };
}

/* ---------- gate: contextProduction ---------- */

function gateContextProduction(context) {
  const blockers = [];
  if (!context || typeof context !== "object") {
    return {
      allowed: false,
      reason: "context payload missing",
      blockers: [{ reason: "no canonical context provided" }],
    };
  }
  const artifacts = Array.isArray(context.artifacts) ? context.artifacts : [];
  if (artifacts.length === 0) {
    blockers.push({ reason: "no canonical context artifacts" });
  }
  for (const a of artifacts) {
    if (!a || typeof a !== "object") {
      blockers.push({ reason: "non-object artifact entry" });
      continue;
    }
    if (a.stale === true) {
      blockers.push({ artifactId: a.id ?? null, reason: `artifact ${a.id ?? "?"} stale` });
    }
    if (typeof a.valid === "boolean" && a.valid === false) {
      blockers.push({ artifactId: a.id ?? null, reason: `artifact ${a.id ?? "?"} invalid` });
    }
    if (!hasField(a, "producedAt")) {
      blockers.push({ artifactId: a.id ?? null, reason: "artifact missing producedAt" });
    }
  }
  return {
    allowed: blockers.length === 0,
    reason: blockers.length === 0 ? "context fresh" : "context defects",
    blockers,
  };
}

/* ---------- gate: runtimeHardening ---------- */

function gateRuntimeHardening(hardeningLog) {
  const blockers = [];
  const events = Array.isArray(hardeningLog?.events) ? hardeningLog.events : [];
  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    if (e.status === "BLOCKED" || e.status === "ESCALATE") {
      if (e.resolved !== true) {
        blockers.push({
          eventId: e.id ?? null,
          reason: `unresolved hardening event status=${e.status}`,
        });
      }
    }
  }
  return {
    allowed: blockers.length === 0,
    reason: blockers.length === 0 ? "no unresolved hardening events" : "hardening events open",
    blockers,
  };
}

/* ---------- gate: observability ---------- */

const REQUIRED_MANIFEST_FIELDS = [
  "releaseId",
  "changeSetId",
  "version",
  "producedAt",
  "signers",
  "gateResults",
];

function gateObservability(manifest) {
  const blockers = [];
  if (!manifest || typeof manifest !== "object") {
    return {
      allowed: false,
      reason: "manifest missing",
      blockers: [{ reason: "no release manifest" }],
    };
  }
  for (const f of REQUIRED_MANIFEST_FIELDS) {
    if (!hasField(manifest, f)) {
      blockers.push({ field: f, reason: `manifest missing field ${f}` });
    }
  }
  if (manifest.signers !== undefined && !Array.isArray(manifest.signers)) {
    blockers.push({ reason: "manifest.signers must be an array when provided" });
  }
  if (manifest.gateResults !== undefined && !Array.isArray(manifest.gateResults)) {
    blockers.push({ reason: "manifest.gateResults must be an array when provided" });
  }
  return {
    allowed: blockers.length === 0,
    reason: blockers.length === 0 ? "manifest schema valid" : "manifest schema invalid",
    blockers,
  };
}

/* ---------- dispatcher ---------- */

const GATE_FNS = {
  assessmentContract: gateAssessmentContract,
  completionIntegrity: gateCompletionIntegrity,
  executionDecoupling: gateExecutionDecoupling,
  durableState: gateDurableState,
  contextProduction: gateContextProduction,
  runtimeHardening: gateRuntimeHardening,
  observability: gateObservability,
};

/**
 * Evaluate a single named sub-gate.
 * Accepts a payload tailored to that gate. See source for expected shapes.
 */
export function evaluateSubGate(name, payload) {
  const fn = GATE_FNS[name];
  if (!fn) {
    return { allowed: false, reason: `unknown sub-gate: ${name}`, blockers: [] };
  }
  return safe(() => fn(payload), { allowed: false, reason: "gate error", blockers: [] });
}

/**
 * Evaluate the full release gate. `payload` is an object with named fields,
 * each forwarded to its sub-gate. Missing fields default to permissive
 * (allowed) so partial evaluations remain testable.
 */
export function evaluateRelease(payload = {}) {
  const gates = [];
  for (const name of SUB_GATES) {
    const result = evaluateSubGate(name, payload[mapGateToPayload(name)]);
    gates.push({ id: name, ...result });
  }
  const passed = gates.filter((g) => g.allowed).length;
  const failed = gates.length - passed;
  const allowed = failed === 0;
  return {
    allowed,
    reason: allowed ? "all sub-gates passed" : `${failed} sub-gate(s) failed`,
    gates,
    summary: { total: gates.length, passed, failed },
  };
}

function mapGateToPayload(name) {
  switch (name) {
    case "assessmentContract":
    case "completionIntegrity":
    case "executionDecoupling":
      return "tasks";
    case "durableState":
      return "durableState";
    case "contextProduction":
      return "context";
    case "runtimeHardening":
      return "hardeningLog";
    case "observability":
      return "manifest";
    default:
      return name;
  }
}