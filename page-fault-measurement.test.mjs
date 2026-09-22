/**
 * Unit tests for page-fault-tracker.js (C06 — page-fault-measurement).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  createPageFaultTracker,
  FAULT_REASONS,
  aggregateByReason,
  measurePageFaults,
} from "./page-fault-tracker.js";

test("tracker: empty snapshot has zero counts", () => {
  const t = createPageFaultTracker();
  const s = t.snapshot();
  assert.equal(s.omissionCount, 0);
  assert.equal(s.fetchCount, 0);
  assert.equal(s.faultCount, 0);
  assert.equal(s.tokensOmitted, 0);
  assert.equal(s.tokensRefetched, 0);
  assert.equal(s.faultRate, 0);
  assert.deepEqual(s.faultsByReason, {});
  assert.deepEqual(s.omissionsByReason, {});
});

test("tracker: recordOmission accumulates tokens and reason counts", () => {
  const t = createPageFaultTracker();
  t.recordOmission({ id: "a", tokens: 100, reason: FAULT_REASONS.SCOPE_OVERFLOW });
  t.recordOmission({ id: "b", tokens: 50, reason: FAULT_REASONS.RELEVANCE_THRESHOLD });
  t.recordOmission({ id: "c", tokens: 25, reason: FAULT_REASONS.SCOPE_OVERFLOW });
  const s = t.snapshot();
  assert.equal(s.omissionCount, 3);
  assert.equal(s.tokensOmitted, 175);
  assert.equal(s.omissionsByReason[FAULT_REASONS.SCOPE_OVERFLOW], 2);
  assert.equal(s.omissionsByReason[FAULT_REASONS.RELEVANCE_THRESHOLD], 1);
});

test("tracker: fetch without prior omission is NOT a fault", () => {
  const t = createPageFaultTracker();
  const result = t.recordFetch({ id: "x", tokens: 10, latencyMs: 5 });
  assert.equal(result, null);
  const s = t.snapshot();
  assert.equal(s.faultCount, 0);
  assert.equal(s.fetchCount, 0);
});

test("tracker: fetch after omission IS a fault", () => {
  const t = createPageFaultTracker();
  t.recordOmission({ id: "a", tokens: 100, reason: FAULT_REASONS.SCOPE_OVERFLOW });
  const fault = t.recordFetch({ id: "a", tokens: 100, latencyMs: 12, reason: "retrieve" });
  assert.ok(fault);
  assert.equal(fault.id, "a");
  assert.equal(fault.tokens, 100);
  assert.equal(fault.latencyMs, 12);
  assert.equal(fault.omissionReason, FAULT_REASONS.SCOPE_OVERFLOW);
  const s = t.snapshot();
  assert.equal(s.faultCount, 1);
  assert.equal(s.fetchCount, 1);
  assert.equal(s.tokensRefetched, 100);
  assert.equal(s.faultLatencyMs, 12);
  assert.equal(s.faultRate, 1);
  assert.equal(s.faultsByReason["retrieve"], 1);
});

test("tracker: recordFault convenience alias works", () => {
  const t = createPageFaultTracker();
  t.recordOmission({ id: "x", tokens: 10, reason: FAULT_REASONS.EXPLICIT_OMISSION });
  const f = t.recordFault("x", { tokens: 10, latencyMs: 4, reason: "manual" });
  assert.ok(f);
  assert.equal(f.omissionReason, FAULT_REASONS.EXPLICIT_OMISSION);
});

test("tracker: faults() returns recorded fault records", () => {
  const t = createPageFaultTracker();
  t.recordOmission({ id: "a", tokens: 10, reason: FAULT_REASONS.TTL_EXPIRED });
  t.recordFetch({ id: "a", tokens: 10, latencyMs: 7 });
  const faults = t.faults();
  assert.equal(faults.length, 1);
  assert.equal(faults[0].id, "a");
});

test("tracker: omissions() returns omission records", () => {
  const t = createPageFaultTracker();
  t.recordOmission({ id: "a", tokens: 10, reason: FAULT_REASONS.SCOPE_OVERFLOW });
  t.recordOmission({ id: "b", tokens: 20, reason: FAULT_REASONS.UNKNOWN });
  const om = t.omissions();
  assert.equal(om.length, 2);
});

test("tracker: reset() clears all state", () => {
  const t = createPageFaultTracker();
  t.recordOmission({ id: "a", tokens: 10 });
  t.recordFetch({ id: "a", tokens: 10, latencyMs: 1 });
  t.reset();
  const s = t.snapshot();
  assert.equal(s.omissionCount, 0);
  assert.equal(s.faultCount, 0);
  assert.equal(t.faults().length, 0);
});

test("tracker: omitting same id twice overwrites prior record", () => {
  const t = createPageFaultTracker();
  t.recordOmission({ id: "a", tokens: 100, reason: "first" });
  t.recordOmission({ id: "a", tokens: 200, reason: "second" });
  assert.equal(t.snapshot().omissionCount, 1);
  assert.equal(t.snapshot().tokensOmitted, 200);
});

test("tracker: validates inputs", () => {
  const t = createPageFaultTracker();
  assert.throws(() => t.recordOmission(null), /id/);
  assert.throws(() => t.recordOmission({}), /id/);
  assert.throws(() => t.recordFetch(null), /id/);
  assert.throws(() => t.recordFetch({}), /id/);
});

test("tracker: injectable clock controls timestamps", () => {
  let now = 1000;
  const t = createPageFaultTracker({ clock: () => now });
  t.recordOmission({ id: "a", tokens: 1 });
  now = 2000;
  t.recordFetch({ id: "a", tokens: 1, latencyMs: 5 });
  const faults = t.faults();
  assert.equal(faults[0].timestamp, 2000);
  assert.equal(t.omissions()[0].timestamp, 1000);
});

test("aggregateByReason: groups faults by omissionReason", () => {
  const records = [
    { id: "a", tokens: 10, latencyMs: 5, omissionReason: FAULT_REASONS.SCOPE_OVERFLOW },
    { id: "b", tokens: 20, latencyMs: 6, omissionReason: FAULT_REASONS.SCOPE_OVERFLOW },
    { id: "c", tokens: 5, latencyMs: 1, omissionReason: FAULT_REASONS.TTL_EXPIRED },
  ];
  const out = aggregateByReason(records);
  assert.equal(out[FAULT_REASONS.SCOPE_OVERFLOW].count, 2);
  assert.equal(out[FAULT_REASONS.SCOPE_OVERFLOW].tokens, 30);
  assert.equal(out[FAULT_REASONS.SCOPE_OVERFLOW].latencyMs, 11);
  assert.equal(out[FAULT_REASONS.TTL_EXPIRED].count, 1);
});

test("aggregateByReason: tolerates empty/invalid input", () => {
  assert.deepEqual(aggregateByReason([]), {});
  assert.deepEqual(aggregateByReason(null), {});
  assert.deepEqual(aggregateByReason(undefined), {});
});

test("measurePageFaults: synchronous fetchFn", () => {
  const t = createPageFaultTracker();
  t.recordOmission({ id: "a", tokens: 10, reason: FAULT_REASONS.SCOPE_OVERFLOW });
  // Directly verify: fetch after omission IS a fault
  const fault = t.recordFetch({ id: "a", tokens: 10, latencyMs: 3, reason: "fetch-a" });
  assert.ok(fault);
  assert.equal(fault.id, "a");
  assert.equal(fault.tokens, 10);
  assert.equal(fault.omissionReason, FAULT_REASONS.SCOPE_OVERFLOW);
  // fetch without prior omission is NOT a fault
  const notFault = t.recordFetch({ id: "b", tokens: 5, latencyMs: 1 });
  assert.equal(notFault, null);
  const snap = t.snapshot();
  assert.equal(snap.faultCount, 1);
  assert.equal(snap.tokensRefetched, 10);
  assert.equal(snap.faultLatencyMs, 3);
});

test("measurePageFaults: async fetchFn", async () => {
  const t = createPageFaultTracker();
  t.recordOmission({ id: "a", tokens: 7 });
  const snap = await measurePageFaults(t, async (retrieve) => {
    await Promise.resolve();
    retrieve("a", { tokens: 7, latencyMs: 2 });
    return null;
  });
  assert.equal(snap.faultCount, 1);
});

test("measurePageFaults: validates tracker and fetchFn", () => {
  assert.throws(() => measurePageFaults(null, () => {}), /tracker/);
  assert.throws(() => measurePageFaults({}, () => {}), /tracker/);
  assert.throws(() => measurePageFaults(createPageFaultTracker(), null), /fetchFn/);
  assert.throws(() => measurePageFaults(createPageFaultTracker(), 123), /fetchFn/);
});
