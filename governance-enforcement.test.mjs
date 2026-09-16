import { test } from "node:test";
import assert from "node:assert/strict";
import { enforceGovernance } from "./governance-enforcement.js";
import { WamPolicyBlock } from "./risk-engine.js";

test("Governance: mutating tool with APPROVED contract passes", () => {
  assert.doesNotThrow(() =>
    enforceGovernance("write", {
      contract: { status: "APPROVED" },
      phase: "IMPLEMENTING",
    })
  );
});

test("Governance: mutating tool in DONE phase passes", () => {
  assert.doesNotThrow(() =>
    enforceGovernance("edit", {
      contract: { status: "PROPOSED" },
      phase: "DONE",
    })
  );
});

test("Governance: mutating tool with non-APPROVED contract throws WamPolicyBlock", () => {
  assert.throws(
    () =>
      enforceGovernance("write", {
        contract: { status: "PROPOSED" },
        phase: "PROPOSED",
        requirements: [{ status: "pending" }],
      }),
    WamPolicyBlock
  );
});

test("Governance: edit tool without approval throws WamPolicyBlock", () => {
  assert.throws(
    () =>
      enforceGovernance("edit", {
        contract: { status: "PROPOSED" },
        phase: "ASKING",
      }),
    WamPolicyBlock
  );
});

test("Governance: safe tool (read) passes even without approval", () => {
  assert.doesNotThrow(() =>
    enforceGovernance("read", {
      contract: { status: "PROPOSED" },
      phase: "PROPOSED",
    })
  );
});

test("Governance: todo_write (mutating) without approval throws", () => {
  assert.throws(
    () =>
      enforceGovernance("todo_write", {
        contract: { status: "PROPOSED" },
        phase: "PROPOSED",
      }),
    WamPolicyBlock
  );
});

test("Governance: bash (mutating) without approval throws", () => {
  assert.throws(
    () =>
      enforceGovernance("bash", {
        contract: { status: "VERIFYING" },
        phase: "VERIFYING",
      }),
    WamPolicyBlock
  );
});

test("Governance: missing state defaults to blocking", () => {
  assert.throws(
    () => enforceGovernance("write", {}),
    WamPolicyBlock
  );
});

test("Governance: WamPolicyBlock is structured error with wamPolicyBlock flag", () => {
  try {
    enforceGovernance("apply_patch", { contract: { status: "PROPOSED" }, phase: "PROPOSED" });
    assert.fail("Should have thrown");
  } catch (err) {
    assert.equal(err.name, "WamPolicyBlock");
  assert.equal(err?.wamPolicyBlock, true);
    assert.ok(err.policy);
    assert.equal(typeof err.message, "string");
  }
});
