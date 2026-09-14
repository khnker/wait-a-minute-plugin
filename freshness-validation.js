/**
 * Context Freshness Validation — derives verification from evidence lineage.
 *
 * The Context Graph should NOT be a second source of truth for
 * epistemological state. It should derive it from Evidence Lineage.
 *
 * Rule: `verified` on a ContextNode cannot survive invalidated
 * supporting evidence. Validity must be resolved from lineage/provenance.
 */

/**
 * @typedef {Object} FreshnessResult
 * @property {string} nodeId
 * @property {boolean} effectiveVerified
 * @property {string} reason
 * @property {string} derivedFrom
 * @property {number} derivedAt
 */

/**
 * @typedef {Object} EvidenceStatus
 * @property {string} id
 * @property {string} status - "valid" | "superseded" | "invalidated" | "unverified"
 * @property {number} updatedAt
 */

/**
 * Derive effective verification status for a node.
 *
 * A node is effectively verified only if:
 *   1. It is marked as verified in the graph
 *   2. ALL supporting evidence is valid (not invalidated)
 *
 * @param {Object} node - Context node
 * @param {EvidenceStatus[]} supportingEvidence - Evidence that supports this node
 * @returns {FreshnessResult}
 */
export function deriveVerification(node, supportingEvidence = []) {
  if (!node) {
    return {
      nodeId: null,
      effectiveVerified: false,
      reason: "node not found",
      derivedFrom: "none",
      derivedAt: Date.now(),
    };
  }

  // If node is not verified, it's not verified
  if (!node.verified) {
    return {
      nodeId: node.id,
      effectiveVerified: false,
      reason: "node not verified in graph",
      derivedFrom: "graph",
      derivedAt: Date.now(),
    };
  }

  // Check if any supporting evidence is invalidated
  const invalidated = supportingEvidence.filter((e) => e.status === "invalidated");
  if (invalidated.length > 0) {
    return {
      nodeId: node.id,
      effectiveVerified: false,
      reason: `${invalidated.length} supporting evidence invalidated`,
      derivedFrom: "evidence-lineage",
      derivedAt: Date.now(),
    };
  }

  // Check if all supporting evidence is superseded
  const superseded = supportingEvidence.filter((e) => e.status === "superseded");
  if (superseded.length > 0 && superseded.length === supportingEvidence.length) {
    return {
      nodeId: node.id,
      effectiveVerified: false,
      reason: "all supporting evidence superseded",
      derivedFrom: "evidence-lineage",
      derivedAt: Date.now(),
    };
  }

  // Check if there's any valid evidence
  const valid = supportingEvidence.filter((e) => e.status === "valid");
  if (supportingEvidence.length > 0 && valid.length === 0) {
    return {
      nodeId: node.id,
      effectiveVerified: false,
      reason: "no valid supporting evidence",
      derivedFrom: "evidence-lineage",
      derivedAt: Date.now(),
    };
  }

  // Node is verified and has valid supporting evidence
  return {
    nodeId: node.id,
    effectiveVerified: true,
    reason: "verified with valid supporting evidence",
    derivedFrom: "combined",
    derivedAt: Date.now(),
  };
}

/**
 * Check if evidence invalidation affects graph nodes.
 *
 * @param {string} evidenceId - Invalidated evidence ID
 * @param {Object} graph - Context graph
 * @returns {string[]} Affected node IDs
 */
export function findAffectedNodes(evidenceId, graph) {
  const affected = [];

  // Find all nodes that depend on this evidence
  const edges = graph.getEdgesToByType
    ? graph.getEdgesToByType(evidenceId, "supports")
    : [];

  for (const edge of edges) {
    const node = graph.getNode(edge.from);
    if (node && node.verified) {
      affected.push(node.id);
    }
  }

  return affected;
}

/**
 * Mark graph nodes as stale when evidence is invalidated.
 *
 * @param {string} evidenceId - Invalidated evidence ID
 * @param {Object} graph - Context graph
 * @returns {string[]} Nodes that were marked stale
 */
export function markStaleOnInvalidation(evidenceId, graph) {
  const affected = findAffectedNodes(evidenceId, graph);

  for (const nodeId of affected) {
    const node = graph.getNode(nodeId);
    if (node) {
      node.verified = false;
      node.metadata = node.metadata || {};
      node.metadata.staleReason = `evidence ${evidenceId} invalidated`;
      node.metadata.staleAt = Date.now();
    }
  }

  return affected;
}

/**
 * Generate freshness report for a set of nodes.
 *
 * @param {Object[]} nodes
 * @param {Object} evidenceStore - Evidence lookup function
 * @returns {Object} Freshness report
 */
export function generateFreshnessReport(nodes, evidenceStore) {
  const results = [];
  let verified = 0;
  let stale = 0;

  for (const node of nodes) {
    const evidence = evidenceStore?.getSupportingEvidence?.(node.id) || [];
    const result = deriveVerification(node, evidence);
    results.push(result);

    if (result.effectiveVerified) {
      verified++;
    } else if (node.verified && !result.effectiveVerified) {
      stale++;
    }
  }

  return {
    total: nodes.length,
    verified,
    stale,
    unverified: nodes.length - verified - stale,
    results,
  };
}

export default deriveVerification;
