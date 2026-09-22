/**
 * Runtime Context Graph — canonical assembler for all runtime state layers.
 *
 * Unifies taskState, runState, evidenceLineage, cognitionState, decisions,
 * constraints, artifacts, observations, hypotheses, and experiments into a
 * single ContextGraph. Replaces the shallow buildGraphFromTaskState() that
 * only saw (task, requirements, evidence) with a layer-aware builder that
 * creates nodes/edges for every state slice present in the runtime.
 *
 * Pattern follows context-graph-builder.js but expands coverage to:
 *   - task, requirements
 *   - evidence (lineage)
 *   - decisions, constraints
 *   - artifacts
 *   - observations
 *   - hypotheses, experiments (only when supplied)
 *
 * Edges are added only when both endpoints exist.
 */

import { ContextGraph } from "./context-graph.js";
import { buildContextGraph } from "./context-graph-builder.js";

/**
 * @typedef {Object} BuildRuntimeContextGraphInput
 * @property {Object} [taskState]
 * @property {Object} [runState]
 * @property {Array}  [evidenceLineage]
 * @property {Object} [cognitionState]
 * @property {Array}  [decisions]
 * @property {Array}  [constraints]
 * @property {Array}  [artifacts]
 * @property {Array}  [observations]
 * @property {Array}  [hypotheses]
 * @property {Array}  [experiments]
 */

/**
 * Build a canonical ContextGraph from all runtime state layers.
 *
 * @param {BuildRuntimeContextGraphInput} input
 * @returns {ContextGraph}
 */
export function buildRuntimeContextGraph(input = {}) {
  const {
    taskState = {},
    runState = {},
    evidenceLineage = [],
    cognitionState = {},
    decisions = [],
    constraints = [],
    artifacts = [],
    observations = [],
    hypotheses = [],
    experiments = [],
  } = input;

  // Canonical primary source: delegate base graph (task + requirements +
  // evidence) to context-graph-builder.js so node/edge schema and IDs
  // stay canonical. The remaining state layers (cognition, decisions,
  // constraints, artifacts, observations, hypotheses, experiments) are
  // added below on top of the canonical base.
  const g = buildContextGraph(taskState, runState, evidenceLineage);
  const taskId = taskState?.taskId || null;

  // -- Requirement shadow output nodes (router compatibility) --
  //     The canonical requirement node + the task→requirement edge are
  //     already produced by buildContextGraph() above. We only need the
  //     shadow "output" node per requirement so Context Router's Phase 3
  //     collection can resolve output-type ids.
  const requirementIds = new Set();
  for (const req of taskState?.requirements || []) {
    if (!req?.id) continue;
    requirementIds.add(req.id);
    const outputId = `${req.id}::output`;
    g.addNode({
      id: outputId,
      type: "output",
      content: req.title || req.description || "",
      metadata: {
        provenance: "user_decided",
        shadowOf: req.id,
      },
    });
    if (taskId) {
      g.addEdge({ from: taskId, to: outputId, type: "depends_on_artifact" });
    }
  }

  // -- Evidence lineage (evidence supports requirement when linked) --
  for (const ev of evidenceLineage || []) {
    if (!ev?.id) continue;
    g.addNode({
      id: ev.id,
      type: "evidence",
      content: ev.content || ev.summary || "",
      verified: ev.status === "valid" || ev.verified === true,
      metadata: {
        provenance: "run_execution",
        source: ev.source || null,
        capturedAt: ev.capturedAt || null,
      },
    });
    if (ev.requirementId && requirementIds.has(ev.requirementId)) {
      g.addEdge({ from: ev.id, to: ev.requirementId, type: "supports" });
    } else if (taskId) {
      g.addEdge({ from: ev.id, to: taskId, type: "supports" });
    }
  }

  // -- Decisions (decision influences requirement/task) --
  for (const dec of decisions || []) {
    if (!dec?.id) continue;
    g.addNode({
      id: dec.id,
      type: "decision",
      content: dec.summary || dec.description || dec.content || "",
      metadata: {
        provenance: dec.provenance || "user_decided",
        madeAt: dec.madeAt || null,
        status: dec.status || "accepted",
      },
    });
    if (dec.requirementId && requirementIds.has(dec.requirementId)) {
      g.addEdge({ from: dec.id, to: dec.requirementId, type: "supports" });
    } else if (taskId) {
      g.addEdge({ from: dec.id, to: taskId, type: "supports" });
    }
  }

  // -- Constraints (constraint constrains task) --
  for (const c of constraints || []) {
    if (!c?.id) continue;
    g.addNode({
      id: c.id,
      type: "constraint",
      content: c.description || c.content || c.summary || "",
      metadata: {
        provenance: c.provenance || "user_decided",
        severity: c.severity || "normal",
      },
    });
    const target = c.requirementId || taskId;
    if (target) {
      g.addEdge({ from: target, to: c.id, type: "depends_on_artifact" });
    }
  }

  // -- Artifacts (task produces artifact) --
  for (const a of artifacts || []) {
    if (!a?.id) continue;
    g.addNode({
      id: a.id,
      type: "artifact",
      content: a.content || a.path || a.summary || "",
      metadata: {
        provenance: a.provenance || "run_execution",
        path: a.path || null,
        kind: a.kind || "generic",
      },
    });
    // taskId is the canonical producer; fall back to requirement only
    // when no task is in scope.
    const producer = taskId || a.taskId || a.requirementId;
    if (producer) {
      g.addEdge({ from: producer, to: a.id, type: "produces" });
    }
    if (a.requirementId && requirementIds.has(a.requirementId)) {
      g.addEdge({ from: a.id, to: a.requirementId, type: "supports" });
    }
  }

  // -- Observations (observation relates to task) --
  for (const o of observations || []) {
    if (!o?.id) continue;
    g.addNode({
      id: o.id,
      type: "observation",
      content: o.content || o.summary || "",
      metadata: {
        provenance: o.provenance || "run_execution",
        observedAt: o.observedAt || null,
      },
    });
    const target = o.requirementId || o.taskId || taskId;
    if (target) {
      g.addEdge({ from: o.id, to: target, type: "related_to" });
    }
  }

  // -- Hypotheses (only when present) --
  for (const h of hypotheses || []) {
    if (!h?.id) continue;
    g.addNode({
      id: h.id,
      type: "claim",
      content: h.statement || h.content || "",
      metadata: {
        provenance: h.provenance || "user_decided",
        confidence: h.confidence ?? null,
        kind: "hypothesis",
      },
    });
    const target = h.requirementId || h.taskId || taskId;
    if (target) {
      g.addEdge({ from: h.id, to: target, type: "related_to" });
    }
  }

  // -- Experiments (only when present) --
  for (const x of experiments || []) {
    if (!x?.id) continue;
    g.addNode({
      id: x.id,
      type: "action",
      content: x.description || x.content || "",
      metadata: {
        provenance: x.provenance || "run_execution",
        status: x.status || "planned",
        kind: "experiment",
      },
    });
    if (x.hypothesisId && g.hasNode(x.hypothesisId)) {
      g.addEdge({ from: x.id, to: x.hypothesisId, type: "supports" });
    }
    const target = x.requirementId || taskId;
    if (target) {
      g.addEdge({ from: x.id, to: target, type: "produces" });
    }
  }

  // -- Cognition summary node (single node when cognitionState present) --
  if (cognitionState && Object.keys(cognitionState).length > 0) {
    const cogId = cognitionState.id || `cognition:${taskId || "global"}`;
    if (!g.hasNode(cogId)) {
      g.addNode({
        id: cogId,
        type: "observation",
        content:
          cognitionState.summary ||
          cognitionState.objective ||
          "Active cognition state",
        metadata: {
          provenance: "run_execution",
          kind: "cognition",
          load: cognitionState.load ?? null,
          focus: cognitionState.focus || null,
        },
      });
      if (taskId) {
        g.addEdge({ from: cogId, to: taskId, type: "related_to" });
      }
    }
  }

  return g;
}

export default { buildRuntimeContextGraph };
