/**
 * Tests for Event Bus.
 * Run: node --test comms/event-bus.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createEventBus } from "./event-bus.js";

test("eventBus: emit invokes on handler with payload", () => {
  const bus = createEventBus();
  let received = null;
  bus.on("ping", (p) => { received = p; });
  bus.emit("ping", { value: 42 });
  assert.deepEqual(received, { value: 42 });
});

test("eventBus: multiple handlers all fire", () => {
  const bus = createEventBus();
  let a = 0, b = 0;
  bus.on("x", () => a++);
  bus.on("x", () => b++);
  bus.emit("x");
  assert.equal(a, 1);
  assert.equal(b, 1);
});

test("eventBus: off removes handler", () => {
  const bus = createEventBus();
  let count = 0;
  const fn = () => count++;
  bus.on("y", fn);
  bus.emit("y");
  bus.off("y", fn);
  bus.emit("y");
  assert.equal(count, 1);
});

test("eventBus: on returns unsubscribe function", () => {
  const bus = createEventBus();
  let count = 0;
  const unsub = bus.on("z", () => count++);
  bus.emit("z");
  unsub();
  bus.emit("z");
  assert.equal(count, 1);
});

test("eventBus: emit with no listeners is no-op", () => {
  const bus = createEventBus();
  bus.emit("nothing"); // must not throw
});

test("eventBus: listener errors do not break other handlers", () => {
  const bus = createEventBus();
  let ran = false;
  bus.on("e", () => { throw new Error("x"); });
  bus.on("e", () => { ran = true; });
  bus.emit("e");
  assert.equal(ran, true);
});

test("eventBus: listenerCount reflects registrations", () => {
  const bus = createEventBus();
  bus.on("a", () => {});
  bus.on("a", () => {});
  bus.on("b", () => {});
  assert.equal(bus.listenerCount("a"), 2);
  assert.equal(bus.listenerCount("b"), 1);
  assert.equal(bus.listenerCount("c"), 0);
});

test("eventBus: removeAllListeners clears all", () => {
  const bus = createEventBus();
  bus.on("a", () => {});
  bus.on("b", () => {});
  bus.removeAllListeners();
  assert.equal(bus.listenerCount("a"), 0);
  assert.equal(bus.listenerCount("b"), 0);
});
