/**
 * Tests for Rate Limiter.
 * Run: node --test rate/rate-limiter.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "./rate-limiter.js";

test("rateLimiter: allows up to limit", () => {
  const rl = createRateLimiter({ limit: 3, windowMs: 1000 });
  assert.equal(rl.tryAcquire(), true);
  assert.equal(rl.tryAcquire(), true);
  assert.equal(rl.tryAcquire(), true);
});

test("rateLimiter: rejects beyond limit", () => {
  const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
  rl.tryAcquire();
  rl.tryAcquire();
  assert.equal(rl.tryAcquire(), false);
});

test("rateLimiter: remaining decreases as used", () => {
  const rl = createRateLimiter({ limit: 5, windowMs: 1000 });
  assert.equal(rl.remaining(), 5);
  rl.tryAcquire();
  rl.tryAcquire();
  assert.equal(rl.remaining(), 3);
});

test("rateLimiter: used counts in window", () => {
  const rl = createRateLimiter({ limit: 5, windowMs: 1000 });
  rl.tryAcquire();
  rl.tryAcquire();
  assert.equal(rl.used(), 2);
});

test("rateLimiter: window resets after windowMs", async () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 30 });
  assert.equal(rl.tryAcquire(), true);
  assert.equal(rl.tryAcquire(), false);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(rl.tryAcquire(), true);
});

test("rateLimiter: reset clears counter immediately", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 10000 });
  assert.equal(rl.tryAcquire(), true);
  assert.equal(rl.tryAcquire(), false);
  rl.reset();
  assert.equal(rl.tryAcquire(), true);
});

test("rateLimiter: defaults to limit=5 windowMs=1000", () => {
  const rl = createRateLimiter();
  for (let i = 0; i < 5; i++) assert.equal(rl.tryAcquire(), true);
  assert.equal(rl.tryAcquire(), false);
});
