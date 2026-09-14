/**
 * Context Contradiction Resolution — explicit conflict detection and resolution.
 *
 * Detects when two pieces of context contradict each other and determines
 * which one governs based on authority precedence.
 *
 * Resolution precedence:
 *   1. user_decided (highest authority)
 *   2. explicit current constraint
 *   3. verified current evidence
 *   4. newer valid decision
 *   5. inferred
 *   6. unknown
 *
 * States: RESOLVED | UNRESOLVED | BLOCKED
 */

/**
 * @typedef {"RESOLVED" | "UNRESOLVED" | "BLOCKED"} ConflictStatus
 */

/**
 * @typedef {"user_decided" | "constraint" | "evidence" | "decision" | "inferred" | "unknown"} AuthorityType
 */

/**
 * @typedef {Object} Conflict
 * @property {string} id
 * @property {string} nodeA - First contradicting node
 * @property {string} nodeB - Second contradicting node
 * @property {string} type - "contradiction" | "invalidation"
 * @property {AuthorityType} authorityA - Authority type of node A
 * @property {AuthorityType} authorityB - Authority type of node B
 * @property {ConflictStatus} status
 * @property {string} winner - Node ID that wins (if resolved)
 * @property {string} reason - Why this resolution was chosen
 * @property {boolean} blocking - Whether this blocks execution
 */

/** Authority precedence (lower number = higher authority) */
const AUTHORITY_PRECEDENCE = {
  user_decided: 1,
  constraint: 2,
  evidence: 3,
  decision: 4,
  inferred: 5,
  unknown: 6,
};

/** Conflict types that block execution */
const BLOCKING_TYPES = [
  "architecture",
  "security",
  "compatibility",
  "acceptance",
  "destructive",
];

/**
 * Determine the authority type of a node based on its content and metadata.
 *
 * @param {Object} node
 * @returns {AuthorityType}
 */
export function getAuthorityType(node) {
  if (!node) return "unknown";

  const content = (node.content || "").toLowerCase();
  const type = node.type || "";

  // User decided
  if (content.includes("user decided") || content.includes("user-decided")) {
    return "user_decided";
  }

  // Constraint
  if (
    type === "constraint" ||
    content.includes("must") ||
    content.includes("shall") ||
    content.includes("mandatory") ||
    content.includes("required")
  ) {
    return "constraint";
  }

  // Evidence
  if (
    type === "evidence" ||
    content.includes("evidence") ||
    content.includes("verified") ||
    content.includes("test passed")
  ) {
    return "evidence";
  }

  // Decision
  if (
    type === "decision" ||
    content.includes("decision") ||
    content.includes("decided") ||
    content.includes("chose") ||
    content.includes("selected")
  ) {
    return "decision";
  }

  // Inferred
  if (
    type === "inferred" ||
    content.includes("inferred") ||
    content.includes("assumed") ||
    content.includes("likely")
  ) {
    return "inferred";
  }

  return "unknown";
}

/**
 * Compare two authority types and determine which wins.
 *
 * @param {AuthorityType} a
 * @param {AuthorityType} b
 * @returns {{ winner: AuthorityType, reason: string }}
 */
export function compareAuthority(a, b) {
  const precA = AUTHORITY_PRECEDENCE[a] || 6;
  const precB = AUTHORITY_PRECEDENCE[b] || 6;

  if (precA < precB) {
    return { winner: a, reason: `${a} has higher precedence than ${b}` };
  }
  if (precB < precA) {
    return { winner: b, reason: `${b} has higher precedence than ${a}` };
  }

  // Same precedence - use timestamp or other tiebreaker
  return { winner: a, reason: "same precedence, first wins" };
}

/**
 * Create a conflict object from two contradicting nodes.
 *
 * @param {Object} nodeA
 * @param {Object} nodeB
 * @param {string} type - "contradiction" | "invalidation"
 * @returns {Conflict}
 */
export function createConflict(nodeA, nodeB, type = "contradiction") {
  const authorityA = getAuthorityType(nodeA);
  const authorityB = getAuthorityType(nodeB);

  const { winner, reason } = compareAuthority(authorityA, authorityB);

  return {
    id: `conflict-${nodeA.id}-${nodeB.id}`,
    nodeA: nodeA.id,
    nodeB: nodeB.id,
    type,
    authorityA,
    authorityB,
    status: "UNRESOLVED",
    winner: null,
    reason: "",
    blocking: false,
  };
}

/**
 * Resolve a conflict based on authority precedence.
 *
 * @param {Conflict} conflict
 * @param {Object} graph - Context graph for node lookup
 * @returns {Conflict} Resolved conflict
 */
export function resolveConflict(conflict, graph) {
  const nodeA = graph.getNode(conflict.nodeA);
  const nodeB = graph.getNode(conflict.nodeB);

  if (!nodeA || !nodeB) {
    conflict.status = "UNRESOLVED";
    conflict.reason = "One or both nodes not found in graph";
    return conflict;
  }

  const authorityA = getAuthorityType(nodeA);
  const authorityB = getAuthorityType(nodeB);

  const { winner, reason } = compareAuthority(authorityA, authorityB);

  conflict.authorityA = authorityA;
  conflict.authorityB = authorityB;
  conflict.winner = winner === authorityA ? conflict.nodeA : conflict.nodeB;
  conflict.reason = reason;
  conflict.status = "RESOLVED";

  return conflict;
}

/**
 * Check if a conflict should block execution.
 *
 * @param {Conflict} conflict
 * @param {Object} taskContext - Task context for domain detection
 * @returns {boolean}
 */
export function shouldBlock(conflict, taskContext = {}) {
  if (conflict.status === "UNRESOLVED") {
    return true;
  }

  // Check if the conflict affects critical domains
  const content = (taskContext.content || "").toLowerCase();
  for (const domain of BLOCKING_TYPES) {
    if (content.includes(domain)) {
      return true;
    }
  }

  return false;
}

/**
 * Generate conflict report for agent consumption.
 *
 * @param {Conflict[]} conflicts
 * @returns {string} Formatted conflict report
 */
export function generateConflictReport(conflicts) {
  if (conflicts.length === 0) {
    return "";
  }

  const lines = ["[wam conflicts]"];

  for (const conflict of conflicts) {
    const status = conflict.status;
    const winner = conflict.winner ? ` → ${conflict.winner}` : "";
    lines.push(`  ${conflict.id}: ${conflict.nodeA} vs ${conflict.nodeB} (${status}${winner})`);
    if (conflict.reason) {
      lines.push(`    reason: ${conflict.reason}`);
    }
  }

  const unresolved = conflicts.filter((c) => c.status === "UNRESOLVED");
  if (unresolved.length > 0) {
    lines.push(`  ⚠ ${unresolved.length} unresolved conflict(s) — do not choose silently`);
  }

  return lines.join("\n");
}

export { AUTHORITY_PRECEDENCE, BLOCKING_TYPES };
