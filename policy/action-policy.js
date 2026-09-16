export function evaluateActionPolicy(action, strategy) {
  if (!strategy || strategy.status !== "ACTIVE") return { allowed: true };
  return { allowed: true, covered: true, reason: "Strategy active" };
}
