// Requirement ownership: verify who can validate a requirement
export function verifyRequirementOwnership(task, owner) {
  if (!task || !owner) return { owned: false, reason: "missing-input" };
  const taskOwner = task.owner || task.assignedTo || null;
  if (taskOwner === owner) return { owned: true, owner: taskOwner };
  if (task.verifiers && Array.isArray(task.verifiers) && task.verifiers.includes(owner)) {
    return { owned: true, owner: taskOwner };
  }
  return { owned: false, reason: "not-owner", owner: taskOwner };
}

// Assert that a task can be verified given its state and ownership
export function assertCanVerify(task, verifier) {
  if (!task) return { canVerify: false, reason: "missing-task" };
  if (task.status === "VERIFIED") return { canVerify: false, reason: "already-verified" };
  if (task.status === "BLOCKED") return { canVerify: false, reason: "blocked" };
  const ownership = verifyRequirementOwnership(task, verifier);
  if (!ownership.owned) return { canVerify: false, reason: "no-ownership", ...ownership };
  return { canVerify: true, verifier };
}
