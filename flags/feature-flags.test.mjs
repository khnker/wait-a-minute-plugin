/**
 * Tests for Feature Flags.
 * Run: node --test flags/feature-flags.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createFeatureFlags } from "./feature-flags.js";

test("featureFlags: isEnabled returns true for set key", () => {
  const ff = createFeatureFlags({ darkMode: true });
  assert.equal(ff.isEnabled("darkMode"), true);
});

test("featureFlags: isEnabled returns fallback for unset key", () => {
  const ff = createFeatureFlags();
  assert.equal(ff.isEnabled("missing"), false);
  assert.equal(ff.isEnabled("missing", true), true);
});

test("featureFlags: set and has", () => {
  const ff = createFeatureFlags();
  assert.equal(ff.has("beta"), false);
  ff.set("beta", true);
  assert.equal(ff.has("beta"), true);
  assert.equal(ff.isEnabled("beta"), true);
});

test("featureFlags: toggle flips value", () => {
  const ff = createFeatureFlags();
  assert.equal(ff.toggle("x"), true);
  assert.equal(ff.toggle("x"), false);
  assert.equal(ff.isEnabled("x"), false);
});

test("featureFlags: list returns all keys", () => {
  const ff = createFeatureFlags({ a: true, b: false });
  ff.set("c", true);
  assert.deepEqual(ff.list().sort(), ["a", "b", "c"]);
});

test("featureFlags: forContext supports per-user override", () => {
  const ff = createFeatureFlags({ beta: false });
  const alice = ff.forContext({ userId: "alice" });
  alice.set("beta", true);
  assert.equal(ff.isEnabled("beta"), false); // global untouched
  assert.equal(alice.isEnabled("beta"), true);
  const bob = ff.forContext({ userId: "bob" });
  assert.equal(bob.isEnabled("beta"), false);
});

test("featureFlags: set coerces to boolean", () => {
  const ff = createFeatureFlags();
  ff.set("x", "yes");
  assert.equal(ff.isEnabled("x"), true);
  ff.set("y", 0);
  assert.equal(ff.isEnabled("y"), false);
});
