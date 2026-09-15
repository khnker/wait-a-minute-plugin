import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { demoteItem } from "./context-demotion.js";
import { LIFECYCLE_STATES } from "./context-lifecycle.js";

const now = 1700000000000;

function makeItem(opts = {}) {
  return Object.freeze({
    id: "item-1",
    type: "CLAIM",
    memoryLayer: opts.memoryLayer || "N1",
    lifecycle: opts.lifecycle || LIFECYCLE_STATES.ACTIVE,
    metadata: opts.metadata || {},
    lifecycleHistory: opts.lifecycleHistory || [],
    updatedAt: opts.updatedAt || now - 1000,
    ...opts,
  });
}

describe("demoteItem", () => {
  beforeEach(() => {
    // clean state between tests — items are frozen copies
  });

  describe("validation", () => {
    it("throws on missing item", () => {
      assert.throws(() => demoteItem(null, "N2"), /item must be an object/);
    });

    it("throws on non-object item", () => {
      assert.throws(() => demoteItem("string", "N2"), /item must be an object/);
    });

    it("throws on invalid target layer", () => {
      assert.throws(() => demoteItem(makeItem(), "N5"), /invalid target layer/);
    });

    it("throws when not actually demoting (same or higher priority)", () => {
      assert.throws(() => demoteItem(makeItem({ memoryLayer: "N2" }), "N1"), /not a demotion/);
      assert.throws(() => demoteItem(makeItem({ memoryLayer: "N2" }), "N2"), /not a demotion/);
    });
  });

  describe("N1 → N2 demotion", () => {
    it("changes memoryLayer to target", () => {
      const item = makeItem({ memoryLayer: "N1" });
      const result = demoteItem(item, "N2");
      assert.equal(result.item.memoryLayer, "N2");
    });

    it("preserves other item properties", () => {
      const item = makeItem({ type: "CLAIM", id: "abc" });
      const result = demoteItem(item, "N3");
      assert.equal(result.item.id, "abc");
      assert.equal(result.item.type, "CLAIM");
    });

    it("returns a new object (immutable — original unchanged)", () => {
      const item = makeItem({ memoryLayer: "N1" });
      const result = demoteItem(item, "N2");
      assert.notEqual(result.item, item);
      assert.equal(item.memoryLayer, "N1");
      assert.equal(result.item.memoryLayer, "N2");
    });
  });

  describe("demotion to ARCHIVE", () => {
    it("transitions ACTIVE → COMPRESSED when moving to ARCHIVE", () => {
      const item = makeItem({
        memoryLayer: "N2",
        lifecycle: LIFECYCLE_STATES.ACTIVE,
      });
      const result = demoteItem(item, "ARCHIVE");
      assert.equal(result.item.lifecycle, LIFECYCLE_STATES.COMPRESSED);
      assert.equal(result.event.lifecycleChanged, true);
      assert.equal(result.event.fromLifecycle, "ACTIVE");
      assert.equal(result.event.toLifecycle, "COMPRESSED");
    });

    it("does not change lifecycle for COMPRESSED items going to ARCHIVE", () => {
      const item = makeItem({
        memoryLayer: "N3",
        lifecycle: LIFECYCLE_STATES.COMPRESSED,
      });
      const result = demoteItem(item, "ARCHIVE");
      assert.equal(result.item.lifecycle, LIFECYCLE_STATES.COMPRESSED);
      assert.equal(result.event.lifecycleChanged, false);
    });

    it("does not change lifecycle for TERMINAL states going to ARCHIVE", () => {
      const item = makeItem({
        memoryLayer: "N3",
        lifecycle: LIFECYCLE_STATES.ARCHIVED,
      });
      const result = demoteItem(item, "ARCHIVE");
      assert.equal(result.item.lifecycle, LIFECYCLE_STATES.ARCHIVED);
    });

    it("sets archivedAt in metadata when moving to ARCHIVE", () => {
      const item = makeItem({ memoryLayer: "N3" });
      const result = demoteItem(item, "ARCHIVE");
      assert.ok(result.item.metadata.archivedAt > 0);
    });
  });

  describe("demotion to N3 (without archive)", () => {
    it("does NOT change lifecycle for ACTIVE items demoted to N3", () => {
      const item = makeItem({
        memoryLayer: "N1",
        lifecycle: LIFECYCLE_STATES.ACTIVE,
      });
      const result = demoteItem(item, "N3");
      assert.equal(result.item.lifecycle, LIFECYCLE_STATES.ACTIVE);
      assert.equal(result.event.lifecycleChanged, false);
    });
  });

  describe("event", () => {
    it("returns a DemotionEvent with type demote", () => {
      const item = makeItem({ memoryLayer: "N1" });
      const result = demoteItem(item, "N3");
      assert.equal(result.event.type, "demote");
      assert.equal(result.event.fromLayer, "N1");
      assert.equal(result.event.toLayer, "N3");
      assert.ok(result.event.timestamp > 0);
    });
  });

  describe("lifecycleHistory", () => {
    it("appends a demotion entry to lifecycleHistory", () => {
      const item = makeItem({ memoryLayer: "N1" });
      const result = demoteItem(item, "N3");
      const hist = result.item.lifecycleHistory;
      assert.equal(hist.length, 1);
      assert.equal(hist[0].type, "demote");
      assert.equal(hist[0].from, "N1");
      assert.equal(hist[0].to, "N3");
    });

    it("preserves existing lifecycleHistory entries", () => {
      const existingHist = [{ type: "created", timestamp: now - 5000 }];
      const item = makeItem({ memoryLayer: "N1", lifecycleHistory: existingHist });
      const result = demoteItem(item, "N3");
      assert.equal(result.item.lifecycleHistory.length, 2);
      assert.equal(result.item.lifecycleHistory[0].type, "created");
      assert.equal(result.item.lifecycleHistory[1].type, "demote");
    });
  });

  describe("metadata", () => {
    it("sets demotedFrom and demotedAt in metadata", () => {
      const item = makeItem({ memoryLayer: "N1" });
      const result = demoteItem(item, "N3");
      assert.equal(result.item.metadata.demotedFrom, "N1");
      assert.ok(result.item.metadata.demotedAt > 0);
    });

    it("preserves existing metadata", () => {
      const item = makeItem({ memoryLayer: "N1", metadata: { foo: "bar" } });
      const result = demoteItem(item, "N2");
      assert.equal(result.item.metadata.foo, "bar");
      assert.ok(result.item.metadata.demotedFrom !== undefined);
    });
  });

  describe("category-based layer inference", () => {
    it("infers current layer from category when no memoryLayer set", () => {
      const item = makeItem({ memoryLayer: undefined, type: "OBSERVATION" });
      const result = demoteItem(item, "N3");
      // OBSERVATION has default N2, demoting to N3 is valid
      assert.equal(result.item.memoryLayer, "N3");
    });
  });

  describe("updatedAt", () => {
    it("sets updatedAt to demotion time", () => {
      const item = makeItem({ memoryLayer: "N1" });
      const result = demoteItem(item, "N2");
      assert.ok(result.item.updatedAt >= now);
    });
  });
});
