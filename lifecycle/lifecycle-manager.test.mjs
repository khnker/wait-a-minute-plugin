/**
 * Tests for Lifecycle Manager.
 * Run: node --test lifecycle/lifecycle-manager.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createLifecycleManager } from "./lifecycle-manager.js";

test("lifecycle: initial state is stopped", () => {
  const lm = createLifecycleManager();
  assert.equal(lm.getState(), "stopped");
  assert.equal(lm.isRunning(), false);
});

test("lifecycle: start transitions to running and fires events", async () => {
  const lm = createLifecycleManager();
  const events = [];
  lm.on("state", (e) => events.push(e.payload));
  await lm.start();
  assert.equal(lm.getState(), "running");
  assert.equal(lm.isRunning(), true);
  // stopped -> starting -> running
  assert.deepEqual(events.map((e) => e.to), ["starting", "running"]);
});

test("lifecycle: stop transitions back to stopped", async () => {
  const lm = createLifecycleManager();
  await lm.start();
  await lm.stop();
  assert.equal(lm.getState(), "stopped");
  assert.equal(lm.isRunning(), false);
});

test("lifecycle: components are started in order and stopped in reverse", async () => {
  const order = [];
  const lm = createLifecycleManager({
    components: [
      { name: "a", onStart: () => { order.push("a-start"); }, onStop: () => { order.push("a-stop"); } },
      { name: "b", onStart: () => { order.push("b-start"); }, onStop: () => { order.push("b-stop"); } },
      { name: "c", onStart: () => { order.push("c-start"); }, onStop: () => { order.push("c-stop"); } },
    ],
  });
  await lm.start();
  await lm.stop();
  assert.deepEqual(order, ["a-start", "b-start", "c-start", "c-stop", "b-stop", "a-stop"]);
});

test("lifecycle: start is idempotent", async () => {
  const lm = createLifecycleManager();
  await lm.start();
  await lm.start(); // no-op
  assert.equal(lm.getState(), "running");
});

test("lifecycle: on returns unsubscribe fn", () => {
  const lm = createLifecycleManager();
  const handler = () => {};
  const unsub = lm.on("state", handler);
  assert.equal(typeof unsub, "function");
  lm.off("state", handler);
});

test("lifecycle: listener errors do not break lifecycle", async () => {
  const lm = createLifecycleManager();
  lm.on("state", () => { throw new Error("boom"); });
  await lm.start();
  assert.equal(lm.getState(), "running");
});
