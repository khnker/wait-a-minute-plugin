export function classifyFailure(observation) {
  if (!observation) return { category: "UNKNOWN", confidence: 0 };
  if (observation.error?.includes("timeout")) return { category: "TIMEOUT", confidence: 0.9 };
  return { category: "GENERIC", confidence: 0.5 };
}
