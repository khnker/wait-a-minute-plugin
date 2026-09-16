export function createContract(requirements, verification) {
  return { status: "PROPOSED", requirements, verification, unknowns: [], assumptions: [] };
}
export function approveContract(contract) {
  return { ...contract, status: "APPROVED" };
}
export function rejectContract(contract) {
  return { ...contract, status: "REJECTED" };
}
