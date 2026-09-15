import { EVIDENCE_TYPES, EVIDENCE_STRENGTH } from "./evidence.js";

export function detectEvidenceGaps(requirements, evidence) {
  const gaps = [];

  for (const req of requirements) {
    const reqEvidence = evidence.filter(e => e.requirementId === req.id);

    // No evidence at all
    if (reqEvidence.length === 0) {
      gaps.push({
        requirementId: req.id,
        gapType: "NO_EVIDENCE",
        missingEvidence: ["Any evidence"],
        suggestedVerification: getSuggestedVerification(req)
      });
      continue;
    }

    // Check strength
    const maxStrength = getMaxStrength(reqEvidence);
    const requiredStrength = req.critical ? EVIDENCE_STRENGTH.L3_DIRECT : EVIDENCE_STRENGTH.L2_OBSERVATION;

    if (maxStrength < requiredStrength) {
      gaps.push({
        requirementId: req.id,
        gapType: "INSUFFICIENT_STRENGTH",
        missingEvidence: [`Need at least ${requiredStrength} strength`],
        currentStrength: maxStrength,
        suggestedVerification: getSuggestedVerification(req)
      });
    }

    // Check for contradictions
    const hasSupport = reqEvidence.some(e => e.supports !== false);
    const hasContradiction = reqEvidence.some(e => e.supports === false);

    if (hasSupport && hasContradiction) {
      gaps.push({
        requirementId: req.id,
        gapType: "CONTRADICTION",
        missingEvidence: ["Resolve conflicting evidence"],
        suggestedVerification: "Re-evaluate with fresh evidence"
      });
    }
  }

  return gaps;
}

function getMaxStrength(evidence) {
  const strengthOrder = [
    EVIDENCE_STRENGTH.L0_CLAIM,
    EVIDENCE_STRENGTH.L1_INFERENCE,
    EVIDENCE_STRENGTH.L2_OBSERVATION,
    EVIDENCE_STRENGTH.L3_DIRECT,
    EVIDENCE_STRENGTH.L4_VERIFICATION,
  ];

  let maxIdx = -1;
  for (const ev of evidence) {
    const idx = strengthOrder.indexOf(ev.strength);
    if (idx > maxIdx) maxIdx = idx;
  }
  return strengthOrder[maxIdx] || EVIDENCE_STRENGTH.L0_CLAIM;
}

function getSuggestedVerification(req) {
  if (req.claim?.includes("test") || req.claim?.includes("verify")) {
    return "Execute test or verification command";
  }
  if (req.claim?.includes("launch") || req.claim?.includes("run")) {
    return "Execute and observe actual behavior";
  }
  return "Gather direct evidence";
}
