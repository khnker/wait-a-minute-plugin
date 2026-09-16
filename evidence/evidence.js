export function createEvidence(type, content, source) {
  return { id: "ev-" + Date.now(), type, content, source, createdAt: Date.now() };
}
