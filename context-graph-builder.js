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
  const taskId = taskState?.taskId || null;
  if (taskId) {
    g.addNode({
      id: taskId,
      type: "task",
      content: taskState?.contract?.objective || "Active task",
      metadata: { provenance: "user_decided" },
    });
  }

  // 2. Requirement Nodes
  for (const req of taskState?.requirements || []) {
    if (!req?.id) continue;
    g.addNode({
      id: req.id,
      type: "requirement",
      content: req.title || req.description || "",
      metadata: { provenance: "user_decided" },
    });
    // Task requires requirement (only if task node exists)
    if (taskId) {
      g.addEdge({
        from: taskId,
        to: req.id,
        type: "requires_completion",
      });
    }
  }

  // 3. Evidence Lineage (mapped to canonical edges)
  for (const ev of evidenceLineage || []) {
    if (!ev?.id) continue;
    g.addNode({
      id: ev.id,
      type: "evidence",
      content: ev.content || "",
      verified: ev.status === "valid",
      metadata: { provenance: "run_execution" },
    });
    // Evidence supports requirement (only if requirement node exists)
    if (ev.requirementId && g.hasNode(ev.requirementId)) {
      g.addEdge({
        from: ev.id,
        to: ev.requirementId,
        type: "supports",
      });
    }
  }

  return g;
}
