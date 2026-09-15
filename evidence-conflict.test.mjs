/**
 * Evidence conflict detection tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createEvidence,
  detectEvidenceConflict,
  resolveEvidenceConflict,
} from "./evidence.js";

describe("detectEvidenceConflict", () => {
  it("returns null when requirementIds differ", () => {
    const a = createEvidence({ id: "ev-1", requirementId: "req-1", supports: true });
    const b = createEvidence({ id: "ev-2", requirementId: "req-2", supports: false });
    assert.equal(detectEvidenceConflict(a, b), null);
  });

  it("returns null when both support", () => {
    const a = createEvidence({ id: "ev-1", requirementId: "req-1", supports: true });
    const b = createEvidence({ id: "ev-2", requirementId: "req-1", supports: true });
    assert.equal(detectEvidenceConflict(a, b), null);
  });

  it("returns null when both contradict", () => {
    const a = createEvidence({ id: "ev-1", requirementId: "req-1", supports: false });
    const b = createEvidence({ id: "ev-2", requirementId: "req-1", supports: false });
    assert.equal(detectEvidenceConflict(a, b), null);
  });

  it("returns CONFLICT when one supports and other contradicts", () => {
    const a = createEvidence({ id: "ev-1", requirementId: "req-1", supports: true });
    const b = createEvidence({ id: "ev-2", requirementId: "req-1", supports: false });
    const conflict = detectEvidenceConflict(a, b);
    assert.equal(conflict.type, "CONFLICT");
    assert.equal(conflict.evidenceA.id, "ev-1");
    assert.equal(conflict.evidenceA.supports, true);
    assert.equal(conflict.evidenceB.id, "ev-2");
    assert.equal(conflict.evidenceB.supports, false);
    assert.equal(conflict.resolved, false);
  });

  it("works with supports=false and supports=true (reversed)", () => {
    const a = createEvidence({ id: "ev-1", requirementId: "req-1", supports: false });
    const b = createEvidence({ id: "ev-2", requirementId: "req-1", supports: true });
    const conflict = detectEvidenceConflict(a, b);
    assert.equal(conflict.type, "CONFLICT");
    assert.equal(conflict.resolved, false);
  });
});

describe("resolveEvidenceConflict", () => {
  it("marks conflict as resolved with accept_a", () => {
    const a = createEvidence({ id: "ev-1", requirementId: "req-1", supports: true });
    const b = createEvidence({ id: "ev-2", requirementId: "req-1", supports: false });
    const conflict = detectEvidenceConflict(a, b);
    const resolved = resolveEvidenceConflict(conflict, "accept_a");
    assert.equal(resolved.resolved, true);
    assert.equal(resolved.resolution, "accept_a");
    assert.ok(resolved.resolvedAt > 0);
    assert.equal(resolved.type, "CONFLICT");
    assert.equal(resolved.evidenceA.id, "ev-1");
    assert.equal(resolved.evidenceB.id, "ev-2");
  });

  it("marks conflict as resolved with accept_b", () => {
    const a = createEvidence({ id: "ev-1", requirementId: "req-1", supports: true });
    const b = createEvidence({ id: "ev-2", requirementId: "req-1", supports: false });
    const conflict = detectEvidenceConflict(a, b);
    const resolved = resolveEvidenceConflict(conflict, "accept_b");
    assert.equal(resolved.resolution, "accept_b");
    assert.equal(resolved.resolved, true);
  });

  it("marks conflict as resolved with invalidate_both", () => {
    const a = createEvidence({ id: "ev-1", requirementId: "req-1", supports: true });
    const b = createEvidence({ id: "ev-2", requirementId: "req-1", supports: false });
    const conflict = detectEvidenceConflict(a, b);
    const resolved = resolveEvidenceConflict(conflict, "invalidate_both");
    assert.equal(resolved.resolution, "invalidate_both");
    assert.equal(resolved.resolved, true);
  });
});
