/**
 * Tests for Circuit Breaker.
 * Run: node --test circuit/circuit-breaker.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createCircuitBreaker } from "./circuit-breaker.js";

test("breaker: initial state is closed", () => {
  const cb = createCircuitBreaker({ threshold: 3, timeout: 1000 });
  assert.equal(cb.getState(), "closed");
});

test("breaker: stays closed below threshold", async () => {
  const cb = createCircuitBreaker({ threshold: 3, timeout: 1000 });
  const fail = async () => { throw new Error("fail"); };
  for (let i = 0; i < 2; i++) {
    await assert.rejects(() => cb.execute(fail));
  }
  assert.equal(cb.getState(), "closed");
});

test("breaker: opens after threshold failures", async () => {
  const cb = createCircuitBreaker({ threshold: 3, timeout: 1000 });
  const fail = async () => { throw new Error("x"); };
  for (let i = 0; i < 3; i++) {
    await assert.rejects(() => cb.execute(fail));
  }
  assert.equal(cb.getState(), "open");
});

test("breaker: rejects fast when open", async () => {
  const cb = createCircuitBreaker({ threshold: 1, timeout: 10000 });
  await assert.rejects(() => cb.execute(async () => { throw new Error("x"); }));
  assert.equal(cb.getState(), "open");
  await assert.rejects(
    () => cb.execute(async () => "never"),
    /OPEN/,
  );
});

test("breaker: closes on success after failures", async () => {
  const cb = createCircuitBreaker({ threshold: 5, timeout: 1000 });
  let mode = "fail";
  await assert.rejects(() => cb.execute(async () => { throw new Error("x"); }));
  await assert.rejects(() => cb.execute(async () => { throw new Error("x"); }));
  mode = "ok";
  const r = await cb.execute(async () => "ok");
  assert.equal(r, "ok");
  assert.equal(cb.getState(), "closed");
});

test("breaker: half-open transitions to open on probe failure", async () => {
  const cb = createCircuitBreaker({ threshold: 1, timeout: 1 });
  await assert.rejects(() => cb.execute(async () => { throw new Error("x"); }));
  assert.equal(cb.getState(), "open");
  // wait past timeout
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cb.getState(), "half-open");
  await assert.rejects(() => cb.execute(async () => { throw new Error("x"); }));
  assert.equal(cb.getState(), "open");
});

test("breaker: reset returns to closed", async () => {
  const cb = createCircuitBreaker({ threshold: 1, timeout: 10000 });
  await assert.rejects(() => cb.execute(async () => { throw new Error("x"); }));
  assert.equal(cb.getState(), "open");
  cb.reset();
  assert.equal(cb.getState(), "closed");
});

test("breaker: failures() reflects counter", async () => {
  const cb = createCircuitBreaker({ threshold: 5, timeout: 1000 });
  await assert.rejects(() => cb.execute(async () => { throw new Error("x"); }));
  await assert.rejects(() => cb.execute(async () => { throw new Error("x"); }));
  assert.equal(cb.failures(), 2);
});
