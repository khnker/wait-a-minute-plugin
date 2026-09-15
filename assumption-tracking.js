let _assumptionCounter = 0;
export function createAssumption(statement, source, impact = "unknown") {
  _assumptionCounter++;
  return {
    id: `assumption-${Date.now().toString(36)}-${_assumptionCounter}`,
    statement,
    source,
    impact, // "critical" | "material" | "minor" | "unknown"
    validated: false,
    invalidated: false,
    createdAt: Date.now()
  };
}

export function validateAssumption(assumption, evidence) {
  const supporting = evidence.filter(e =>
    e.requirementId === assumption.relatedTo && e.supports !== false
  );

  return {
    assumptionId: assumption.id,
    validated: supporting.length > 0,
    supportingEvidence: supporting.length,
    invalidated: assumption.invalidated
  };
}

export function trackAssumptionBudget(assumptions, maxUnvalidated = 5) {
  const unvalidated = assumptions.filter(a => !a.validated && !a.invalidated);
  return {
    withinBudget: unvalidated.length <= maxUnvalidated,
    current: unvalidated.length,
    max: maxUnvalidated,
    overBudget: Math.max(0, unvalidated.length - maxUnvalidated)
  };
}

export const DEFAULT_ASSUMPTION_BUDGET = {
  maxUnvalidated: 5,
  maxCritical: 2,
  maxMaterial: 5
};

export function checkAssumptionBudget(assumptions, budget = DEFAULT_ASSUMPTION_BUDGET) {
  const unvalidated = assumptions.filter(a => !a.validated && !a.invalidated);
  const critical = unvalidated.filter(a => a.impact === "critical");
  const material = unvalidated.filter(a => a.impact === "material");

  const violations = [];

  if (unvalidated.length > budget.maxUnvalidated) {
    violations.push(`Too many unvalidated assumptions: ${unvalidated.length} > ${budget.maxUnvalidated}`);
  }
  if (critical.length > budget.maxCritical) {
    violations.push(`Too many critical assumptions: ${critical.length} > ${budget.maxCritical}`);
  }
  if (material.length > budget.maxMaterial) {
    violations.push(`Too many material assumptions: ${material.length} > ${budget.maxMaterial}`);
  }

  return {
    valid: violations.length === 0,
    violations,
    counts: { unvalidated: unvalidated.length, critical: critical.length, material: material.length }
  };
}
