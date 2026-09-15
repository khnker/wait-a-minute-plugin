import { detectEvidenceGaps } from "./evidence-gap.js";

export const COMPLETION_KEYWORDS = [
  "done", "fixed", "working", "solved", "completed",
  "implemented", "resolved", "ready", "complete"
];

export function interceptCompletionClaim(agentMessage) {
  const claims = [];
  const lower = agentMessage.toLowerCase();

  for (const keyword of COMPLETION_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "gi");
    let match;
    while ((match = regex.exec(agentMessage)) !== null) {
      claims.push({
        keyword,
        position: match.index,
        context: agentMessage.slice(Math.max(0, match.index - 30), match.index + 30)
      });
    }
  }

  return claims;
}

export function classifyClaim(claim, context) {
  const patterns = {
    FACT: /\b(exists|present|available|installed|configured)\b/i,
    HYPOTHESIS: /\b(think|believe|probably|might|could be)\b/i,
    OBSERVATION: /\b(see|observe|notice|found|detected)\b/i,
    INTENT: /\b(will|going to|plan|should|need to)\b/i,
    CONCLUSION: /\b(therefore|so|thus|conclude)\b/i,
    COMPLETION_CLAIM: /\b(done|fixed|working|solved|completed)\b/i
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(claim)) return type;
  }

  return "UNKNOWN";
}

export function validateCompletionClaim(claim, taskState) {
  if (!taskState.requirements || taskState.requirements.length === 0) {
    return { valid: false, reason: "No requirements defined" };
  }

  const gaps = detectEvidenceGaps(taskState.requirements, taskState.evidence || []);
  const mandatoryIncomplete = taskState.requirements.filter(
    r => !r.optional && r.status !== "VERIFIED"
  );

  return {
    valid: mandatoryIncomplete.length === 0 && gaps.length === 0,
    reason: gaps.length > 0 ? "Evidence gaps remain" :
            mandatoryIncomplete.length > 0 ? "Requirements not verified" : null,
    incompleteRequirements: mandatoryIncomplete.map(r => r.id),
    evidenceGaps: gaps.map(g => g.requirementId)
  };
}

export function validateContractNotReduced(originalRequirements, currentRequirements) {
  const violations = [];

  for (const orig of originalRequirements) {
    const current = currentRequirements.find(r => r.id === orig.id);
    if (!current) {
      violations.push({ type: "REMOVED", requirementId: orig.id });
      continue;
    }

    if (orig.acceptanceCriteria && current.acceptanceCriteria) {
      const origLen = orig.acceptanceCriteria.length;
      const currLen = current.acceptanceCriteria.length;
      if (currLen < origLen) {
        violations.push({
          type: "WEAKENED",
          requirementId: orig.id,
          originalCount: origLen,
          currentCount: currLen
        });
      }
    }

    if (orig.claim && current.claim) {
      if (current.claim.length < orig.claim.length * 0.8) {
        violations.push({
          type: "WEAKENED_CLAIM",
          requirementId: orig.id
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations
  };
}
