/**
 * Tests for Projection Engine.
 * Run: node --test projections/projection.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createProjection } from "./projections.js";

test("projection: getState returns initialState before any event", () => {
  const p = createProjection((s, e) => s, { count: 0 });
  assert.deepEqual(p.getState(), { count: 0 });
});

test("projection: apply updates state and increments version", () => {
  const p = createProjection((s, e) => ({ count: s.count + 1 }), { count: 0 });
  p.apply({ type: "Inc" });
  p.apply({ type: "Inc" });
  assert.deepEqual(p.getState(), { count: 2 });
  assert.equal(p.version(), 2);
});

test("projection: reducer receives event payload", () => {
  const p = createProjection((s, e) => s + e.payload, 0);
  p.apply({ type: "Add", payload: 5 });
  p.apply({ type: "Add", payload: 7 });
  assert.equal(p.getState(), 12);
});

test("projection: reset returns to initial state", () => {
  const p = createProjection((s, e) => ({ count: s.count + 1 }), { count: 0 });
  p.apply({ type: "Inc" });
  p.apply({ type: "Inc" });
  p.reset();
  assert.deepEqual(p.getState(), { count: 0 });
  assert.equal(p.version(), 0);
});

test("projection: works with array initial state", () => {
  const p = createProjection((s, e) => [...s, e.payload], []);
  p.apply({ type: "Push", payload: "a" });
  p.apply({ type: "Push", payload: "b" });
  p.apply({ type: "Push", payload: "c" });
  assert.deepEqual(p.getState(), ["a", "b", "c"]);
});

test("projection: works with null initial state", () => {
  const p = createProjection((s, e) => e.payload ?? s, null);
  p.apply({ type: "Set", payload: "hello" });
  assert.equal(p.getState(), "hello");
});

test("projection: throws if reducer is not a function", () => {
  assert.throws(() => createProjection(null, {}), /reducer/);
});
