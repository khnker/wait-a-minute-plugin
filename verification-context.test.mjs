import {
  CONTEXT_LEVELS,
  loadVerificationContext,
  validateContextBudget,
  DEFAULT_VERIFICATION_BUDGET,
  createVerificationBudget,
  isBudgetExhausted,
  invalidateVerification
} from "./verification-context.js";

let passed = 0;
let failed = 0;
const results = [];

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    results.push(`PASS: ${label}`);
  } else {
    failed++;
    results.push(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(val, label) {
  if (val) { passed++; results.push(`PASS: ${label}`); }
  else { failed++; results.push(`FAIL: ${label} — expected true, got ${val}`); }
}

function assertFalse(val, label) {
  if (!val) { passed++; results.push(`PASS: ${label}`); }
  else { failed++; results.push(`FAIL: ${label} — expected false, got ${val}`); }
}

// ——— CONTEXT_LEVELS constantes ———
assertEqual(CONTEXT_LEVELS.N0, "N0", "CONTEXT_LEVELS.N0 value");
assertEqual(CONTEXT_LEVELS.N1, "N1", "CONTEXT_LEVELS.N1 value");
assertEqual(CONTEXT_LEVELS.N2, "N2", "CONTEXT_LEVELS.N2 value");
assertEqual(CONTEXT_LEVELS.N3, "N3", "CONTEXT_LEVELS.N3 value");

// ——— loadVerificationContext ———
{
  const taskData = {
    requirements: ["req1", "req2"],
    verificationMethods: ["method1"],
    evidence: ["ev1"],
    observations: ["obs1"],
    opportunisticContext: { extra: true }
  };

  const n0 = loadVerificationContext(CONTEXT_LEVELS.N0, taskData);
  assertEqual(n0, { requirements: ["req1", "req2"] }, "load N0 returns requirements only");

  const n1 = loadVerificationContext(CONTEXT_LEVELS.N1, taskData);
  assertEqual(n1, { requirements: ["req1", "req2"], verificationMethods: ["method1"] }, "load N1 returns requirements + methods");

  const n2 = loadVerificationContext(CONTEXT_LEVELS.N2, taskData);
  assertEqual(n2, { requirements: ["req1", "req2"], evidence: ["ev1"], observations: ["obs1"] }, "load N2 returns requirements + evidence + observations");

  const n3 = loadVerificationContext(CONTEXT_LEVELS.N3, taskData);
  assertEqual(n3, { opportunistic: true, context: { extra: true } }, "load N3 returns opportunistic context");

  // Defaults vacíos cuando no hay datos
  const n1Empty = loadVerificationContext(CONTEXT_LEVELS.N1, { requirements: ["r"] });
  assertEqual(n1Empty.verificationMethods, [], "load N1 defaults verificationMethods to []");

  const n2Empty = loadVerificationContext(CONTEXT_LEVELS.N2, { requirements: ["r"] });
  assertEqual(n2Empty.evidence, [], "load N2 defaults evidence to []");
  assertEqual(n2Empty.observations, [], "load N2 defaults observations to []");

  // Default case
  const unknown = loadVerificationContext("N99", taskData);
  assertEqual(unknown, {}, "load unknown level returns {}");
}

// ——— validateContextBudget ———
{
  // Todo cargado → válido
  const full = { N0: true, N1: true, N2: true, N3: true };
  const validResult = validateContextBudget(full, ["N0", "N1", "N2"]);
  assertTrue(validResult.valid, "validate full context is valid");
  assertEqual(validResult.missingLevels, [], "validate full context missingLevels empty");
  assertEqual(validResult.warning, null, "validate full context no warning");

  // Falta N2 → inválido
  const missingN2 = validateContextBudget({ N0: true, N1: true }, ["N0", "N1", "N2"]);
  assertFalse(missingN2.valid, "validate missing N2 is invalid");
  assertEqual(missingN2.missingLevels, ["N2"], "validate missing N2 reports N2");

  // N3 sin N2 → warning
  const n3Substitute = validateContextBudget({ N0: true, N1: true, N3: true }, ["N0", "N1", "N2"]);
  assertFalse(n3Substitute.valid, "validate N3 without N2 is invalid");
  assertEqual(n3Substitute.warning, "N3 context used to substitute missing N2", "validate N3 substitute warning");

  // N3 con N2 → no warning
  const n3WithN2 = validateContextBudget({ N0: true, N1: true, N2: true, N3: true }, ["N0", "N1", "N2"]);
  assertEqual(n3WithN2.warning, null, "validate N3 with N2 no warning");
}

// ——— DEFAULT_VERIFICATION_BUDGET ———
{
  assertEqual(DEFAULT_VERIFICATION_BUDGET.maxActions, 10, "DEFAULT budget maxActions");
  assertEqual(DEFAULT_VERIFICATION_BUDGET.maxTokens, 50000, "DEFAULT budget maxTokens");
  assertEqual(DEFAULT_VERIFICATION_BUDGET.maxLatencyMs, 120000, "DEFAULT budget maxLatencyMs");
  assertEqual(DEFAULT_VERIFICATION_BUDGET.maxRetries, 2, "DEFAULT budget maxRetries");
}

// ——— createVerificationBudget ———
{
  const defaultBudget = createVerificationBudget({});
  assertEqual(defaultBudget, DEFAULT_VERIFICATION_BUDGET, "createBudget no overrides = defaults");

  const customBudget = createVerificationBudget({ maxActions: 5, maxTokens: 10000 });
  assertEqual(customBudget.maxActions, 5, "createBudget override maxActions");
  assertEqual(customBudget.maxTokens, 10000, "createBudget override maxTokens");
  assertEqual(customBudget.maxLatencyMs, 120000, "createBudget keeps default maxLatencyMs");
  assertEqual(customBudget.maxRetries, 2, "createBudget keeps default maxRetries");
}

// ——— isBudgetExhausted ———
{
  const budget = DEFAULT_VERIFICATION_BUDGET;

  assertFalse(isBudgetExhausted(budget, { actions: 0, tokens: 0, latencyMs: 0, retries: 0 }), "budget not exhausted at zero usage");
  assertFalse(isBudgetExhausted(budget, { actions: 5, tokens: 25000, latencyMs: 60000, retries: 1 }), "budget not exhausted below limits");
  assertTrue(isBudgetExhausted(budget, { actions: 10, tokens: 25000, latencyMs: 60000, retries: 1 }), "budget exhausted actions");
  assertTrue(isBudgetExhausted(budget, { actions: 5, tokens: 50000, latencyMs: 60000, retries: 1 }), "budget exhausted tokens");
  assertTrue(isBudgetExhausted(budget, { actions: 5, tokens: 25000, latencyMs: 120000, retries: 1 }), "budget exhausted latency");
  assertTrue(isBudgetExhausted(budget, { actions: 5, tokens: 25000, latencyMs: 60000, retries: 2 }), "budget exhausted retries");
  assertTrue(isBudgetExhausted(budget, { actions: 11, tokens: 60000, latencyMs: 130000, retries: 3 }), "budget exhausted all over");
}

// ——— invalidateVerification ———
{
  const req = { id: "r1", description: "test", status: "VERIFIED" };
  const invalidated = invalidateVerification(req, "observación contradictoria");
  assertEqual(invalidated.status, "UNKNOWN", "invalidate sets status UNKNOWN");
  assertTrue(typeof invalidated.invalidatedAt === "number" && invalidated.invalidatedAt > 0, "invalidate sets invalidatedAt timestamp");
  assertEqual(invalidated.invalidationReason, "observación contradictoria", "invalidate sets invalidationReason");
  assertEqual(invalidated.previousStatus, "VERIFIED", "invalidate preserves previousStatus");
  assertEqual(invalidated.id, "r1", "invalidate preserves requirement id");
  assertEqual(invalidated.description, "test", "invalidate preserves requirement description");

  // No muta el original
  assertEqual(req.status, "VERIFIED", "original requirement not mutated");

  // Invalidar desde otro estado
  const req2 = { id: "r2", status: "FAILED" };
  const inv2 = invalidateVerification(req2, "fallo detectado");
  assertEqual(inv2.previousStatus, "FAILED", "invalidate preserves FAILED previousStatus");
  assertEqual(inv2.status, "UNKNOWN", "invalidate FAILED → UNKNOWN");
}

// ——— Reporte ———
console.log(`\n${passed} passed, ${failed} failed`);
for (const r of results) console.log(r);
if (failed > 0) process.exit(1);
