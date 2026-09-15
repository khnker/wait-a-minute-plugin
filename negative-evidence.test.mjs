/**
 * Negative evidence tests.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resolveConflict } from "./evidence.js";

describe("resolveConflict", () => {
  it("returns null when either evidence is missing", () => {
    assert.equal(resolveConflict(null, { id: "b" }), null);
    assert.equal(resolveConflict({ id: "a" }, null), null);
    assert.equal(resolveConflict(null, null), null);
  });

  it("returns null when supports values are the same", () => {
    const a = { id: "a", requirementId: "req-1", supports: true };
    const b = { id: "b", requirementId: "req-1", supports: true };
    assert.equal(resolveConflict(a, b), null);
  });

  it("detects conflict and returns UNKNOWN when supports differ", () => {
    const a = { id: "ev-a", requirementId: "req-1", supports: true };
    const b = { id: "ev-b", requirementId: "req-1", supports: false };
    const result = resolveConflict(a, b);
    assert.ok(result !== null);
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.reason, "conflicting-evidence");
    assert.deepEqual(result.conflictingIds, ["ev-a", "ev-b"]);
  });

  it("returns null for different requirement IDs", () => {
    const a = { id: "ev-a", requirementId: "req-1", supports: true };
    const b = { id: "ev-b", requirementId: "req-2", supports: false };
    assert.equal(resolveConflict(a, b), null);
  });

  it("handles evidence without explicit supports field", () => {
    const a = { id: "ev-a", requirementId: "req-1" };
    const b = { id: "ev-b", requirementId: "req-1" };
    // both undefined === same → no conflict
    assert.equal(resolveConflict(a, b), null);
  });
});
