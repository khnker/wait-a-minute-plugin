export function createRequirement(id, title) {
  return { id, title, status: "pending", evidence: [] };
}
export function markRequirement(requirement, status, evidence) {
  return { ...requirement, status, evidence: [...requirement.evidence, evidence] };
}
