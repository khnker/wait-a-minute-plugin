import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  explainRoutingDecision,
  explainContextRouting,
  formatRoutingReport,
} from "./context-routing-observability.js";
import { ContextGraph } from "./context-graph.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-observability-test-"));

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("explainRoutingDecision", () => {
  it("explains included item", () => {
    const item = { id: "decision-1", type: "decision", status: "current" };
    const context = { included: ["decision-1"] };
    const decisions = explainRoutingDecision(item, context, null);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].type, "included");
  });

  it("explains excluded low relevance", () => {
    const item = { id: "obs-1", relevanceScore: 0.1 };
    const context = { included: [], excluded: ["obs-1"] };
    const decisions = explainRoutingDecision(item, context, null);
    assert.equal(decisions[0].type, "low-relevance");
  });

  it("explains superseded item", () => {
    const item = { id: "decision-old", status: "superseded", supersededBy: "decision-new" };
    const context = { excluded: ["decision-old"] };
    const decisions = explainRoutingDecision(item, context, null);
    assert.equal(decisions[0].type, "superseded");
    assert.ok(decisions[0].reason.includes("Superseded"));
  });

  it("explains stale item", () => {
    const item = { id: "obs-old", status: "stale" };
    const context = { excluded: ["obs-old"] };
    const decisions = explainRoutingDecision(item, context, null);
    assert.equal(decisions[0].type, "stale");
  });

  it("explains invalidated item", () => {
    const item = { id: "evidence-bad", status: "invalidated", invalidationReason: "Test failed" };
    const context = { excluded: ["evidence-bad"] };
    const decisions = explainRoutingDecision(item, context, null);
    assert.equal(decisions[0].type, "invalidated");
  });

  it("explains missing dependency", () => {
    const item = { id: "output-1" };
    const context = {
      included: [],
      missing: [{ type: "missing_dependency", description: "Output output-1 not found", requiredBy: "task-1" }],
    };
    const decisions = explainRoutingDecision(item, context, null);
    assert.equal(decisions[0].type, "missing");
  });

  it("includes requiredBy for dependency-required", () => {
    const item = { id: "output-1", dependencyOf: "task-2" };
    const context = { included: ["output-1"] };
    const decisions = explainRoutingDecision(item, context, null);
    assert.equal(decisions[0].reason.includes("task-2"), true);
  });

  it("explains unresolved requirement", () => {
    const item = { id: "req-1", type: "requirement", status: "unresolved" };
    const context = { included: ["req-1"] };
    const decisions = explainRoutingDecision(item, context, null);
    assert.equal(decisions[0].type, "included");
    assert.ok(decisions[0].reason.includes("Unresolved"));
  });

  it("explains high relevance inclusion", () => {
    const item = { id: "obs-1", relevanceScore: 0.85 };
    const context = { included: ["obs-1"] };
    const decisions = explainRoutingDecision(item, context, null);
    assert.equal(decisions[0].type, "included");
    assert.ok(decisions[0].reason.includes("High relevance"));
  });
});

describe("explainContextRouting", () => {
  it("explains multiple decisions", () => {
    const context = {
      included: ["decision-1", "req-1"],
      excluded: ["obs-1"],
      missing: [{ type: "missing", description: "Output missing", requiredBy: "task-1" }],
    };
    const decisions = explainContextRouting("task-1", null, context);
    assert.ok(decisions.length >= 3);
  });

  it("respects includeExcluded option", () => {
    const context = {
      included: ["decision-1"],
      excluded: ["obs-1"],
    };
    const decisions = explainContextRouting("task-1", null, context, { includeExcluded: false });
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].type, "included");
  });

  it("respects includeIncluded option", () => {
    const context = {
      included: ["decision-1"],
      excluded: ["obs-1"],
    };
    const decisions = explainContextRouting("task-1", null, context, { includeIncluded: false });
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].type, "low-relevance");
  });
});

describe("formatRoutingReport", () => {
  it("formats included section", () => {
    const decisions = [
      { itemId: "decision-1", type: "included", reason: "Required by task-2" },
    ];
    const report = formatRoutingReport(decisions);
    assert.ok(report.includes("## Included"));
    assert.ok(report.includes("decision-1"));
  });

  it("formats missing section", () => {
    const decisions = [
      { itemId: "output-1", type: "missing", reason: "Not found", requiredBy: "task-1" },
    ];
    const report = formatRoutingReport(decisions);
    assert.ok(report.includes("## Missing"));
    assert.ok(report.includes("output-1"));
  });

  it("formats superseded section", () => {
    const decisions = [
      { itemId: "decision-old", type: "superseded", reason: "Superseded by decision-new" },
    ];
    const report = formatRoutingReport(decisions);
    assert.ok(report.includes("## Superseded"));
    assert.ok(report.includes("decision-old"));
  });

  it("formats stale section", () => {
    const decisions = [
      { itemId: "obs-old", type: "stale", reason: "No longer relevant" },
    ];
    const report = formatRoutingReport(decisions);
    assert.ok(report.includes("## Stale"));
    assert.ok(report.includes("obs-old"));
  });

  it("formats invalidated section", () => {
    const decisions = [
      { itemId: "evidence-bad", type: "invalidated", reason: "Test failed" },
    ];
    const report = formatRoutingReport(decisions);
    assert.ok(report.includes("## Invalidated"));
    assert.ok(report.includes("evidence-bad"));
  });

  it("handles empty decisions", () => {
    const report = formatRoutingReport([]);
    assert.ok(report.includes("Routing Decision Report"));
  });
});
