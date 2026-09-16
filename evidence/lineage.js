export function createLineage(reqId, hypId, expId, obsId, evId) {
  return { requirementId: reqId, hypothesisId: hypId, experimentId: expId, observationId: obsId, evidenceId: evId };
}
export function getLineage(evidenceId) { return null; }
