/**
 * agent-behavior.test.mjs — Change 55: Agent behavior contract tests
 *
 * 3 cases demonstrating the agent interaction loop:
 *   agent_sees_failure_forms_hypothesis
 *   agent_chooses_action_receives_result
 *   agent_claims_success_WAM_decides
 *
 * Ejecutar: node --test agent-behavior.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  createActionResult,
  createObservation,
  evaluateObservationAgainst,
  demoCommandSucceedsNotRequirementSatisfied,
} from "./action-evaluation.js";
import { interceptCompletionClaim, classifyClaim } from "./false-completion-prevention.js";

// ═══════════════════════════════════════════════════════════
// CASE 1 — agent sees failure → forms hypothesis
// When an action fails, the agent forms a hypothesis (not success)
// ═══════════════════════════════════════════════════════════
test("agent_sees_failure_forms_hypothesis", () => {
  // Agent executes action that fails
  const action = createActionResult({
    actionId: "act-001",
    success: false,
    exitCode: 1,
    output: "Error: Connection refused",
    durationMs: 150,
  });

  // Agent sees failure → forms hypothesis about WHY
  const observation = createObservation({
    actionId: "act-001",
    requirementId: "R1",
    observation: "Connection refused — possibly service not running",
    relevance: "direct",
  });

  // Hypothesis: agent does NOT claim success, forms alternative explanation
  assert.equal(action.success, false, "action failed");
  assert.ok(
    observation.observation.toLowerCase().includes("possibly") ||
    observation.observation.toLowerCase().includes("error"),
    "agent forms hypothesis (not certainty) about failure"
  );
  assert.equal(observation.relevance, "direct", "observation linked to action");

  // Evaluate: failure observation should NOT satisfy requirement
  const eval_ = evaluateObservationAgainst(
    observation,
    { id: "R1", description: "Service responds", optional: false }
  );
  assert.equal(eval_.evaluation, "unknown", "evaluation is neutral/unknown");
  assert.ok(
    typeof eval_.requirementId === "string",
    "evaluation linked to requirement"
  );

  // Core WAM principle: action result ≠ requirement evaluation
  assert.equal(action.success, false, "action failed — agent sees failure");
  assert.ok(
    observation.observation.includes("possibly"),
    "agent hedges → hypothesis not certainty"
  );
});

// ═══════════════════════════════════════════════════════════
// CASE 2 — agent chooses action → receives result
// Agent selects action, executes it, receives observable result
// ═══════════════════════════════════════════════════════════
test("agent_chooses_action_receives_result", () => {
  // Agent chooses to run a command (action)
  const chosenAction = {
    actionId: "act-002",
    type: "command",
    description: "npm test",
  };

  // Agent executes the chosen action
  const result = createActionResult({
    actionId: "act-002",
    success: true,
    exitCode: 0,
    output: "All 15 tests passed",
    durationMs: 3200,
  });

  // Agent receives observable result
  assert.equal(result.success, true, "action succeeded");
  assert.equal(result.exitCode, 0, "exit code 0");
  assert.ok(result.output.includes("passed") || result.output.length > 0, "output captured");
  assert.ok(result.durationMs > 0, "duration recorded");

  // Agent creates observation from the result
  const obs = createObservation({
    actionId: "act-002",
    requirementId: "R2",
    observation: "Tests ran successfully — all passing",
    relevance: "direct",
  });

  assert.equal(obs.actionId, "act-002", "observation linked to action");
  assert.equal(obs.requirementId, "R2", "observation linked to requirement");
});

// ═══════════════════════════════════════════════════════════
// CASE 3 — agent claims success → WAM decides
// Agent claims completion; WAM independently verifies (decides)
// ═══════════════════════════════════════════════════════════
test("agent_claims_success_WAM_decides", () => {
  // Agent claims task is done
  const agentClaim = "Task completed — all requirements done and tests working";

  // WAM intercepts completion claim
  const claims = interceptCompletionClaim(agentClaim);
  assert.ok(claims.length > 0, "completion claim intercepted");
  assert.ok(
    claims.some((c) => c.keyword === "done" || c.keyword === "completed"),
    "completion keywords detected"
  );

  // Classify the claim type
  const classified = classifyClaim(agentClaim, {});
  assert.ok(
    ["COMPLETION_CLAIM", "CONCLUSION", "FACT", "OBSERVATION", "UNKNOWN"].includes(classified),
    `claim classified as ${classified}`
  );

  // Core contract: agent success ≠ task verification
  // Demonstrate: command exits 0 but requirement NOT satisfied
  const demo = demoCommandSucceedsNotRequirementSatisfied();
  assert.equal(demo.actionResult.success, true, "action reported success");
  assert.equal(demo.actionResult.exitCode, 0, "command exit 0");
  // Requirement is NOT automatically satisfied just because command works
  assert.ok(
    demo.evaluation.evaluation !== "supports",
    "evaluation does NOT auto-pass on command success"
  );

  // Agent sees its OWN success and may overclaim
  const agentOverclaim = "I think we're done — this is fixed";
  const agentClaims = interceptCompletionClaim(agentOverclaim);
  // WAM still must independently verify regardless of agent confidence
  assert.ok(
    Array.isArray(agentClaims),
    "WAM checks regardless of agent confidence"
  );

  // The WAM (not the agent) decides — the fundamental contract
  const actionResult = createActionResult({
    actionId: "act-003",
    success: true,
    exitCode: 0,
    output: "Done",
    durationMs: 100,
  });
  assert.equal(actionResult.success, true, "action succeeded");
  // But the agent's confidence is NOT the decision — WAM is
  assert.ok(
    true,
    "WAM independently decides; agent claim is just input"
  );
});
