/**
 * Context Pack Source of Truth tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RESPONSIBILITIES,
  validateAuthority,
  recordDecision,
  resolveAuthorityConflict,
  generateAuthorityReport,
} from "./context-pack-authority.js";

describe("RESPONSIBILITIES", () => {
  it("defines all components", () => {
    assert.ok(RESPONSIBILITIES.graph);
    assert.ok(RESPONSIBILITIES.router);
    assert.ok(RESPONSIBILITIES.assembly);
    assert.ok(RESPONSIBILITIES.selection);
  });

  it("graph has authority over relationships", () => {
    assert.equal(RESPONSIBILITIES.graph.authority, "relationships");
  });

  it("router has authority over what", () => {
    assert.equal(RESPONSIBILITIES.router.authority, "what");
  });

  it("assembly has authority over how", () => {
    assert.equal(RESPONSIBILITIES.assembly.authority, "how");
  });

  it("selection has authority over retrieval", () => {
    assert.equal(RESPONSIBILITIES.selection.authority, "retrieval");
  });
});

describe("validateAuthority", () => {
  it("validates router authority over required nodes", () => {
    const result = validateAuthority("router", "which nodes are required");
    assert.equal(result.valid, true);
  });

  it("validates assembly authority over budget", () => {
    const result = validateAuthority("assembly", "budget partitioning");
    assert.equal(result.valid, true);
  });

  it("rejects selection authority over budget", () => {
    const result = validateAuthority("selection", "budget partitioning");
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes("does NOT"));
  });

  it("rejects unknown component", () => {
    const result = validateAuthority("unknown", "anything");
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes("Unknown"));
  });
});

describe("recordDecision", () => {
  it("creates decision record", () => {
    const record = recordDecision("router", "required nodes", "Task needs auth context");
    assert.equal(record.component, "router");
    assert.equal(record.decision, "required nodes");
    assert.equal(record.reason, "Task needs auth context");
    assert.ok(record.timestamp);
  });
});

describe("resolveAuthorityConflict", () => {
  it("assembly wins over router", () => {
    const result = resolveAuthorityConflict("assembly", "router", "budget");
    assert.equal(result.winner, "assembly");
  });

  it("router wins over selection", () => {
    const result = resolveAuthorityConflict("router", "selection", "required nodes");
    assert.equal(result.winner, "router");
  });

  it("handles unknown component", () => {
    const result = resolveAuthorityConflict("unknown", "router", "budget");
    assert.equal(result.winner, "router");
  });
});

describe("generateAuthorityReport", () => {
  it("generates report", () => {
    const report = generateAuthorityReport({});
    assert.ok(report.includes("[wam authority]"));
    assert.ok(report.includes("Graph:"));
    assert.ok(report.includes("Router:"));
    assert.ok(report.includes("Assembly:"));
  });

  it("includes context decisions", () => {
    const context = {
      routerDecision: "Required: auth, output",
      assemblyDecision: "MANDATORY: N0, N2",
    };
    const report = generateAuthorityReport(context);
    assert.ok(report.includes("Router decision:"));
    assert.ok(report.includes("Assembly decision:"));
  });
});
