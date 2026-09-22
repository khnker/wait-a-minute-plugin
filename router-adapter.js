/**
 * Context Router Adapter — transforms router output to assembly format.
 *
 * Bridges Context Router (graph-based) to Context Assembly (N3 packing).
 * Router decides WHAT; Adapter formats for Assembly; Assembly decides HOW.
 *
 * Flow:
 *   Task State → Context Graph → Router → Adapter → Assembly → N3
 */

import { resolveContext, ADMISSION } from "./context-router.js";
import { buildContextGraph } from "./context-graph-builder.js";

/**
 * @typedef {Object} RouterAdapterOptions
 * @property {string} taskId
 * @property {number} budget
 * @property {string} root
 * @property {Object} graph - Context Graph instance
 */

/**
 * @typedef {Object} AdapterResult
 * @property {Array} capsules - Capsules in assembly format
 * @property {string} sufficiency - "ok" | "insufficient"
 * @property {string[]} missing
 * @property {Object} contract
 * @property {Object} routerResult - Raw router output
 * @property {string} source - "router" | "fallback"
 * @property {string} status - "READY" | "EMPTY" | "INSUFFICIENT" | "CONFLICTED" | "ERROR"
 */

/**
 * Transform a graph node to capsule format for assembly.
 *
 * @param {Object} node
 * @returns {Object} Capsule-like object
 */
function nodeToCapsule(node) {
  return {
    context_id: node.id,
    level: node.type === "task" ? "N2" : node.type === "output" ? "N3" : "N3",
    provenance: node.metadata?.provenance || "inferred",
    purpose: node.metadata?.purpose || `${node.type}: ${node.id}`,
    scope: node.type || "unknown",
    content: node.content || "",
    tokenEstimate: Math.ceil((node.content || "").length / 4) + 20,
  };
}

/**
 * Adapt router result to assembly-compatible format.
 *
 * @param {Object} routerResult - Output from resolveContext()
 * @param {Object} options
 * @returns {AdapterResult}
 */
export function adaptRouterResult(routerResult, options = {}) {
  const { budget = 4000 } = options;

  if (!routerResult) {
    return {
      capsules: [],
      sufficiency: "insufficient",
      missing: ["router returned null"],
      contract: { conditions: [] },
      routerResult: null,
      source: "fallback",
    };
  }

  // Transform nodes to capsules
  const capsules = routerResult.nodes.map(nodeToCapsule);

  // Build contract from missing/omitted
  const conditions = [];
  for (const gap of routerResult.missing || []) {
    conditions.push({
      id: `SC-${conditions.length + 1}`,
      type: "dependency",
      description: gap.description || `Missing: ${gap.requiredBy}`,
      status: "MISSING",
      severity: "MANDATORY",
    });
  }

  for (const omitted of routerResult.omitted || []) {
    conditions.push({
      id: `SC-${conditions.length + 1}`,
      type: "admission",
      description: `Omitted: ${omitted.id} (${omitted.reason})`,
      status: omitted.admission === ADMISSION.MANDATORY ? "MISSING" : "OPTIONAL",
      severity: omitted.admission,
    });
  }

  const missing = conditions
    .filter((c) => c.status === "MISSING" && c.severity === "MANDATORY")
    .map((c) => c.description);

  const sufficiency = routerResult.sufficient ? "ok" : "insufficient";

  // Map router results to status
  let status = "READY";
  if (!routerResult) status = "ERROR";
  else if (!routerResult.nodes.length) status = "EMPTY";
  else if (!routerResult.sufficient) status = "INSUFFICIENT";
  else if (routerResult.budgetOverflow) status = "INSUFFICIENT";
  else if ((routerResult.omitted || []).some((o) => o.admission === ADMISSION.MANDATORY)) status = "INSUFFICIENT";

  return {
    capsules,
    sufficiency,
    missing,
    contract: { conditions },
    routerResult,
    source: "router",
    status
  };
}

/**
 * Execute router and adapt result for assembly.
 * This is the main integration point.
 *
 * Canonical path: Context Router is the sole authority for N3 selection.
 * Silent fallbacks are forbidden; the only opt-in legacy selector is
 * gated by env WAM_CONTEXT_SELECTOR=legacy OR options.useLegacySelector=true.
 *
 * @param {Object} graph - Context Graph (canonical ContextGraph instance)
 * @param {RouterAdapterOptions} options
 * @returns {AdapterResult}
 */
export function routeAndAdapt(graph, options) {
  const { taskId, budget = 4000, useLegacySelector = false } = options;
  const legacySelectorAllowed =
    process.env.WAM_CONTEXT_SELECTOR === "legacy" || useLegacySelector === true;

  if (!graph || !taskId) {
    return {
      capsules: [],
      sufficiency: "insufficient",
      missing: ["no graph or taskId"],
      contract: { conditions: [] },
      routerResult: null,
      source: "fallback",
    };
  }

  try {
    const routerResult = resolveContext(graph, { taskId, maxTokens: budget });
    const adapted = adaptRouterResult(routerResult, { budget });
    // C02: mark source as legacy only when caller explicitly opted in
    // AND router returned empty/insufficient — never silent.
    if (legacySelectorAllowed && (!adapted.capsules || adapted.capsules.length === 0)) {
      return { ...adapted, source: "legacy-allowed" };
    }
    return adapted;
  } catch (error) {
    // Surface error: do NOT swap in legacy selector unless explicitly allowed.
    if (!legacySelectorAllowed) {
      return {
        capsules: [],
        sufficiency: "insufficient",
        missing: [`router error: ${error.message}`],
        contract: { conditions: [] },
        routerResult: null,
        source: "router-error",
      };
    }
    return {
      capsules: [],
      sufficiency: "insufficient",
      missing: [`router error: ${error.message}`],
      contract: { conditions: [] },
      routerResult: null,
      source: "fallback",
    };
  }
}

/**
 * Build a minimal context graph from task state.
 * Used when no pre-existing graph is available.
 *
 * @deprecated Callers should use buildRuntimeContextGraph() instead so all
 * runtime layers (evidence, decisions, constraints, artifacts, observations,
 * cognition, hypotheses, experiments) are represented. This helper is kept
 * only for the legacy selector opt-in path (WAM_CONTEXT_SELECTOR=legacy).
 *
 * @param {Object} taskState
 * @param {string} root
 * @returns {Object} Minimal graph-like structure
 */
export function buildGraphFromTaskState(taskState, root) {
  const nodes = [];
  const edges = [];

  // Add task node
  if (taskState?.taskId) {
    nodes.push({
      id: taskState.taskId,
      type: "task",
      content: taskState.lastAction || taskState.contract?.objective || "",
      metadata: {
        purpose: "Current task",
        provenance: "user_decided",
      },
    });
  }

  // Add requirement nodes
  for (const req of taskState?.requirements || []) {
    nodes.push({
      id: req.id,
      type: "output",
      content: req.title || req.description || "",
      metadata: {
        purpose: `Requirement: ${req.title}`,
        provenance: "user_decided",
      },
    });
    edges.push({
      from: taskState.taskId,
      to: req.id,
      type: "depends_on",
    });
  }

  // Build graph interface
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return {
    getNode: (id) => nodeMap.get(id) || null,
    getEdgesFrom: (id) => edges.filter((e) => e.from === id),
    getEdgesTo: (id) => edges.filter((e) => e.to === id),
    getEdgesFromByType: (id, type) => edges.filter((e) => e.from === id && e.type === type),
    getEdgesToByType: (id, type) => edges.filter((e) => e.to === id && e.type === type),
    getUpstream: (id, depth) => {
      const result = [];
      const visited = new Set();
      const queue = [id];
      while (queue.length > 0 && result.length < 100) {
        const nodeId = queue.shift();
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);
        const node = nodeMap.get(nodeId);
        if (node) result.push(node);
        for (const edge of edges.filter((e) => e.to === nodeId)) {
          if (!visited.has(edge.from)) queue.push(edge.from);
        }
      }
      return result;
    },
    getContradicting: () => [],
  };
}

export { ADMISSION };
