import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FailureClass,
  classifyObservation,
  generateCandidateCauses,
  deriveDiscriminatingExperiment,
  assessCause,
  diagnose,
  antiBotSupport,
} from "./diagnostic-engine.js";
import { AssessmentResult } from "../assessment/assessment-rules.js";

// ─────────────────────────────────────────────────────────────────────────────
// classifyObservation
// ─────────────────────────────────────────────────────────────────────────────

test("classifyObservation: missing executable → MISSING_EXECUTABLE", () => {
  const cls = classifyObservation({
    errorCode: "ENOENT",
    message: "browserType.launch: Executable doesn't exist at /home/user/.cache/ms-playwright/chromium-1/chrome-linux/chrome",
    name: "Error",
  });
  assert.equal(cls, FailureClass.MISSING_EXECUTABLE);
});

test("classifyObservation: anti-bot 403 → ANTI_BOT", () => {
  const cls = classifyObservation({
    statusCode: 403,
    message: "Forbidden",
  });
  assert.equal(cls, FailureClass.ANTI_BOT);
});

test("classifyObservation: captcha keyword → ANTI_BOT", () => {
  const cls = classifyObservation({
    message: "Cloudflare captcha detected; please verify you are human.",
  });
  assert.equal(cls, FailureClass.ANTI_BOT);
});

test("classifyObservation: ECONNREFUSED → NETWORK_ERROR", () => {
  const cls = classifyObservation({
    errorCode: "ECONNREFUSED",
    message: "connect ECONNREFUSED 127.0.0.1:443",
  });
  assert.equal(cls, FailureClass.NETWORK_ERROR);
});

test("classifyObservation: 401 → AUTH", () => {
  const cls = classifyObservation({
    statusCode: 401,
    message: "Unauthorized",
  });
  assert.equal(cls, FailureClass.AUTH);
});

test("classifyObservation: 429 → ANTI_BOT (status-code-first rule)", () => {
  // Status code 429 should win because ANTI_BOT lists 429 in its statusCodes.
  const cls = classifyObservation({
    statusCode: 429,
    message: "Too many requests",
  });
  assert.equal(cls, FailureClass.ANTI_BOT);
});

test("classifyObservation: navigation timeout → BROWSER_RUNTIME", () => {
  const cls = classifyObservation({
    errorCode: "NavigationTimeout",
    message: "Page.navigate: Timeout 30000ms exceeded.",
  });
  assert.equal(cls, FailureClass.BROWSER_RUNTIME);
});

test("classifyObservation: unknown → UNKNOWN", () => {
  const cls = classifyObservation({
    errorCode: "WEIRD_THING",
    message: "Some novel failure mode",
  });
  assert.equal(cls, FailureClass.UNKNOWN);
});

test("classifyObservation: null → UNKNOWN", () => {
  assert.equal(classifyObservation(null), FailureClass.UNKNOWN);
});

// ─────────────────────────────────────────────────────────────────────────────
// generateCandidateCauses
// ─────────────────────────────────────────────────────────────────────────────

test("generateCandidateCauses: MISSING_EXECUTABLE yields MISSING_EXECUTABLE candidate", () => {
  const cands = generateCandidateCauses(FailureClass.MISSING_EXECUTABLE);
  assert.ok(cands.length > 0);
  assert.ok(cands.some((c) => c.id === "MISSING_EXECUTABLE"));
});

test("generateCandidateCauses: ANTI_BOT yields WAF_BLOCK", () => {
  const cands = generateCandidateCauses(FailureClass.ANTI_BOT);
  assert.ok(cands.some((c) => c.id === "WAF_BLOCK"));
});

test("generateCandidateCauses: UNKNOWN yields UNCLASSIFIED", () => {
  const cands = generateCandidateCauses(FailureClass.UNKNOWN);
  assert.equal(cands[0].id, "UNCLASSIFIED");
});

// ─────────────────────────────────────────────────────────────────────────────
// deriveDiscriminatingExperiment
// ─────────────────────────────────────────────────────────────────────────────

test("deriveDiscriminatingExperiment: MISSING_EXECUTABLE → shell probe", () => {
  const cand = generateCandidateCauses(FailureClass.MISSING_EXECUTABLE)[0];
  const exp = deriveDiscriminatingExperiment(cand);
  assert.equal(exp.kind, "shell");
  assert.equal(exp.candidateId, cand.id);
  assert.ok(typeof exp.command === "string" && exp.command.length > 0);
});

test("deriveDiscriminatingExperiment: WAF_BLOCK → http probe", () => {
  const cand = generateCandidateCauses(FailureClass.ANTI_BOT)[0];
  const exp = deriveDiscriminatingExperiment(cand);
  assert.equal(exp.kind, "http");
  assert.equal(exp.candidateId, cand.id);
});

test("deriveDiscriminatingExperiment: always returns an expectedObservation", () => {
  const cand = generateCandidateCauses(FailureClass.NETWORK_ERROR)[0];
  const exp = deriveDiscriminatingExperiment(cand);
  assert.ok(exp.expectedObservation);
  assert.equal(typeof exp.expectedObservation, "object");
});

// ─────────────────────────────────────────────────────────────────────────────
// assessCause
// ─────────────────────────────────────────────────────────────────────────────

test("assessCause: matching observation → SUPPORTED", () => {
  const cand = generateCandidateCauses(FailureClass.MISSING_EXECUTABLE)[0];
  const exp = deriveDiscriminatingExperiment(cand);

  const result = assessCause(cand, exp, {
    errorCode: "PRESENT",
    message: "browser executable resolvable",
    statusCode: 200,
  });

  assert.equal(result.result, AssessmentResult.SUPPORTED);
});

test("assessCause: opposite observation → CONTRADICTED", () => {
  const cand = generateCandidateCauses(FailureClass.MISSING_EXECUTABLE)[0];
  const exp = deriveDiscriminatingExperiment(cand);

  const result = assessCause(cand, exp, {
    errorCode: "ENOENT",
    message: "No such file",
  });

  assert.equal(result.result, AssessmentResult.CONTRADICTED);
});

test("assessCause: null observation → INCONCLUSIVE", () => {
  const cand = generateCandidateCauses(FailureClass.MISSING_EXECUTABLE)[0];
  const exp = deriveDiscriminatingExperiment(cand);

  const result = assessCause(cand, exp, null);
  assert.equal(result.result, AssessmentResult.INCONCLUSIVE);
});

test("assessCause: unrelated observation → INCONCLUSIVE", () => {
  const cand = generateCandidateCauses(FailureClass.NETWORK_ERROR)[0];
  const exp = deriveDiscriminatingExperiment(cand);

  const result = assessCause(cand, exp, { unrelated: true });
  assert.equal(result.result, AssessmentResult.INCONCLUSIVE);
});

// ─────────────────────────────────────────────────────────────────────────────
// diagnose orchestrator
// ─────────────────────────────────────────────────────────────────────────────

test("diagnose: returns failureClass + candidates + recommendedExperiment", () => {
  const r = diagnose({
    observation: {
      errorCode: "ENOENT",
      message: "Executable doesn't exist at /path/to/chromium",
    },
  });
  assert.equal(r.failureClass, FailureClass.MISSING_EXECUTABLE);
  assert.ok(r.candidates.length > 0);
  assert.ok(r.recommendedExperiment);
  assert.equal(r.recommendedExperiment.candidateId, r.candidates[0].id);
});

test("diagnose: candidates sorted by prior descending", () => {
  const r = diagnose({ observation: { errorCode: "ECONNREFUSED", message: "refused" } });
  for (let i = 1; i < r.candidates.length; i++) {
    assert.ok(r.candidates[i - 1].prior >= r.candidates[i].prior);
  }
});

test("diagnose: previousDiagnosis boosts re-encountered candidate priors", () => {
  const first = diagnose({
    observation: { errorCode: "ENOENT", message: "Executable doesn't exist" },
  });
  const second = diagnose({
    observation: { errorCode: "ENOENT", message: "Executable doesn't exist" },
    previousDiagnosis: first,
  });
  const firstTop = first.candidates[0];
  const secondTop = second.candidates.find((c) => c.id === firstTop.id);
  assert.ok(secondTop);
  assert.ok(secondTop.prior > firstTop.prior);
});

// ─────────────────────────────────────────────────────────────────────────────
// antiBotSupport heuristic
// ─────────────────────────────────────────────────────────────────────────────

test("antiBotSupport: BROWSER_RUNTIME diagnosis → NOT_SUPPORTED", () => {
  const d = diagnose({
    observation: {
      errorCode: "NavigationTimeout",
      message: "Page.navigate: Timeout 30000ms exceeded.",
    },
  });
  assert.equal(antiBotSupport(d), "NOT_SUPPORTED");
});

test("antiBotSupport: ANTI_BOT diagnosis → SUPPORTED", () => {
  const d = diagnose({ observation: { statusCode: 403, message: "Forbidden" } });
  assert.equal(antiBotSupport(d), "SUPPORTED");
});

test("antiBotSupport: null diagnosis → INCONCLUSIVE", () => {
  assert.equal(antiBotSupport(null), "INCONCLUSIVE");
});

// ─────────────────────────────────────────────────────────────────────────────
// ─── CHROMIUM GOLDEN TEST SCENARIO ──────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

test("Chromium golden: Playwright launch failed (missing executable) → MISSING_EXECUTABLE", () => {
  const observation = {
    errorCode: "ENOENT",
    name: "Error",
    message:
      "browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium-1097/chrome-linux/chrome",
    stack: "Error: Executable doesn't exist ...",
  };

  const d = diagnose({ observation });

  // (a) failure class is BROWSER_RUNTIME-derived → MISSING_EXECUTABLE
  assert.equal(d.failureClass, FailureClass.MISSING_EXECUTABLE);

  // (b) candidate MISSING_EXECUTABLE is generated and top-ranked
  const cand = d.candidates.find((c) => c.id === "MISSING_EXECUTABLE");
  assert.ok(cand, "MISSING_EXECUTABLE candidate must be present");
  assert.equal(d.candidates[0].id, "MISSING_EXECUTABLE");

  // (c) recommended experiment verifies browser installation
  assert.ok(d.recommendedExperiment);
  assert.equal(d.recommendedExperiment.kind, "shell");
  assert.match(d.recommendedExperiment.command, /chromium|chrome|playwright/);

  // (d) anti_bot is NOT supported (agent must NOT auto-assume stealth)
  assert.equal(antiBotSupport(d), "NOT_SUPPORTED");

  // (e) if a probe finds the binary → cause is SUPPORTED
  const exp = d.recommendedExperiment;
  const supported = assessCause(cand, exp, {
    errorCode: "PRESENT",
    message: "browser executable resolvable",
    statusCode: 200,
  });
  assert.equal(supported.result, AssessmentResult.SUPPORTED);
});

test("Chromium golden: subsequent HTTP 403 + captcha → ANTI_BOT", () => {
  // After fixing the executable, the SAME request now hits anti-bot.
  const observation = {
    statusCode: 403,
    message: "Cloudflare captcha detected; please verify you are human.",
  };

  const d = diagnose({ observation });

  assert.equal(d.failureClass, FailureClass.ANTI_BOT);
  assert.ok(d.candidates.some((c) => c.id === "WAF_BLOCK"));
  assert.equal(antiBotSupport(d), "SUPPORTED");
});

test("Chromium golden: full loop — missing exec → ANTI_BOT once browser works", () => {
  // Stage 1: missing executable
  const stage1 = diagnose({
    observation: {
      errorCode: "ENOENT",
      message: "Executable doesn't exist at /cache/chromium/chrome",
    },
  });
  assert.equal(stage1.failureClass, FailureClass.MISSING_EXECUTABLE);
  assert.equal(antiBotSupport(stage1), "NOT_SUPPORTED");

  // Stage 2: with previousDiagnosis context (still missing exec)
  const stage2 = diagnose({
    observation: {
      errorCode: "ENOENT",
      message: "Executable doesn't exist at /cache/chromium/chrome",
    },
    previousDiagnosis: stage1,
  });
  assert.equal(stage2.failureClass, FailureClass.MISSING_EXECUTABLE);
  // MISSING_EXECUTABLE candidate's prior must increase.
  const prior1 = stage1.candidates.find((c) => c.id === "MISSING_EXECUTABLE").prior;
  const prior2 = stage2.candidates.find((c) => c.id === "MISSING_EXECUTABLE").prior;
  assert.ok(prior2 > prior1);

  // Stage 3: after installing, the next failure is anti-bot 403
  const stage3 = diagnose({
    observation: { statusCode: 403, message: "Forbidden — bot detected" },
  });
  assert.equal(stage3.failureClass, FailureClass.ANTI_BOT);
  assert.equal(antiBotSupport(stage3), "SUPPORTED");
});
