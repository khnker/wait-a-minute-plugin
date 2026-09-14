/**
 * Freshness Validation tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveVerification,
  findAffectedNodes,
  markStaleOnInvalidation,
  generateFreshnessReport,
} from "./freshness-validation.js";

describe("deriveVerification", () => {
  it("returns false for null node", () => {
    const result = deriveVerification(null);
    assert.equal(result.effectiveVerified, false);
    assert.equal(result.reason, "node not found");
  });

  it("returns false for unverified node", () => {
    const node = { id: "node-1", verified: false };
    const result = deriveVerification(node);
    assert.equal(result.effectiveVerified, false);
    assert.equal(result.reason, "node not verified in graph");
  });

  it("returns true for verified node with no evidence", () => {
    const node = { id: "node-1", verified: true };
    const result = deriveVerification(node, []);
    assert.equal(result.effectiveVerified, true);
  });

  it("returns true for verified node with valid evidence", () => {
    const node = { id: "node-1", verified: true };
    const evidence = [
      { id: "ev-1", status: "valid", updatedAt: Date.now() },
    ];
    const result = deriveVerification(node, evidence);
    assert.equal(result.effectiveVerified, true);
  });

  it("returns false when evidence is invalidated", () => {
    const node = { id: "node-1", verified: true };
    const evidence = [
      { id: "ev-1", status: "invalidated", updatedAt: Date.now() },
    ];
    const result = deriveVerification(node, evidence);
    assert.equal(result.effectiveVerified, false);
    assert.ok(result.reason.includes("invalidated"));
  });

  it("returns false when all evidence is superseded", () => {
    const node = { id: "node-1", verified: true };
    const evidence = [
      { id: "ev-1", status: "superseded", updatedAt: Date.now() },
      { id: "ev-2", status: "superseded", updatedAt: Date.now() },
    ];
    const result = deriveVerification(node, evidence);
    assert.equal(result.effectiveVerified, false);
    assert.ok(result.reason.includes("superseded"));
  });

  it("returns true with mix of valid and superseded evidence", () => {
    const node = { id: "node-1", verified: true };
    const evidence = [
      { id: "ev-1", status: "valid", updatedAt: Date.now() },
      { id: "ev-2", status: "superseded", updatedAt: Date.now() },
    ];
    const result = deriveVerification(node, evidence);
    assert.equal(result.effectiveVerified, true);
  });

  it("includes derivedFrom and derivedAt", () => {
    const node = { id: "node-1", verified: true };
    const result = deriveVerification(node);
    assert.ok(result.derivedFrom);
    assert.ok(result.derivedAt);
  });
});

describe("findAffectedNodes", () => {
  it("finds nodes that depend on invalidated evidence", () => {
    const graph = {
      getNode: (id) => {
        if (id === "node-1") return { id: "node-1", verified: true };
        return null;
      },
      getEdgesToByType: (id, type) => {
        if (id === "ev-1" && type === "supports") {
          return [{ from: "node-1", to: "ev-1", type: "supports" }];
        }
        return [];
      },
    };

    const affected = findAffectedNodes("ev-1", graph);
    assert.ok(affected.includes("node-1"));
  });

  it("returns empty for no affected nodes", () => {
    const graph = {
      getNode: () => null,
      getEdgesToByType: () => [],
    };

    const affected = findAffectedNodes("ev-1", graph);
    assert.equal(affected.length, 0);
  });
});

describe("markStaleOnInvalidation", () => {
  it("marks affected nodes as stale", () => {
    const nodes = new Map();
    nodes.set("node-1", { id: "node-1", verified: true });

    const graph = {
      getNode: (id) => nodes.get(id),
      getEdgesToByType: (id, type) => {
        if (id === "ev-1" && type === "supports") {
          return [{ from: "node-1", to: "ev-1", type: "supports" }];
        }
        return [];
      },
    };

    const affected = markStaleOnInvalidation("ev-1", graph);
    assert.ok(affected.includes("node-1"));

    const node = nodes.get("node-1");
    assert.equal(node.verified, false);
    assert.ok(node.metadata.staleReason);
  });
});

describe("generateFreshnessReport", () => {
  it("generates report for nodes", () => {
    const nodes = [
      { id: "node-1", verified: true },
      { id: "node-2", verified: false },
    ];

    const evidenceStore = {
      getSupportingEvidence: (nodeId) => {
        if (nodeId === "node-1") {
          return [{ id: "ev-1", status: "valid" }];
        }
        return [];
      },
    };

    const report = generateFreshnessReport(nodes, evidenceStore);
    assert.equal(report.total, 2);
    assert.equal(report.verified, 1);
  });
});
