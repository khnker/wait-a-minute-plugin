/**
 * Requirement ownership tests.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  verifyRequirementOwnership,
  assertCanVerify,
} from "./requirement-ownership.js";

describe("verifyRequirementOwnership", () => {
  it("confirms ownership when owner matches", () => {
    const task = { owner: "alice" };
    const result = verifyRequirementOwnership(task, "alice");
    assert.equal(result.owned, true);
    assert.equal(result.owner, "alice");
  });

  it("confirms ownership via verifiers list", () => {
    const task = { owner: "bob", verifiers: ["alice", "bob"] };
    const result = verifyRequirementOwnership(task, "alice");
    assert.equal(result.owned, true);
  });

  it("rejects non-owner", () => {
    const task = { owner: "bob" };
    const result = verifyRequirementOwnership(task, "alice");
    assert.equal(result.owned, false);
    assert.equal(result.reason, "not-owner");
  });

  it("rejects missing input", () => {
    assert.equal(verifyRequirementOwnership(null, "alice").owned, false);
    assert.equal(verifyRequirementOwnership({ owner: "a" }, null).owned, false);
  });

  it("handles task without owner", () => {
    const task = {};
    const result = verifyRequirementOwnership(task, "alice");
    assert.equal(result.owned, false);
    assert.equal(result.owner, null);
  });
});

describe("assertCanVerify", () => {
  it("allows verification for owned, open task", () => {
    const task = { status: "PENDING", owner: "alice" };
    const result = assertCanVerify(task, "alice");
    assert.equal(result.canVerify, true);
    assert.equal(result.verifier, "alice");
  });

  it("blocks verification for already verified task", () => {
    const task = { status: "VERIFIED", owner: "alice" };
    const result = assertCanVerify(task, "alice");
    assert.equal(result.canVerify, false);
    assert.equal(result.reason, "already-verified");
  });

  it("blocks verification for blocked task", () => {
    const task = { status: "BLOCKED", owner: "alice" };
    const result = assertCanVerify(task, "alice");
    assert.equal(result.canVerify, false);
    assert.equal(result.reason, "blocked");
  });

  it("blocks verification for non-owner", () => {
    const task = { status: "PENDING", owner: "bob" };
    const result = assertCanVerify(task, "alice");
    assert.equal(result.canVerify, false);
    assert.equal(result.reason, "not-owner");
  });

  it("blocks verification for missing task", () => {
    const result = assertCanVerify(null, "alice");
    assert.equal(result.canVerify, false);
    assert.equal(result.reason, "missing-task");
  });

  it("allows verification via verifiers list", () => {
    const task = { status: "PENDING", owner: "bob", verifiers: ["alice"] };
    const result = assertCanVerify(task, "alice");
    assert.equal(result.canVerify, true);
  });
});
