import { classifyClaim } from "./false-completion-prevention.js";

export function interceptAgentClaim(message) {
  const claimPatterns = {
    FACT: /\b(is|exists|present|available|installed|configured|has|have)\b/i,
    HYPOTHESIS: /\b(think|believe|probably|might|could be|suspect)\b/i,
    OBSERVATION: /\b(see|observe|notice|found|detected)\b/i,
    INTENT: /\b(will|going to|plan|should|need to|want to)\b/i,
    CONCLUSION: /\b(therefore|so|thus|conclude)\b/i,
    COMPLETION: /\b(done|fixed|working|solved|completed|implemented|resolved|ready)\b/i
  };

  const claims = [];

  for (const [type, pattern] of Object.entries(claimPatterns)) {
    const match = message.match(pattern);
    if (match) {
      claims.push({
        type,
        text: match[0],
        position: match.index,
        context: message.slice(Math.max(0, match.index - 20), match.index + 20)
      });
    }
  }

  return claims;
}

export function createClaim(text, type, source = "agent") {
  return {
    id: `claim-${Date.now().toString(36)}`,
    text,
    type,
    source,
    timestamp: Date.now(),
    validated: false
  };
}

export function validateClaim(claim, taskState) {
  const result = {
    claimId: claim.id,
    valid: false,
    requiresVerification: false,
    reason: ""
  };

  if (claim.type === "COMPLETION") {
    result.requiresVerification = true;
    result.reason = "Completion claim requires verification";
  } else if (claim.type === "HYPOTHESIS") {
    result.reason = "Hypothesis requires validation";
  } else if (claim.type === "FACT") {
    result.requiresVerification = true;
    result.reason = "Fact claims should be verified";
  } else {
    result.valid = true;
    result.reason = "Observation or intent does not require verification";
  }

  return result;
}
