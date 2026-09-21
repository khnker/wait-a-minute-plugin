// strategy-identity.test.mjs
// Tests for canonical hashing and identity of approvedStrategy objects.
//
// Verifies:
//   - createStrategyIdentity / normalizeStrategy / hashStrategy / sameStrategy exports
//   - Canonical hash is stable across property reordering
//   - Canonical hash is stable against ephemeral fields (timestamps, IDs, attempt counters)
//   - Canonical hash differentiates semantic changes
//   - Nested objects are normalized recursively
//   - Arrays under SORTED_ARRAY_KEYS are normalized by sorted JSON
//   - sameStrategy returns true for equivalent inputs and false for differing inputs
//   - Null/undefined input is handled gracefully

import test from "node:test";
import assert from "node:assert/strict";
import {
  createStrategyIdentity,
  normalizeStrategy,
  hashStrategy,
  sameStrategy,
} from "./strategy-identity.js";

const baseStrategy = () => ({
  strategy: "Modernizar escrapper-eltarro con OpenSpec",
  scope: "scrapper-eltarro",
  status: "ACTIVE",
  allowedActions: ["read_file", "edit_file"],
  prohibitedActions: ["delete_file", "exec"],
  createdAt: "2026-09-21T10:00:00.000Z",
  updatedAt: "2026-09-21T11:00:00.000Z",
  instanceId: "run-abc-123",
});

test("module exports the four identity functions", () => {
  assert.equal(typeof createStrategyIdentity, "function");
  assert.equal(typeof normalizeStrategy, "function");
  assert.equal(typeof hashStrategy, "function");
  assert.equal(typeof sameStrategy, "function");
});

test("createStrategyIdentity returns canonical, hash, and ephemeral fields", () => {
  const id = createStrategyIdentity(baseStrategy());
  assert.ok(id.canonical, "canonical must be present");
  assert.ok(id.hash, "hash must be present");
  assert.match(id.hash, /^[0-9a-f]{64}$/);
  assert.ok(Array.isArray(id.ephemeral));
});

test("ephemeral list captures all volatile keys (top-level + nested)", () => {
  const id = createStrategyIdentity({
    ...baseStrategy(),
    nested: {
      runId: "nested-1",
      keep: "stay",
      ts: 12345,
    },
  });
  assert.ok(id.ephemeral.includes("createdAt"));
  assert.ok(id.ephemeral.includes("updatedAt"));
  assert.ok(id.ephemeral.includes("instanceId"));
  assert.ok(id.ephemeral.includes("nested.runId"));
  assert.ok(id.ephemeral.includes("nested.ts"));
});

test("canonical projection strips volatile keys", () => {
  const id = createStrategyIdentity(baseStrategy());
  assert.equal(id.canonical.createdAt, undefined);
  assert.equal(id.canonical.updatedAt, undefined);
  assert.equal(id.canonical.instanceId, undefined);
});

test("hash is stable against property reordering at top level", () => {
  const a = baseStrategy();
  const b = {
    status: a.status,
    strategy: a.strategy,
    allowedActions: a.allowedActions,
    prohibitedActions: a.prohibitedActions,
    scope: a.scope,
    updatedAt: a.updatedAt,
    createdAt: a.createdAt,
    instanceId: a.instanceId,
  };
  assert.equal(hashStrategy(a), hashStrategy(b));
});

test("hash is stable against property reordering in nested objects", () => {
  const a = {
    strategy: "x",
    meta: { b: 2, a: 1, c: 3 },
    status: "ACTIVE",
  };
  const b = {
    status: "ACTIVE",
    meta: { c: 3, a: 1, b: 2 },
    strategy: "x",
  };
  assert.equal(hashStrategy(a), hashStrategy(b));
});

test("hash is stable against timestamp differences", () => {
  const a = { ...baseStrategy(), createdAt: "2026-01-01T00:00:00.000Z" };
  const b = { ...baseStrategy(), createdAt: "2030-12-31T23:59:59.999Z" };
  assert.equal(hashStrategy(a), hashStrategy(b));
});

test("hash is stable against ephemeral ID churn", () => {
  const a = { ...baseStrategy(), instanceId: "run-1" };
  const b = { ...baseStrategy(), instanceId: "run-2", sessionId: "sess-99" };
  const c = { ...baseStrategy(), instanceId: "run-3", traceId: "trace-xyz" };
  assert.equal(hashStrategy(a), hashStrategy(b));
  assert.equal(hashStrategy(a), hashStrategy(c));
});

test("hash differs when strategy text changes", () => {
  const a = baseStrategy();
  const b = { ...baseStrategy(), strategy: "Different strategy text" };
  assert.notEqual(hashStrategy(a), hashStrategy(b));
});

test("hash differs when scope changes", () => {
  const a = baseStrategy();
  const b = { ...baseStrategy(), scope: "different-scope" };
  assert.notEqual(hashStrategy(a), hashStrategy(b));
});

test("hash differs when status changes", () => {
  const a = baseStrategy();
  const b = { ...baseStrategy(), status: "PAUSED" };
  assert.notEqual(hashStrategy(a), hashStrategy(b));
});

test("hash differs when allowedActions differ", () => {
  const a = baseStrategy();
  const b = { ...baseStrategy(), allowedActions: ["read_file", "write_file"] };
  assert.notEqual(hashStrategy(a), hashStrategy(b));
});

test("hash differs when prohibitedActions differ", () => {
  const a = baseStrategy();
  const b = { ...baseStrategy(), prohibitedActions: ["delete_file"] };
  assert.notEqual(hashStrategy(a), hashStrategy(b));
});

test("allowedActions array is normalized by sorted content", () => {
  const a = baseStrategy();
  const b = { ...baseStrategy(), allowedActions: ["edit_file", "read_file"] }; // reversed
  assert.equal(hashStrategy(a), hashStrategy(b));
});

test("hash is deterministic across repeated calls", () => {
  const s = baseStrategy();
  const h1 = hashStrategy(s);
  const h2 = hashStrategy(s);
  const h3 = hashStrategy({ ...s });
  assert.equal(h1, h2);
  assert.equal(h1, h3);
});

test("sameStrategy returns true for equivalent strategies", () => {
  const a = baseStrategy();
  const b = { ...baseStrategy(), createdAt: "different", instanceId: "different" };
  assert.equal(sameStrategy(a, b), true);
});

test("sameStrategy returns false for semantically different strategies", () => {
  const a = baseStrategy();
  const b = { ...baseStrategy(), strategy: "Other" };
  assert.equal(sameStrategy(a, b), false);
});

test("sameStrategy handles null and undefined inputs", () => {
  assert.equal(sameStrategy(null, null), true);
  assert.equal(sameStrategy(undefined, undefined), true);
  assert.equal(sameStrategy(null, baseStrategy()), false);
  assert.equal(sameStrategy(baseStrategy(), null), false);
});

test("normalizeStrategy returns null for null/undefined input", () => {
  assert.equal(normalizeStrategy(null), null);
  assert.equal(normalizeStrategy(undefined), null);
});

test("normalizeStrategy projects keys in sorted order (canonical form)", () => {
  const c = normalizeStrategy({ b: 1, a: 2, c: 3 });
  assert.deepEqual(Object.keys(c), ["a", "b", "c"]);
});

test("normalizeStrategy preserves deep nested structure semantically", () => {
  const input = {
    strategy: "x",
    meta: { level: 2, tags: ["b", "a"], extra: { z: 1, y: 2 } },
  };
  const out = normalizeStrategy(input);
  assert.equal(out.meta.tags[0], "a"); // sorted
  assert.equal(out.meta.tags[1], "b");
  assert.deepEqual(Object.keys(out.meta.extra), ["y", "z"]);
});

test("createStrategyIdentity is idempotent for equivalent inputs", () => {
  const a = createStrategyIdentity(baseStrategy());
  const b = createStrategyIdentity({
    ...baseStrategy(),
    createdAt: "2099-01-01T00:00:00.000Z",
  });
  assert.equal(a.hash, b.hash);
  assert.deepEqual(a.canonical, b.canonical);
});

test("canonical hash is hex sha256 (64 chars)", () => {
  const id = createStrategyIdentity(baseStrategy());
  assert.equal(id.hash.length, 64);
  assert.match(id.hash, /^[0-9a-f]+$/);
});
