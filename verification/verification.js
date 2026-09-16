export function verifyRequirement(requirement, evidence) {
  if (!evidence || evidence.length === 0) return { verified: false, reason: "No evidence" };
  return { verified: true, evidence };
}
