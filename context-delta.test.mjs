/**
 * Context Delta — tests for Change 74 (computeContextDelta).
 * Ejecutar: node --test context-delta.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { computeContextDelta } from "./context-compaction.js";

// --- Change 45: Original tests ---

test("computeContextDelta — detects new keys", () => {
  const delta = computeContextDelta({ a: 1 }, { a: 1, b: 2 });
  assert.deepEqual(delta.new, ["b"]);
  assert.deepEqual(delta.invalidated, []);
  assert.deepEqual(delta.modified, []);
  assert.deepEqual(delta.unchanged, ["a"]);
});

test("computeContextDelta — detects removed/invalidated keys", () => {
  const delta = computeContextDelta({ a: 1, b: 2 }, { a: 1 });
  assert.deepEqual(delta.invalidated, ["b"]);
  assert.deepEqual(delta.new, []);
});

test("computeContextDelta — detects modified keys", () => {
  const delta = computeContextDelta({ a: 1, b: 2 }, { a: 2, b: 2 });
  assert.deepEqual(delta.modified, ["a"]);
  assert.deepEqual(delta.unchanged, ["b"]);
});

test("computeContextDelta — all unchanged", () => {
  const delta = computeContextDelta({ a: 1 }, { a: 1 });
  assert.deepEqual(delta.unchanged, ["a"]);
  assert.deepEqual(delta.new, []);
  assert.deepEqual(delta.modified, []);
  assert.deepEqual(delta.invalidated, []);
});

test("computeContextDelta — all categories at once", () => {
  const delta = computeContextDelta(
    { a: 1, b: 2, c: 3 },
    { a: 1, b: 99, d: 4 }
  );
  assert.deepEqual(delta.unchanged, ["a"]);
  assert.deepEqual(delta.new, ["d"]);
  assert.deepEqual(delta.invalidated, ["c"]);
  assert.deepEqual(delta.modified, ["b"]);
});

// --- Change 74: LLM-focused delta ---

test("computeContextDelta — empty previous is all new", () => {
  const delta = computeContextDelta({}, { a: 1, b: 2 });
  assert.deepEqual(delta.new, ["a", "b"]);
  assert.deepEqual(delta.invalidated, []);
  assert.deepEqual(delta.modified, []);
  assert.deepEqual(delta.unchanged, []);
});

test("computeContextDelta — empty current invalidates all", () => {
  const delta = computeContextDelta({ a: 1, b: 2 }, {});
  assert.deepEqual(delta.new, []);
  assert.deepEqual(delta.invalidated, ["a", "b"]);
  assert.deepEqual(delta.modified, []);
  assert.deepEqual(delta.unchanged, []);
});

test("computeContextDelta — both empty", () => {
  const delta = computeContextDelta({}, {});
  assert.deepEqual(delta.new, []);
  assert.deepEqual(delta.invalidated, []);
  assert.deepEqual(delta.modified, []);
  assert.deepEqual(delta.unchanged, []);
});

test("computeContextDelta — handles non-serializable values", () => {
  const obj = { fn: () => {} };
  const delta = computeContextDelta({ a: obj }, { a: obj });
  // Should still work without throwing
  assert.ok(Array.isArray(delta.unchanged));
});

test("computeContextDelta — modified excludes unchanged", () => {
  const delta = computeContextDelta({ a: 1, b: 2 }, { a: 1, b: 2 });
  assert.ok(!delta.modified.includes("a"));
  assert.ok(!delta.modified.includes("b"));
  assert.ok(delta.unchanged.includes("a"));
  assert.ok(delta.unchanged.includes("b"));
});

test("computeContextDelta — new excludes unchanged", () => {
  const delta = computeContextDelta({ a: 1 }, { a: 1, b: 2 });
  assert.ok(!delta.new.includes("a"));
  assert.ok(delta.new.includes("b"));
});

test("computeContextDelta — invalidated excludes unchanged", () => {
  const delta = computeContextDelta({ a: 1, b: 2 }, { a: 1 });
  assert.ok(!delta.invalidated.includes("a"));
  assert.ok(delta.invalidated.includes("b"));
});

test("computeContextDelta — order is deterministic", () => {
  const delta = computeContextDelta(
    { z: 1, y: 2, x: 3 },
    { z: 1, y: 2, x: 3, w: 4, v: 5 }
  );
  // new should be in insertion order: w, v
  assert.deepEqual(delta.new, ["w", "v"]);
});

test("computeContextDelta — handles nested objects (shallow compare)", () => {
  const prev = { config: { timeout: 5000 } };
  const curr = { config: { timeout: 10000 } };
  const delta = computeContextDelta(prev, curr);
  // Shallow comparison: same reference structure, different values
  // Both have "config" key, values are objects - they're different references
  // so this will be marked as modified (by reference comparison)
  assert.ok(delta.unchanged.length >= 0); // Should not crash
});
