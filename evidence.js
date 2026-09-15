// Evidence types (per spec)
export const EVIDENCE_TYPES = {
  DIRECT: "DIRECT",           // Direct observation
  DERIVED: "DERIVED",        // Derived from direct evidence
  INFERRED: "INFERRED",      // Inferred (weaker)
  NEGATIVE: "NEGATIVE",      // Contradictory evidence
  ENVIRONMENT: "ENVIRONMENT", // Environment state
  TOOL_OUTPUT: "TOOL_OUTPUT", // Tool execution result
  TEST_RESULT: "TEST_RESULT", // Test execution result
  USER_CONFIRMATION: "USER_CONFIRMATION" // User validation
};

// Evidence strength levels (per spec - L0 to L4)
export const EVIDENCE_STRENGTH = {
  L0_CLAIM: "L0_CLAIM",     // Just a claim
  L1_INFERENCE: "L1_INFERENCE", // Inference
  L2_OBSERVATION: "L2_OBSERVATION", // Observation
  L3_DIRECT: "L3_DIRECT",    // Direct evidence
  L4_VERIFICATION: "L4_VERIFICATION" // Verification result
};

export function createEvidence({
  id,
  requirementId,
  source,
  type,
  observation,
  strength = EVIDENCE_STRENGTH.L2_OBSERVATION,
  actionId = null,
  supports = true
}) {
  return {
    id: id || `ev-${Date.now().toString(36)}`,
    requirementId,
    source,
    type,
    observation,
    strength,
    timestamp: Date.now(),
    actionId,
    supports // true = supports, false = contradicts
  };
}

// Conflict resolution: conflicting evidence reverts to UNKNOWN
export function resolveConflict(evidenceA, evidenceB) {
  if (!evidenceA || !evidenceB) return null;
  if (evidenceA.requirementId && evidenceB.requirementId &&
      evidenceA.requirementId !== evidenceB.requirementId) {
    return null;
  }
  if (evidenceA.supports === evidenceB.supports) return null;
  return {
    requirementId: evidenceA.requirementId || evidenceB.requirementId,
    status: "UNKNOWN",
    reason: "conflicting-evidence",
    conflictingIds: [evidenceA.id, evidenceB.id].filter(Boolean)
  };
}

// Rule: INFERRED never closes critical requirement alone
export function canCloseRequirement(evidence, isCritical = false) {
  if (!evidence || evidence.length === 0) return false;

  const hasDirect = evidence.some(e => e.strength === EVIDENCE_STRENGTH.L3_DIRECT || e.strength === EVIDENCE_STRENGTH.L4_VERIFICATION);
  const hasInferredOnly = evidence.every(e => e.strength === EVIDENCE_STRENGTH.L1_INFERENCE);

  if (isCritical && hasInferredOnly) return false;
  if (!hasDirect) return false;

  // All evidence must support (no contradictions)
  return evidence.every(e => e.supports !== false);
}

export const EVIDENCE_VOLATILITY = {
  STABLE: "stable",
  SEMI_STABLE: "semi-stable",
  VOLATILE: "volatile",
  HIGHLY_VOLATILE: "highly_volatile"
};

export function getEvidenceVolatility(type) {
  const map = {
    "file_exists": EVIDENCE_VOLATILITY.STABLE,
    "package_version": EVIDENCE_VOLATILITY.SEMI_STABLE,
    "process_running": EVIDENCE_VOLATILITY.VOLATILE,
    "network_response": EVIDENCE_VOLATILITY.HIGHLY_VOLATILE,
    "test_result": EVIDENCE_VOLATILITY.SEMI_STABLE
  };
  return map[type] || EVIDENCE_VOLATILITY.STABLE;
}

export function detectEvidenceConflict(evidenceA, evidenceB) {
  if (evidenceA.requirementId !== evidenceB.requirementId) return null;
  if (evidenceA.supports === evidenceB.supports) return null;

  return {
    type: "CONFLICT",
    evidenceA: { id: evidenceA.id, supports: evidenceA.supports },
    evidenceB: { id: evidenceB.id, supports: evidenceB.supports },
    resolved: false
  };
}

export function resolveEvidenceConflict(conflict, resolution) {
  return {
    ...conflict,
    resolved: true,
    resolution,
    resolvedAt: Date.now()
  };
}

// Detect conflicts in evidence
export function findConflicts(evidence) {
  if (!evidence || evidence.length === 0) return [];

  const conflicts = [];
  const byRequirement = {};

  for (const ev of evidence) {
    const key = ev.requirementId;
    if (!byRequirement[key]) byRequirement[key] = [];
    byRequirement[key].push(ev);
  }

  for (const [reqId, evs] of Object.entries(byRequirement)) {
    const supports = evs.filter(e => e.supports !== false);
    const contradicts = evs.filter(e => e.supports === false);
    if (supports.length > 0 && contradicts.length > 0) {
      conflicts.push({ requirementId: reqId, supports, contradicts });
    }
  }

  return conflicts;
}
