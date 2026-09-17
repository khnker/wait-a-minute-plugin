import { test } from "node:test";
import assert from "node:assert/strict";
import {
  retrieveActiveContext,
  isContextSufficient,
  invalidateContextItems,
  markItemsStale,
  ACTIVE_LIFECYCLES,
  SUPPORTING_LIFECYCLES,
  EXCLUDED_LIFECYCLES,
  PURPOSE_MODES,
} from "./active-context-boundary.js";
import { LIFECYCLE_STATES } from "./context-lifecycle.js";

function makeItem(lifecycle, overrides = {}) {
  return {
    id: `item-${lifecycle}`,
    lifecycle,
    unresolvedCriticalUnknowns: [],
    mandatoryIncluded: false,
    ...overrides,
  };
}

test("boundary: ACTIVE_LIFECYCLES returns CREATED and ACTIVE", () => {
  assert.ok(ACTIVE_LIFECYCLES.has("CREATED"));
  assert.ok(ACTIVE_LIFECYCLES.has("ACTIVE"));
  assert.ok(!ACTIVE_LIFECYCLES.has("STALE"));
  assert.ok(!ACTIVE_LIFECYCLES.has("INVALIDATED"));
});

test("boundary: EXCLUDED_LIFECYCLES returns INVALIDATED and ARCHIVED", () => {
  assert.ok(EXCLUDED_LIFECYCLES.has("INVALIDATED"));
  assert.ok(EXCLUDED_LIFECYCLES.has("ARCHIVED"));
  assert.ok(!EXCLUDED_LIFECYCLES.has("STALE"));
  assert.ok(!EXCLUDED_LIFECYCLES.has("ACTIVE"));
});

test("boundary: retrieveActiveContext includes ACTIVE/COMPRESSED/STALE by default", () => {
  const items = [
    makeItem("ACTIVE"),
    makeItem("COMPRESSED"),
    makeItem("STALE"),
    makeItem("INVALIDATED"),
    makeItem("ARCHIVED"),
  ];
  const active = retrieveActiveContext(items, PURPOSE_MODES.PLANNING);
  assert.equal(active.length, 3);
  assert.ok(active.find(i => i.lifecycle === "ACTIVE"));
  assert.ok(active.find(i => i.lifecycle === "COMPRESSED"));
  assert.ok(active.find(i => i.lifecycle === "STALE"));
});

test("boundary: retrieveActiveContext excludes INVALIDATED/ARCHIVED by default", () => {
  const items = [makeItem("INVALIDATED"), makeItem("ARCHIVED")];
  const active = retrieveActiveContext(items, PURPOSE_MODES.PLANNING);
  assert.equal(active.length, 0);
});

test("boundary: retrieveActiveContext includes INVALIDATED/ARCHIVED for DEBUGGING", () => {
  const items = [makeItem("INVALIDATED"), makeItem("ARCHIVED")];
  const active = retrieveActiveContext(items, PURPOSE_MODES.DEBUGGING);
  assert.equal(active.length, 2);
});

test("boundary: retrieveActiveContext includes INVALIDATED/ARCHIVED for RESUME", () => {
  const items = [makeItem("INVALIDATED"), makeItem("ARCHIVED")];
  const active = retrieveActiveContext(items, PURPOSE_MODES.RESUME);
  assert.equal(active.length, 2);
});

test("boundary: isContextSufficient true when active items and no critical unknowns", () => {
  const items = [makeItem("ACTIVE"), makeItem("COMPRESSED")];
  const result = isContextSufficient(items, PURPOSE_MODES.PLANNING);
  assert.equal(result.sufficient, true);
  assert.equal(result.missing.length, 0);
});

test("boundary: isContextSufficient false when critical unknowns exist", () => {
  const items = [makeItem("ACTIVE", { unresolvedCriticalUnknowns: [{ type: "runtime", reason: "chromium missing" }] })];
  const result = isContextSufficient(items, PURPOSE_MODES.PLANNING);
  assert.equal(result.sufficient, false);
  assert.equal(result.unresolvedCriticalUnknowns.length, 1);
});

test("boundary: isContextSufficient false when no active items", () => {
  const items = [makeItem("INVALIDATED")];
  const result = isContextSufficient(items, PURPOSE_MODES.PLANNING);
  assert.equal(result.sufficient, false);
});

test("boundary: invalidateContextItems marks specified items INVALIDATED", () => {
  const items = [makeItem("ACTIVE", { id: "a" }), makeItem("ACTIVE", { id: "b" }), makeItem("STALE", { id: "c" })];
  const event = { payload: { reason: "FILE_MODIFIED", invalidatedIds: ["a"] } };
  const result = invalidateContextItems(items, event);
  const itemA = result.find(i => i.id === "a");
  const itemB = result.find(i => i.id === "b");
  assert.equal(itemA.lifecycle, LIFECYCLE_STATES.INVALIDATED);
  assert.equal(itemB.lifecycle, "ACTIVE");
});

test("boundary: markItemsStale marks ACTIVE/COMPRESSED/STALE as STALE", () => {
  const items = [makeItem("ACTIVE"), makeItem("COMPRESSED"), makeItem("INVALIDATED")];
  const event = { payload: { reason: "CONFIG_CHANGED" } };
  const result = markItemsStale(items, event);
  assert.equal(result[0].lifecycle, LIFECYCLE_STATES.STALE);
  assert.equal(result[1].lifecycle, LIFECYCLE_STATES.STALE);
  assert.equal(result[2].lifecycle, "INVALIDATED");
});