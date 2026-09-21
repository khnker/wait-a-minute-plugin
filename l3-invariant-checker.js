export function checkStateInvariant(state, invariant) {
  if (!invariant(state)) {
    throw new Error("Invariant violation detected");
  }
}
