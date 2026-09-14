/**
 * Context Pack Source of Truth — clarifies authority between components.
 *
 * Defines clear responsibility boundaries:
 *
 *   Context Graph    = relationships (what connects to what)
 *   Context Router   = WHAT context is needed (graph-based resolution)
 *   Context Assembly = HOW to pack it (N0-N4 levels, budget, admission)
 *   Context Selection = capsule retrieval (legacy, fallback only)
 *
 * Authority:
 *   Router decides WHAT
 *   Assembly decides HOW
 *   Selection retrieves (no decisions)
 */

/**
 * @typedef {"graph" | "router" | "assembly" | "selection"} Component
 */

/**
 * @typedef {Object} AuthorityDecision
 * @property {Component} component
 * @property {string} decision
 * @property {string} reason
 * @property {number} timestamp
 */

/**
 * Component responsibilities (canonical).
 */
export const RESPONSIBILITIES = {
  graph: {
    authority: "relationships",
    description: "Stores and queries relationships between context nodes",
    decisions: ["edge types", "node storage", "graph traversal primitives"],
  },
  router: {
    authority: "what",
    description: "Determines minimum sufficient context for a task",
    decisions: [
      "which nodes are required",
      "dependency resolution",
      "contradiction detection",
      "sufficiency assessment",
    ],
  },
  assembly: {
    authority: "how",
    description: "Packs context into N0-N4 levels within budget",
    decisions: [
      "level allocation (N0-N4)",
      "budget partitioning",
      "admission classes",
      "final pack contents",
    ],
  },
  selection: {
    authority: "retrieval",
    description: "Retrieves capsules from storage (legacy, no decisions)",
    decisions: ["capsule lookup", "lifecycle filtering"],
  },
};

/**
 * Validate that a decision is within component's authority.
 *
 * @param {Component} component
 * @param {string} decision
 * @returns {{ valid: boolean, reason: string }}
 */
export function validateAuthority(component, decision) {
  const resp = RESPONSIBILITIES[component];
  if (!resp) {
    return { valid: false, reason: `Unknown component: ${component}` };
  }

  const isAuthorized = resp.decisions.some(
    (d) => decision.toLowerCase().includes(d.toLowerCase())
  );

  if (isAuthorized) {
    return { valid: true, reason: `${component} has authority over ${decision}` };
  }

  return {
    valid: false,
    reason: `${component} does NOT have authority over ${decision}. Authorized: ${resp.decisions.join(", ")}`,
  };
}

/**
 * Create an authority decision record.
 *
 * @param {Component} component
 * @param {string} decision
 * @param {string} reason
 * @returns {AuthorityDecision}
 */
export function recordDecision(component, decision, reason) {
  return {
    component,
    decision,
    reason,
    timestamp: Date.now(),
  };
}

/**
 * Resolve authority conflict between two components.
 *
 * @param {Component} a
 * @param {Component} b
 * @param {string} decisionType
 * @returns {{ winner: Component, reason: string }}
 */
export function resolveAuthorityConflict(a, b, decisionType) {
  // Authority hierarchy: assembly > router > selection > graph
  const hierarchy = ["assembly", "router", "selection", "graph"];

  const idxA = hierarchy.indexOf(a);
  const idxB = hierarchy.indexOf(b);

  if (idxA === -1) return { winner: b, reason: `${a} not in hierarchy` };
  if (idxB === -1) return { winner: a, reason: `${b} not in hierarchy` };

  if (idxA < idxB) {
    return { winner: a, reason: `${a} has higher authority than ${b} for ${decisionType}` };
  }
  return { winner: b, reason: `${b} has higher authority than ${a} for ${decisionType}` };
}

/**
 * Generate authority report for a context pack assembly.
 *
 * @param {Object} context - Assembly context
 * @returns {string} Formatted report
 */
export function generateAuthorityReport(context) {
  const lines = ["[wam authority]"];

  lines.push("  Graph: stores relationships");
  lines.push("  Router: determines WHAT context is needed");
  lines.push("  Assembly: determines HOW to pack it");
  lines.push("  Selection: retrieves capsules (no decisions)");

  if (context?.routerDecision) {
    lines.push(`  Router decision: ${context.routerDecision}`);
  }
  if (context?.assemblyDecision) {
    lines.push(`  Assembly decision: ${context.assemblyDecision}`);
  }

  return lines.join("\n");
}

export default RESPONSIBILITIES;
