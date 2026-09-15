// Change 12 — context-verification
// Change 13 — verification-context-budget
// Change 15 — verification-invalidation

export const CONTEXT_LEVELS = {
  N0: "N0", // Task / requirements
  N1: "N1", // Domain-specific verification knowledge
  N2: "N2", // Current evidence / observations
  N3: "N3"  // Opportunistic context
};

export function loadVerificationContext(level, taskData) {
  switch (level) {
    case CONTEXT_LEVELS.N0:
      return { requirements: taskData.requirements };
    case CONTEXT_LEVELS.N1:
      return {
        requirements: taskData.requirements,
        verificationMethods: taskData.verificationMethods || []
      };
    case CONTEXT_LEVELS.N2:
      return {
        requirements: taskData.requirements,
        evidence: taskData.evidence || [],
        observations: taskData.observations || []
      };
    case CONTEXT_LEVELS.N3:
      return {
        opportunistic: true,
        context: taskData.opportunisticContext
      };
    default:
      return {};
  }
}

// Rule: Never load N3 to substitute missing N2 evidence
export function validateContextBudget(loadedContext, requiredLevels) {
  const missing = requiredLevels.filter(l => !loadedContext[l]);
  return {
    valid: missing.length === 0,
    missingLevels: missing,
    warning: loadedContext[CONTEXT_LEVELS.N3] && !loadedContext[CONTEXT_LEVELS.N2]
      ? "N3 context used to substitute missing N2"
      : null
  };
}

export const DEFAULT_VERIFICATION_BUDGET = {
  maxActions: 10,
  maxTokens: 50000,
  maxLatencyMs: 120000,
  maxRetries: 2
};

export function createVerificationBudget(overrides = {}) {
  return { ...DEFAULT_VERIFICATION_BUDGET, ...overrides };
}

// Change 32 — verification-invalidation
export function createVerificationInvalidation(requirement, reason, relatedEvidence = []) {
  return {
    requirementId: requirement.id,
    previousStatus: requirement.status,
    newStatus: "UNKNOWN",
    reason,
    relatedEvidence: relatedEvidence.map(e => e.id),
    invalidatedAt: Date.now(),
    invalidatedBy: "verificationEngine"
  };
}

export function checkVerificationDependencies(requirement, currentContext) {
  const dependencies = requirement.dependencies || [];
  const changes = [];

  for (const dep of dependencies) {
    const currentValue = currentContext[dep.key];
    const previousValue = dep.value;

    if (currentValue !== previousValue) {
      changes.push({
        dependency: dep.key,
        previous: previousValue,
        current: currentValue
      });
    }
  }

  return {
    stable: changes.length === 0,
    changes
  };
}

export function shouldInvalidate(requirement, currentContext, stalenessThreshold = 3600000) {
  if (!requirement.verifiedAt) return false;

  const age = Date.now() - requirement.verifiedAt;
  if (age > stalenessThreshold) return true;

  const deps = checkVerificationDependencies(requirement, currentContext);
  return !deps.stable;
}

export function isBudgetExhausted(budget, usage) {
  return (
    usage.actions >= budget.maxActions ||
    usage.tokens >= budget.maxTokens ||
    usage.latencyMs >= budget.maxLatencyMs ||
    usage.retries >= budget.maxRetries
  );
}

export function invalidateVerification(requirement, invalidatingObservation) {
  return {
    ...requirement,
    status: "UNKNOWN",
    invalidatedAt: Date.now(),
    invalidationReason: invalidatingObservation,
    previousStatus: requirement.status
  };
}
