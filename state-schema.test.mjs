// state-schema.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateSchema,
  SCHEMAS,
  STATE_TYPES,
  computeHash,
  seal,
  verify,
  validateSealed,
  canonicalJSON,
} from "./state-schema.js";

test("validateSchema: accepts a valid object", () => {
  const r = validateSchema(
    { type: "object", required: ["a"], properties: { a: { type: "string" } } },
    { a: "hi" }
  );
  assert.equal(r.valid, true);
});

test("validateSchema: rejects missing required", () => {
  const r = validateSchema(
    { type: "object", required: ["a"], properties: { a: { type: "string" } } },
    {}
  );
  assert.equal(r.valid, false);
  assert.ok(r.errors[0].message.includes("missing required"));
});

test("validateSchema: rejects wrong type", () => {
  const r = validateSchema({ type: "string" }, 42);
  assert.equal(r.valid, false);
});

test("validateSchema: rejects additional properties when forbidden", () => {
  const r = validateSchema(
    { type: "object", properties: { a: { type: "string" } }, additionalProperties: false },
    { a: "x", b: "y" }
  );
  assert.equal(r.valid, false);
});

test("validateSchema: enum", () => {
  const r = validateSchema({ enum: ["a", "b"] }, "c");
  assert.equal(r.valid, false);
});

test("validateSchema: pattern", () => {
  const r1 = validateSchema({ type: "string", pattern: "^[0-9]+$" }, "123");
  assert.equal(r1.valid, true);
  const r2 = validateSchema({ type: "string", pattern: "^[0-9]+$" }, "abc");
  assert.equal(r2.valid, false);
});

test("validateSchema: minLength / maxLength", () => {
  assert.equal(validateSchema({ type: "string", minLength: 2 }, "a").valid, false);
  assert.equal(validateSchema({ type: "string", maxLength: 2 }, "abc").valid, false);
  assert.equal(validateSchema({ type: "string", minLength: 2, maxLength: 4 }, "ab").valid, true);
});

test("validateSchema: numeric bounds", () => {
  assert.equal(validateSchema({ type: "number", minimum: 10 }, 9).valid, false);
  assert.equal(validateSchema({ type: "number", maximum: 10 }, 11).valid, false);
});

test("validateSchema: array items", () => {
  const r = validateSchema(
    { type: "array", items: { type: "integer" } },
    [1, 2, "x"]
  );
  assert.equal(r.valid, false);
  assert.ok(r.errors[0].path.includes("[2]"));
});

test("validateSchema: const and nested oneOf", () => {
  const r1 = validateSchema({ const: 5 }, 5);
  assert.equal(r1.valid, true);
  const r2 = validateSchema(
    { oneOf: [{ type: "string" }, { type: "number" }] },
    true
  );
  assert.equal(r2.valid, false);
});

test("STATE_TYPES exposes all five surfaces", () => {
  for (const t of ["assessment", "plan", "evidence", "completion", "drift"]) {
    assert.ok(STATE_TYPES.includes(t), `missing schema for ${t}`);
    assert.ok(SCHEMAS[t], `SCHEMAS missing ${t}`);
  }
});

test("assessment schema rejects missing taskId and result", () => {
  const r = validateSchema(SCHEMAS.assessment, { stateVersion: 1, lastModifiedAt: "x" });
  assert.equal(r.valid, false);
});

test("assessment schema accepts a complete document", () => {
  const r = validateSchema(SCHEMAS.assessment, {
    stateVersion: 1,
    lastModifiedAt: "2026-01-01T00:00:00Z",
    taskId: "t-1",
    result: "PASS",
    summary: "ok",
    findings: [{ path: "x", result: "PASS" }],
  });
  assert.equal(r.valid, true);
});

test("computeHash is deterministic regardless of key order", () => {
  const a = { x: 1, y: 2, z: { a: 1, b: 2 } };
  const b = { z: { b: 2, a: 1 }, y: 2, x: 1 };
  assert.equal(computeHash(a), computeHash(b));
});

test("canonicalJSON is stable", () => {
  const s1 = canonicalJSON({ b: 1, a: 2 });
  const s2 = canonicalJSON({ a: 2, b: 1 });
  assert.equal(s1, s2);
  assert.equal(s1, '{"a":2,"b":1}');
});

test("seal + verify round-trips", () => {
  const payload = { stateVersion: 1, lastModifiedAt: "x", taskId: "t-1", result: "PASS" };
  const s = seal(payload);
  assert.ok("_hash" in s);
  assert.equal(verify(s).valid, true);
});

test("verify detects corruption when payload is tampered", () => {
  const s = seal({ stateVersion: 1, lastModifiedAt: "x", taskId: "t-1", result: "PASS" });
  s.result = "FAIL"; // tamper
  const v = verify(s);
  assert.equal(v.valid, false);
  assert.match(v.reason, /hash mismatch/);
});

test("verify detects missing _hash", () => {
  const v = verify({ stateVersion: 1, lastModifiedAt: "x" });
  assert.equal(v.valid, false);
  assert.match(v.reason, /missing _hash/);
});

test("validateSealed: passes when sealed + schema valid", () => {
  const s = seal({
    stateVersion: 1,
    lastModifiedAt: "2026-01-01T00:00:00Z",
    taskId: "t-1",
    result: "PASS",
  });
  const r = validateSealed(SCHEMAS.assessment, s);
  assert.equal(r.valid, true);
});

test("validateSealed: fails on hash mismatch before checking schema", () => {
  const s = seal({
    stateVersion: 1,
    lastModifiedAt: "2026-01-01T00:00:00Z",
    taskId: "t-1",
    result: "PASS",
  });
  s.result = "GARBAGE";
  const r = validateSealed(SCHEMAS.assessment, s);
  assert.equal(r.valid, false);
  assert.match(r.reason, /corruption/);
});
