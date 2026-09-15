import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WAM_EVENTS,
  createEvent,
  logEvent,
  createDecisionTrace,
  addToTrace,
  formatDecisionTrace,
} from "./wam-events.js";

describe("WAM_EVENTS", () => {
  it("defines all 13 event types", () => {
    const expected = [
      "CONTEXT_LOADED",
      "CONTEXT_INVALIDATED",
      "CLAIM_CREATED",
      "REQUIREMENT_CREATED",
      "ACTION_STARTED",
      "ACTION_COMPLETED",
      "OBSERVATION_CREATED",
      "EVIDENCE_ADDED",
      "EVIDENCE_CONFLICT",
      "VERIFICATION_STARTED",
      "VERIFICATION_COMPLETED",
      "COMPLETION_BLOCKED",
      "TASK_COMPLETED",
    ];
    for (const type of expected) {
      assert.equal(WAM_EVENTS[type], type);
    }
    assert.equal(Object.values(WAM_EVENTS).length, 13);
  });
});

describe("createEvent", () => {
  it("creates event with required fields", () => {
    const event = createEvent("TEST_TYPE", { key: "value" });
    assert.ok(event.id);
    assert.equal(event.type, "TEST_TYPE");
    assert.deepEqual(event.data, { key: "value" });
    assert.ok(typeof event.timestamp === "number");
  });

  it("creates event with empty data by default", () => {
    const event = createEvent("SOME_EVENT");
    assert.deepEqual(event.data, {});
  });

  it("generates unique IDs", () => {
    const e1 = createEvent("T");
    const e2 = createEvent("T");
    assert.notEqual(e1.id, e2.id);
  });
});

describe("logEvent", () => {
  it("creates and appends event to eventLog", () => {
    const log = [];
    const event = logEvent("CLAIM_CREATED", { claimId: "c1" }, log);
    assert.equal(log.length, 1);
    assert.equal(log[0], event);
    assert.equal(event.type, "CLAIM_CREATED");
    assert.deepEqual(event.data, { claimId: "c1" });
  });

  it("works with default empty array", () => {
    const event = logEvent("TEST", {});
    assert.ok(event);
  });
});

describe("createDecisionTrace", () => {
  it("creates trace with decision, empty chain and timestamp", () => {
    const trace = createDecisionTrace("should-execute");
    assert.ok(trace.id);
    assert.equal(trace.decision, "should-execute");
    assert.deepEqual(trace.chain, []);
    assert.ok(typeof trace.timestamp === "number");
  });
});

describe("addToTrace", () => {
  it("appends step to trace chain with timestamp", () => {
    const trace = createDecisionTrace("decide");
    const step = { type: "INPUT", description: "Received input" };
    const updated = addToTrace(trace, step);
    assert.equal(updated.chain.length, 1);
    assert.equal(updated.chain[0].type, "INPUT");
    assert.equal(updated.chain[0].description, "Received input");
    assert.ok(typeof updated.chain[0].timestamp === "number");
  });

  it("does not mutate original trace", () => {
    const trace = createDecisionTrace("decide");
    addToTrace(trace, { type: "STEP", description: "step" });
    assert.equal(trace.chain.length, 0);
  });

  it("accumulates multiple steps", () => {
    let trace = createDecisionTrace("multi");
    trace = addToTrace(trace, { type: "A", description: "first" });
    trace = addToTrace(trace, { type: "B", description: "second" });
    assert.equal(trace.chain.length, 2);
    assert.equal(trace.chain[0].type, "A");
    assert.equal(trace.chain[1].type, "B");
  });
});

describe("formatDecisionTrace", () => {
  it("formats chain as numbered string", () => {
    const trace = createDecisionTrace("test");
    trace.chain = [
      { type: "INPUT", description: "Got input" },
      { type: "ANALYZE", description: "Analyzed context" },
    ];
    const formatted = formatDecisionTrace(trace);
    assert.equal(
      formatted,
      "1. [INPUT] Got input\n2. [ANALYZE] Analyzed context"
    );
  });

  it("returns empty string for empty chain", () => {
    const trace = createDecisionTrace("empty");
    assert.equal(formatDecisionTrace(trace), "");
  });
});
