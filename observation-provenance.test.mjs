/**
 * Observation Provenance tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createObservation,
  validateObservation,
  canPromoteObservation,
  deriveObservation,
  getProvenanceSummary,
  VALID_PROVENANCE,
  DEFAULT_CONFIDENCE,
} from "./observation-provenance.js";

describe("VALID_PROVENANCE", () => {
  it("defines valid provenance types", () => {
    assert.ok(VALID_PROVENANCE.has("user_decided"));
    assert.ok(VALID_PROVENANCE.has("observed"));
    assert.ok(VALID_PROVENANCE.has("inferred"));
  });
});

describe("DEFAULT_CONFIDENCE", () => {
  it("has correct default confidences", () => {
    assert.equal(DEFAULT_CONFIDENCE.user_decided, 1.0);
    assert.equal(DEFAULT_CONFIDENCE.observed, 0.8);
    assert.equal(DEFAULT_CONFIDENCE.inferred, 0.5);
  });
});

describe("createObservation", () => {
  it("creates observation with default provenance", () => {
    const obs = createObservation("test observation");
    assert.ok(obs.id);
    assert.equal(obs.text, "test observation");
    assert.equal(obs.provenance.source, "observed");
    assert.equal(obs.provenance.confidence, 0.8);
  });

  it("creates observation with user_decided provenance", () => {
    const obs = createObservation("user decision", "user_decided");
    assert.equal(obs.provenance.source, "user_decided");
    assert.equal(obs.provenance.confidence, 1.0);
  });

  it("creates observation with inferred provenance", () => {
    const obs = createObservation("inferred observation", "inferred");
    assert.equal(obs.provenance.source, "inferred");
    assert.equal(obs.provenance.confidence, 0.5);
  });

  it("uses custom confidence when provided", () => {
    const obs = createObservation("custom confidence", "observed", { confidence: 0.9 });
    assert.equal(obs.provenance.confidence, 0.9);
  });

  it("includes session and task IDs", () => {
    const obs = createObservation("with ids", "observed", {
      sessionId: "ses-123",
      taskId: "task-456",
    });
    assert.equal(obs.provenance.sessionId, "ses-123");
    assert.equal(obs.provenance.taskId, "task-456");
  });

  it("defaults to observed for invalid source", () => {
    const obs = createObservation("invalid", "invalid_source");
    assert.equal(obs.provenance.source, "observed");
  });
});

describe("validateObservation", () => {
  it("validates correct observation", () => {
    const obs = createObservation("test");
    const result = validateObservation(obs);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("rejects missing text", () => {
    const obs = { id: "1", text: "", timestamp: Date.now(), provenance: { source: "observed", confidence: 0.8 } };
    const result = validateObservation(obs);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("text")));
  });

  it("rejects missing provenance", () => {
    const obs = { id: "1", text: "test", timestamp: Date.now() };
    const result = validateObservation(obs);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("provenance")));
  });

  it("rejects invalid confidence", () => {
    const obs = {
      id: "1",
      text: "test",
      timestamp: Date.now(),
      provenance: { source: "observed", confidence: 1.5 },
    };
    const result = validateObservation(obs);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("confidence")));
  });
});

describe("canPromoteObservation", () => {
  it("allows user_decided to promote to L1", () => {
    const obs = createObservation("user decision", "user_decided");
    const result = canPromoteObservation(obs, "L1");
    assert.equal(result.allowed, true);
  });

  it("allows observed with high confidence to promote to L1", () => {
    const obs = createObservation("observed", "observed", { confidence: 0.8 });
    const result = canPromoteObservation(obs, "L1");
    assert.equal(result.allowed, true);
  });

  it("rejects inferred to promote to L1", () => {
    const obs = createObservation("inferred", "inferred");
    const result = canPromoteObservation(obs, "L1");
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes("Inferred"));
  });

  it("rejects low confidence to promote to L1", () => {
    const obs = createObservation("low confidence", "observed", { confidence: 0.3 });
    const result = canPromoteObservation(obs, "L1");
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes("too low"));
  });

  it("allows observed to promote to L2", () => {
    const obs = createObservation("observed", "observed");
    const result = canPromoteObservation(obs, "L2");
    assert.equal(result.allowed, true);
  });
});

describe("deriveObservation", () => {
  it("creates derived observation with parent link", () => {
    const parent = createObservation("parent observation", "observed");
    const derived = deriveObservation(parent, "derived observation");
    assert.equal(derived.provenance.parentId, parent.id);
    assert.equal(derived.provenance.source, "inferred");
    assert.equal(derived.provenance.sessionId, parent.provenance.sessionId);
  });

  it("caps confidence at parent's confidence", () => {
    const parent = createObservation("parent", "inferred", { confidence: 0.3 });
    const derived = deriveObservation(parent, "derived", "observed");
    assert.ok(derived.provenance.confidence <= parent.provenance.confidence);
  });
});

describe("getProvenanceSummary", () => {
  it("summarizes observations by source", () => {
    const observations = [
      createObservation("obs1", "user_decided"),
      createObservation("obs2", "observed"),
      createObservation("obs3", "inferred"),
    ];
    const summary = getProvenanceSummary(observations);
    assert.equal(summary.total, 3);
    assert.equal(summary.bySource.user_decided, 1);
    assert.equal(summary.bySource.observed, 1);
    assert.equal(summary.bySource.inferred, 1);
  });

  it("calculates average confidence", () => {
    const observations = [
      createObservation("obs1", "user_decided"),
      createObservation("obs2", "observed"),
    ];
    const summary = getProvenanceSummary(observations);
    assert.ok(summary.avgConfidence > 0.8 && summary.avgConfidence < 1.0);
  });

  it("counts high and low confidence", () => {
    const observations = [
      createObservation("high", "user_decided"),
      createObservation("low", "inferred", { confidence: 0.3 }),
    ];
    const summary = getProvenanceSummary(observations);
    assert.equal(summary.highConfidence, 1);
    assert.equal(summary.lowConfidence, 1);
  });

  it("handles empty observations", () => {
    const summary = getProvenanceSummary([]);
    assert.equal(summary.total, 0);
    assert.equal(summary.avgConfidence, 0);
  });
});
