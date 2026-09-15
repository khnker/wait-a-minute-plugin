import {
  createVerificationInvalidation,
  checkVerificationDependencies,
  shouldInvalidate
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

// ——— createVerificationInvalidation ———

{
  const requirement = { id: "req-1", status: "VERIFIED" };
  const evidence = [{ id: "ev-1" }, { id: "ev-2" }];
  const invalidation = createVerificationInvalidation(requirement, "dependency changed", evidence);

  assertEqual(invalidation.requirementId, "req-1", "invalidation has requirementId");
  assertEqual(invalidation.previousStatus, "VERIFIED", "invalidation has previousStatus");
  assertEqual(invalidation.newStatus, "UNKNOWN", "invalidation has newStatus UNKNOWN");
  assertEqual(invalidation.reason, "dependency changed", "invalidation has reason");
  assertEqual(invalidation.relatedEvidence, ["ev-1", "ev-2"], "invalidation maps evidence ids");
  assertTrue(typeof invalidation.invalidatedAt === "number" && invalidation.invalidatedAt > 0, "invalidation has invalidatedAt timestamp");
  assertEqual(invalidation.invalidatedBy, "verificationEngine", "invalidation has invalidatedBy");
}

{
  const requirement = { id: "req-2", status: "PASSED" };
  const invalidation = createVerificationInvalidation(requirement, "no evidence");

  assertEqual(invalidation.relatedEvidence, [], "invalidation with no evidence defaults to empty array");
}

// ——— checkVerificationDependencies ———

{
  const requirement = {
    dependencies: [
      { key: "context.A", value: 1 },
      { key: "context.B", value: "hello" }
    ]
  };
  const currentContext = { "context.A": 1, "context.B": "hello" };
  const result = checkVerificationDependencies(requirement, currentContext);

  assertTrue(result.stable, "dependencies stable when no changes");
  assertEqual(result.changes.length, 0, "no changes when stable");
}

{
  const requirement = {
    dependencies: [
      { key: "context.A", value: 1 },
      { key: "context.B", value: "hello" }
    ]
  };
  const currentContext = { "context.A": 2, "context.B": "hello" };
  const result = checkVerificationDependencies(requirement, currentContext);

  assertFalse(result.stable, "dependencies unstable when one changed");
  assertEqual(result.changes.length, 1, "one change detected");
  assertEqual(result.changes[0].dependency, "context.A", "change reports correct key");
  assertEqual(result.changes[0].previous, 1, "change reports previous value");
  assertEqual(result.changes[0].current, 2, "change reports current value");
}

{
  const requirement = { dependencies: [] };
  const result = checkVerificationDependencies(requirement, {});

  assertTrue(result.stable, "no dependencies means stable");
  assertEqual(result.changes.length, 0, "no changes with no dependencies");
}

{
  const requirement = {
    dependencies: [
      { key: "ctx.X", value: undefined },
      { key: "ctx.Y", value: null }
    ]
  };
  const currentContext = { "ctx.X": "new", "ctx.Y": null };
  const result = checkVerificationDependencies(requirement, currentContext);

  assertFalse(result.stable, "undefined to defined is a change");
  assertTrue(result.changes.some(c => c.dependency === "ctx.X"), "detects undefined to defined change");
}

// ——— shouldInvalidate ———

{
  const requirement = {
    id: "req-1",
    status: "VERIFIED",
    verifiedAt: Date.now() - 1000,
    dependencies: [{ key: "ctx.A", value: 1 }]
  };
  const currentContext = { "ctx.A": 1 };
  assertFalse(shouldInvalidate(requirement, currentContext), "not invalidated when fresh and stable");
}

{
  const requirement = {
    id: "req-2",
    status: "VERIFIED",
    verifiedAt: Date.now() - 4000000,
    dependencies: [{ key: "ctx.A", value: 1 }]
  };
  const currentContext = { "ctx.A": 1 };
  assertTrue(shouldInvalidate(requirement, currentContext), "invalidated when stale (default threshold)");
}

{
  const requirement = {
    id: "req-3",
    status: "VERIFIED",
    verifiedAt: Date.now() - 1000,
    dependencies: [{ key: "ctx.A", value: 1 }]
  };
  const currentContext = { "ctx.A": 999 };
  assertTrue(shouldInvalidate(requirement, currentContext), "invalidated when dependencies changed");
}

{
  const requirement = {
    id: "req-4",
    status: "PASSED",
    verifiedAt: Date.now() - 4000000,
    dependencies: [{ key: "ctx.A", value: 1 }]
  };
  const currentContext = { "ctx.A": 999 };
  assertTrue(shouldInvalidate(requirement, currentContext), "invalidated when both stale and dependencies changed");
}

{
  const requirement = { id: "req-5", status: "PASSED" };
  assertFalse(shouldInvalidate(requirement, {}), "not invalidated when no verifiedAt (no verification done)");
}

{
  const requirement = {
    id: "req-6",
    status: "VERIFIED",
    verifiedAt: Date.now() - 100,
    dependencies: []
  };
  assertFalse(shouldInvalidate(requirement, {}, 500), "not invalidated with custom threshold and fresh");
}

// ——— Print results ———

console.log("\n=== Verification Invalidation Tests ===");
results.forEach(r => console.log(r));
console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
