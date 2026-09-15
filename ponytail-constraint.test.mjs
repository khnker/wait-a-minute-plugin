import {
  CONSTRAINT_TYPES,
  applyConstraint,
  isConstraintActive
} from "./ponytail-constraint.js";

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`  FAIL: ${msg}`);
    failed++;
  } else {
    passed++;
  }
}

function test(name, fn) {
  console.log(`Test: ${name}`);
  try {
    fn();
  } catch (e) {
    console.error(`  FAIL: ${e.message}`);
    failed++;
  }
}

// --- CONSTRAINT TYPES ---
test("CONSTRAINT_TYPES has all 4 types", () => {
  assert(CONSTRAINT_TYPES.PONYTAIL === "ponytail", "PONYTAIL = ponytail");
  assert(CONSTRAINT_TYPES.SIMPLIFY === "simplify", "SIMPLIFY = simplify");
  assert(CONSTRAINT_TYPES.SAFETY === "safety", "SAFETY = safety");
  assert(CONSTRAINT_TYPES.SECURITY === "security", "SECURITY = security");
});

// --- APPLY CONSTRAINT ---
test("applyConstraint: no active constraints — policy unchanged", () => {
  const policy = { actions: ["a1", "a2", "a3", "a4", "a5"], complexity: 8 };
  const result = applyConstraint(policy, []);
  assert(result.actions.length === 5, "actions unchanged");
  assert(result.constrained !== true, "not constrained");
  assert(result.simplified !== true, "not simplified");
});

test("applyConstraint: all constraints inactive — policy unchanged", () => {
  const policy = { actions: ["a1", "a2", "a3", "a4", "a5"], complexity: 8 };
  const result = applyConstraint(policy, [
    { type: CONSTRAINT_TYPES.PONYTAIL, active: false },
    { type: CONSTRAINT_TYPES.SIMPLIFY, active: false }
  ]);
  assert(result.actions.length === 5, "actions unchanged when inactive");
});

test("applyConstraint: ponytail trims actions to 3", () => {
  const policy = { actions: ["a1", "a2", "a3", "a4", "a5"] };
  const result = applyConstraint(policy, [{ type: CONSTRAINT_TYPES.PONYTAIL, active: true }]);
  assert(result.actions.length === 3, "actions trimmed to 3");
  assert(result.actions[0] === "a1", "first action preserved");
  assert(result.actions[2] === "a3", "third action preserved");
});

test("applyConstraint: ponytail does not trim when <=3 actions", () => {
  const policy = { actions: ["a1", "a2", "a3"] };
  const result = applyConstraint(policy, [{ type: CONSTRAINT_TYPES.PONYTAIL, active: true }]);
  assert(result.actions.length === 3, "actions unchanged when <=3");
  assert(result.constrained !== true, "not constrained when not trimmed");
});

test("applyConstraint: ponytail sets constrained and reason", () => {
  const policy = { actions: ["a1", "a2", "a3", "a4"] };
  const result = applyConstraint(policy, [{ type: CONSTRAINT_TYPES.PONYTAIL, active: true }]);
  assert(result.constrained === true, "constrained=true");
  assert(result.constraintReason === "ponytail", "constraintReason=ponytail");
});

test("applyConstraint: simplify when complexity > 5", () => {
  const policy = { actions: ["a1"], complexity: 8 };
  const result = applyConstraint(policy, [{ type: CONSTRAINT_TYPES.SIMPLIFY, active: true }]);
  assert(result.simplified === true, "simplified=true");
  assert(result.constraintReason === "simplify", "constraintReason=simplify");
});

test("applyConstraint: simplify does not trigger when complexity <= 5", () => {
  const policy = { actions: ["a1"], complexity: 5 };
  const result = applyConstraint(policy, [{ type: CONSTRAINT_TYPES.SIMPLIFY, active: true }]);
  assert(result.simplified !== true, "not simplified at complexity 5");
});

test("applyConstraint: simplify does not trigger when no complexity", () => {
  const policy = { actions: ["a1"] };
  const result = applyConstraint(policy, [{ type: CONSTRAINT_TYPES.SIMPLIFY, active: true }]);
  assert(result.simplified !== true, "not simplified when complexity undefined");
});

test("applyConstraint: both ponytail and simplify apply together", () => {
  const policy = { actions: ["a1", "a2", "a3", "a4", "a5"], complexity: 8 };
  const result = applyConstraint(policy, [
    { type: CONSTRAINT_TYPES.PONYTAIL, active: true },
    { type: CONSTRAINT_TYPES.SIMPLIFY, active: true }
  ]);
  assert(result.actions.length === 3, "ponytail applied");
  assert(result.constrained === true, "constrained=true");
  assert(result.simplified === true, "simplified=true");
});

test("applyConstraint: safety and security constraints don't modify policy", () => {
  const policy = { actions: ["a1", "a2", "a3", "a4", "a5"] };
  const result = applyConstraint(policy, [
    { type: CONSTRAINT_TYPES.SAFETY, active: true },
    { type: CONSTRAINT_TYPES.SECURITY, active: true }
  ]);
  assert(result.actions.length === 5, "safety/security don't modify actions");
  assert(result.constrained !== true, "not constrained by safety/security");
});

test("applyConstraint: mutates original policy object", () => {
  const policy = { actions: ["a1", "a2", "a3", "a4", "a5"] };
  applyConstraint(policy, [{ type: CONSTRAINT_TYPES.PONYTAIL, active: true }]);
  assert(policy.actions.length === 3, "original object mutated");
});

// --- IS CONSTRAINT ACTIVE ---
test("isConstraintActive: active constraint found", () => {
  const constraints = [
    { type: CONSTRAINT_TYPES.PONYTAIL, active: true },
    { type: CONSTRAINT_TYPES.SIMPLIFY, active: false }
  ];
  assert(isConstraintActive(constraints, CONSTRAINT_TYPES.PONYTAIL) === true, "ponytail is active");
});

test("isConstraintActive: inactive constraint not found", () => {
  const constraints = [
    { type: CONSTRAINT_TYPES.PONYTAIL, active: false }
  ];
  assert(isConstraintActive(constraints, CONSTRAINT_TYPES.PONYTAIL) === false, "ponytail inactive");
});

test("isConstraintActive: constraint type doesn't exist", () => {
  const constraints = [{ type: CONSTRAINT_TYPES.PONYTAIL, active: true }];
  assert(isConstraintActive(constraints, CONSTRAINT_TYPES.SAFETY) === false, "safety not present");
});

test("isConstraintActive: empty constraints", () => {
  assert(isConstraintActive([], CONSTRAINT_TYPES.PONYTAIL) === false, "empty constraints");
});

test("isConstraintActive: multiple active", () => {
  const constraints = [
    { type: CONSTRAINT_TYPES.PONYTAIL, active: true },
    { type: CONSTRAINT_TYPES.SIMPLIFY, active: true }
  ];
  assert(isConstraintActive(constraints, CONSTRAINT_TYPES.SIMPLIFY) === true, "simplify active");
  assert(isConstraintActive(constraints, CONSTRAINT_TYPES.PONYTAIL) === true, "ponytail active");
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
