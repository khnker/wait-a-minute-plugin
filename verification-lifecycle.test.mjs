/**
 * verification-lifecycle tests — verification state machine.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidVerificationState,
  transitionVerification,
  createEvidence,
  isVerified,
  canComplete,
  verifyRequirement,
  failRequirement,
} from "./verification-lifecycle.js";

test("isValidVerificationState accepts all valid states", () => {
  assert.ok(isValidVerificationState("UNVERIFIED"));
  assert.ok(isValidVerificationState("VERIFYING"));
  assert.ok(isValidVerificationState("VERIFIED"));
  assert.ok(isValidVerificationState("FAILED"));
  assert.ok(!isValidVerificationState("DONE"));
  assert.ok(!isValidVerificationState(null));
});

test("transitionVerification allows valid transitions", () => {
  assert.equal(transitionVerification("UNVERIFIED", "VERIFYING"), "VERIFYING");
  assert.equal(transitionVerification("VERIFYING", "VERIFIED"), "VERIFIED");
  assert.equal(transitionVerification("VERIFYING", "FAILED"), "FAILED");
  assert.equal(transitionVerification("FAILED", "VERIFYING"), "VERIFYING");
});

test("transitionVerification rejects invalid transitions", () => {
  assert.throws(() => transitionVerification("UNVERIFIED", "VERIFIED"), /Invalid transition/);
  assert.throws(() => transitionVerification("UNVERIFIED", "FAILED"), /Invalid transition/);
  assert.throws(() => transitionVerification("VERIFIED", "VERIFYING"), /Invalid transition/);
  assert.throws(() => transitionVerification("COMPLETED", "VERIFYING"), /Invalid/);
});

test("createEvidence creates evidence object", () => {
  const ev = createEvidence("test", "pass", "all tests pass");
  assert.equal(ev.method, "test");
  assert.equal(ev.result, "pass");
  assert.equal(ev.details, "all tests pass");
  assert.ok(ev.at > 0);
});

test("createEvidence requires method and result", () => {
  assert.throws(() => createEvidence("", "pass"), /requires method/);
  assert.throws(() => createEvidence("test", ""), /requires method/);
});

test("isVerified checks status and evidence", () => {
  const req = { id: "req-1", verificationStatus: "VERIFIED", evidence: [{ method: "test", result: "pass" }] };
  assert.ok(isVerified(req));
  assert.ok(!isVerified({ ...req, verificationStatus: "UNVERIFIED" }));
  assert.ok(!isVerified({ ...req, evidence: [] }));
  assert.ok(!isVerified({ ...req, evidence: null }));
  assert.ok(!isVerified(null));
});

test("canComplete returns true when all verified", () => {
  const state = {
    requirements: [
      { id: "req-1", verificationStatus: "VERIFIED", evidence: [{ method: "test", result: "pass" }] },
      { id: "req-2", verificationStatus: "VERIFIED", evidence: [{ method: "lint", result: "pass" }] },
    ],
  };
  const result = canComplete(state);
  assert.equal(result.canComplete, true);
  assert.equal(result.unverifiedCount, 0);
});

test("canComplete returns false with unverified requirements", () => {
  const state = {
    requirements: [
      { id: "req-1", verificationStatus: "VERIFIED", evidence: [{ method: "test", result: "pass" }] },
      { id: "req-2", verificationStatus: "UNVERIFIED", evidence: [] },
    ],
  };
  const result = canComplete(state);
  assert.equal(result.canComplete, false);
  assert.equal(result.unverifiedCount, 1);
  assert.deepEqual(result.unverifiedIds, ["req-2"]);
});

test("verifyRequirement updates status and evidence", () => {
  const req = { id: "req-1", verificationStatus: "VERIFYING", evidence: [] };
  const ev = [createEvidence("test", "pass", "unit tests pass")];
  const verified = verifyRequirement(req, ev);
  assert.equal(verified.verificationStatus, "VERIFIED");
  assert.equal(verified.evidence.length, 1);
  assert.equal(verified.evidence[0].method, "test");
});

test("verifyRequirement throws with no evidence", () => {
  const req = { id: "req-1", verificationStatus: "VERIFYING" };
  assert.throws(() => verifyRequirement(req, []), /no evidence/);
});

test("failRequirement updates status and failureReason", () => {
  const req = { id: "req-1", verificationStatus: "VERIFYING" };
  const failed = failRequirement(req, "test suite failed");
  assert.equal(failed.verificationStatus, "FAILED");
  assert.equal(failed.failureReason, "test suite failed");
});
