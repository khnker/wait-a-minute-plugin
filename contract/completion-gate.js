export function evaluateCompletion(state) {
  const reqs = state.requirements || [];
  const unverified = reqs.filter(r => r.status !== "verified");
  return {
    blocked: unverified.length > 0,
    unresolvedRequirements: unverified.map(r => r.id)
  };
}
