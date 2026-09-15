/**
 * Tests for context-output-policy.js (Change 76)
 * Ejecutar: node --test context-output-policy.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  applyOutputPolicy,
  filterByPolicy,
  typePolicyRule,
  scopePolicyRule,
} from "./context-output-policy.js";

// -- applyOutputPolicy -------------------------------------------------------

test("applyOutputPolicy: throws on non-array items", () => {
  assert.throws(() => applyOutputPolicy(null, []), TypeError);
  assert.throws(() => applyOutputPolicy("test", []), TypeError);
});

test("applyOutputPolicy: throws on non-array rules", () => {
  assert.throws(() => applyOutputPolicy([], null), TypeError);
  assert.throws(() => applyOutputPolicy([], "rule"), TypeError);
});

test("applyOutputPolicy: classifies MUST items", () => {
  const items = [
    { id: "1", content: "goal", type: "goal", scope: "session" },
    { id: "2", content: "other", type: "data", scope: "session" },
  ];
  const rules = [typePolicyRule("r1", "MUST", ["goal"], "Goal always needed")];
  const result = applyOutputPolicy(items, rules);
  assert.equal(result.must.length, 1);
  assert.equal(result.must[0].id, "1");
  assert.equal(result.should.length, 0);
  assert.equal(result.excluded.length, 0);
  assert.equal(result.unclassified.length, 1);
  assert.ok(result.includedIds.has("1"));
  assert.ok(!result.includedIds.has("2"));
});

test("applyOutputPolicy: classifies SHOULD items", () => {
  const items = [{ id: "1", type: "evidence", scope: "session" }];
  const rules = [typePolicyRule("r1", "SHOULD", ["evidence"], "Evidence preferred")];
  const result = applyOutputPolicy(items, rules);
  assert.equal(result.should.length, 1);
  assert.ok(result.includedIds.has("1"));
});

test("applyOutputPolicy: classifies DO_NOT_INCLUDE items", () => {
  const items = [{ id: "1", type: "debug_log", scope: "session" }];
  const rules = [typePolicyRule("r1", "DO_NOT_INCLUDE", ["debug_log"], "Logs excluded")];
  const result = applyOutputPolicy(items, rules);
  assert.equal(result.excluded.length, 1);
  assert.ok(!result.includedIds.has("1"));
});

test("applyOutputPolicy: first matching rule wins", () => {
  const items = [{ id: "1", type: "evidence", scope: "session" }];
  const rules = [
    typePolicyRule("r1", "SHOULD", ["evidence"], "Prefer evidence"),
    typePolicyRule("r2", "DO_NOT_INCLUDE", ["evidence"], "Exclude evidence"),
  ];
  const result = applyOutputPolicy(items, rules);
  assert.equal(result.should.length, 1); // First rule wins
  assert.ok(result.includedIds.has("1"));
});

test("applyOutputPolicy: unclassified for no matching rule", () => {
  const items = [{ id: "1", type: "unknown_type", scope: "session" }];
  const result = applyOutputPolicy(items, []);
  assert.equal(result.unclassified.length, 1);
  assert.ok(!result.includedIds.has("1"));
});

test("applyOutputPolicy: skips items without id", () => {
  const items = [{ type: "goal" }, { id: "1", type: "goal" }];
  const rules = [typePolicyRule("r1", "MUST", ["goal"], "Goals must")];
  const result = applyOutputPolicy(items, rules);
  assert.equal(result.must.length, 1);
  assert.equal(result.must[0].id, "1");
});

// -- filterByPolicy ----------------------------------------------------------

test("filterByPolicy: excludes DO_NOT_INCLUDE", () => {
  const items = [
    { id: "1", type: "goal" },
    { id: "2", type: "evidence" },
    { id: "3", type: "debug_log" },
  ];
  const rules = [
    typePolicyRule("r1", "MUST", ["goal"], "Must"),
    typePolicyRule("r2", "SHOULD", ["evidence"], "Should"),
    typePolicyRule("r3", "DO_NOT_INCLUDE", ["debug_log"], "No logs"),
  ];
  const result = filterByPolicy(items, rules);
  assert.equal(result.length, 2);
  assert.ok(result.every((i) => i.type !== "debug_log"));
});

// -- typePolicyRule ----------------------------------------------------------

test("typePolicyRule: creates valid rule", () => {
  const rule = typePolicyRule("r1", "MUST", ["goal", "objective"], "Important");
  assert.equal(rule.id, "r1");
  assert.equal(rule.policy, "MUST");
  assert.ok(typeof rule.match === "function");
  assert.ok(rule.reason.includes("Important"));
});

test("typePolicyRule: match works correctly", () => {
  const rule = typePolicyRule("r1", "SHOULD", ["evidence"], "");
  assert.ok(rule.match({ type: "evidence" }));
  assert.ok(!rule.match({ type: "observation" }));
  assert.ok(!rule.match(null));
});

// -- scopePolicyRule ---------------------------------------------------------

test("scopePolicyRule: creates valid rule", () => {
  const rule = scopePolicyRule("r1", "DO_NOT_INCLUDE", ["debug"], "No debug");
  assert.equal(rule.id, "r1");
  assert.ok(rule.match({ scope: "debug" }));
  assert.ok(!rule.match({ scope: "session" }));
});

test("scopePolicyRule: match handles null item", () => {
  const rule = scopePolicyRule("r1", "MUST", ["session"], "");
  assert.ok(!rule.match(null));
  assert.ok(!rule.match(undefined));
});

// -- Edge cases ---------------------------------------------------------------

test("applyOutputPolicy: empty items returns empty", () => {
  const result = applyOutputPolicy([], []);
  assert.equal(result.must.length, 0);
  assert.equal(result.should.length, 0);
  assert.equal(result.excluded.length, 0);
  assert.equal(result.unclassified.length, 0);
  assert.ok(result.includedIds instanceof Set);
});

test("applyOutputPolicy: all items excluded", () => {
  const items = [{ id: "1", type: "x" }];
  const rules = [typePolicyRule("r1", "DO_NOT_INCLUDE", ["x"], "Excluded")];
  const result = applyOutputPolicy(items, rules);
  assert.equal(result.excluded.length, 1);
  assert.ok(!result.includedIds.has("1"));
});

test("applyOutputPolicy: multiple items of same type", () => {
  const items = [
    { id: "1", type: "goal" },
    { id: "2", type: "goal" },
    { id: "3", type: "goal" },
  ];
  const rules = [typePolicyRule("r1", "MUST", ["goal"], "Must")];
  const result = applyOutputPolicy(items, rules);
  assert.equal(result.must.length, 3);
  assert.ok(result.includedIds.has("1"));
  assert.ok(result.includedIds.has("2"));
  assert.ok(result.includedIds.has("3"));
});
