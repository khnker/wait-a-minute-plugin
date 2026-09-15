/**
 * Context Graph Builder — canonical reconstruction from runtime state.
 *
 * Maps TaskState, RunState, and EvidenceLineage into a ContextGraph.
 */

import { ContextGraph } from "./context-graph.js";

/**
 * Builds a canonical ContextGraph from runtime state.
 *
 * @param {Object} taskState - Current task state
 * @param {Object} runState - Current run state
 * @param {Object} evidenceLineage - Evidence/verification state
 * @returns {ContextGraph}
 */
export function buildContextGraph(taskState, runState, evidenceLineage) {
  const g = new ContextGraph();

  // 1. Task Node
  if (taskState?.taskId) {
    g.addNode({
      id: taskState.taskId,
      type: "task",
      content: taskState.contract?.objective || "Active task",
      metadata: { provenance: "user_decided" },
    });
  }

  // 2. Requirement Nodes (mapped to output type or requirement type?)
  // Canonical Graph defines "requirement" type. Adapting from taskState.requirements.
  for (const req of taskState?.requirements || []) {
    g.addNode({
      id: req.id,
      type: "requirement",
      content: req.title || req.description || "",
      metadata: { provenance: "user_decided" },
    });
    // Task requires requirement
    g.addEdge({
      from: taskState.taskId,
      to: req.id,
      type: "requires_completion",
    });
  }

  // 3. Evidence Lineage (mapped to canonical edges)
  for (const ev of evidenceLineage || []) {
    g.addNode({
      id: ev.id,
      type: "evidence",
      content: ev.content || "",
      verified: ev.status === "valid",
      metadata: { provenance: "run_execution" },
    });
    // Evidence supports requirement
    if (ev.requirementId) {
      g.addEdge({
        from: ev.id,
        to: ev.requirementId,
        type: "supports",
      });
    }

  }

  return g;
}
