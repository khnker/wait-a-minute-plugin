// Change 39 — Ponytail-cross-cutting
// Cross-cutting constraints that modify policy behavior (ponytail, simplify, safety, security).

export const CONSTRAINT_TYPES = {
  PONYTAIL: "ponytail",
  SIMPLIFY: "simplify",
  SAFETY: "safety",
  SECURITY: "security"
};

export function applyConstraint(policy, constraints) {
  const activeConstraints = constraints.filter(c => c.active);

  for (const constraint of activeConstraints) {
    if (constraint.type === CONSTRAINT_TYPES.PONYTAIL) {
      // Ponytail: keep actions minimal and focused
      if (policy.actions && policy.actions.length > 3) {
        policy.actions = policy.actions.slice(0, 3);
        policy.constrained = true;
        policy.constraintReason = "ponytail";
      }
    }

    if (constraint.type === CONSTRAINT_TYPES.SIMPLIFY) {
      // Simplify: prefer simple solutions over complex
      if (policy.complexity && policy.complexity > 5) {
        policy.simplified = true;
        policy.constraintReason = "simplify";
      }
    }
  }

  return policy;
}

export function isConstraintActive(constraints, type) {
  return constraints.some(c => c.type === type && c.active);
}
