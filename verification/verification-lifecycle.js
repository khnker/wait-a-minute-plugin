export const VERIFICATION_STATES = { UNVERIFIED: "UNVERIFIED", VERIFYING: "VERIFYING", VERIFIED: "VERIFIED", FAILED: "FAILED", INVALIDATED: "INVALIDATED" };
export function transitionVerification(from, to) { return to; }
