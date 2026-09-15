import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { promoteItem } from "./context-promotion.js";
import { LIFECYCLE_STATES } from "./context-lifecycle.js";

const now = 1700000000000;

function makeItem(opts = {}) {
  return Object.freeze({
    id: "item-1",
    type: "CLAIM",
    memoryLayer: opts.memoryLayer || "N3",
    lifecycle: opts.lifecycle || LIFECYCLE_STATES.ACTIVE,
    metadata: opts.metadata || {},
    lifecycleHistory: opts.lifecycleHistory || [],
    updatedAt: opts.updatedAt || now - 1000,
    ...opts,
  });
}

describe("promoteItem", () => {
  beforeEach(() => {
    // clean state between tests — items are frozen copies
  });

  describe("validation", () => {
    it("throws on missing item", () => {
      assert.throws(() => promoteItem(null, "N2"), /item must be an object/);
    });

    it("throws on non-object item", () => {
      assert.throws(() => promoteItem("string", "N2"), /item must be an object/);
    });

    it("throws on invalid target layer", () => {
      assert.throws(() => promoteItem(makeItem(), "N5"), /invalid target layer/);
    });

    it("throws on ARCHIVE target (use demote instead)", () => {
      assert.throws(() => promoteItem(makeItem(), "ARCHIVE"), /use demoteItem/);
    });

    it("throws when not actually promoting (same or lower priority)", () => {
      assert.throws(() => promoteItem(makeItem({ memoryLayer: "N2" }), "N3"), /not a promotion/);
      assert.throws(() => promoteItem(makeItem({ memoryLayer: "N2" }), "N2"), /not a promotion/);
    });
  });

  describe("N3 → N2 promotion", () => {
    it("changes memoryLayer to target", () => {
      const item = makeItem({ memoryLayer: "N3" });
      const result = promoteItem(item, "N2");
      assert.equal(result.item.memoryLayer, "N2");
    });

    it("preserves other item properties", () => {
      const item = makeItem({ type: "CLAIM", id: "abc" });
      const result = promoteItem(item, "N2");
      assert.equal(result.item.id, "abc");
      assert.equal(result.item.type, "CLAIM");
    });

    it("does not change lifecycle for ACTIVE items", () => {
      const item = makeItem({ lifecycle: LIFECYCLE_STATES.ACTIVE });
      const result = promoteItem(item, "N2");
      assert.equal(result.item.lifecycle, LIFECYCLE_STATES.ACTIVE);
    });

    it("returns a new object (immutable — original unchanged)", () => {
      const item = makeItem({ memoryLayer: "N3" });
      const result = promoteItem(item, "N2");
      assert.notEqual(result.item, item);
      assert.equal(item.memoryLayer, "N3");
      assert.equal(result.item.memoryLayer, "N2");
    });
  });

  describe("COMPRESSED → ACTIVE lifecycle transition", () => {
    it("transitions COMPRESSED to ACTIVE during promotion", () => {
      const item = makeItem({
        memoryLayer: "N3",
        lifecycle: LIFECYCLE_STATES.COMPRESSED,
      });
      const result = promoteItem(item, "N1");
      assert.equal(result.item.lifecycle, LIFECYCLE_STATES.ACTIVE);
      assert.equal(result.event.lifecycleChanged, true);
      assert.equal(result.event.fromLifecycle, "COMPRESSED");
      assert.equal(result.event.toLifecycle, "ACTIVE");
    });

    it("records lifecycleChanged: false when no transition needed", () => {
      const item = makeItem({
        memoryLayer: "N3",
        lifecycle: LIFECYCLE_STATES.CREATED,
      });
      const result = promoteItem(item, "N1");
      assert.equal(result.event.lifecycleChanged, false);
    });
  });

  describe("event", () => {
    it("returns a PromotionEvent with type promote", () => {
      const item = makeItem({ memoryLayer: "N3" });
      const result = promoteItem(item, "N2");
      assert.equal(result.event.type, "promote");
      assert.equal(result.event.fromLayer, "N3");
      assert.equal(result.event.toLayer, "N2");
      assert.ok(result.event.timestamp > 0);
    });
  });

  describe("lifecycleHistory", () => {
    it("appends a promotion entry to lifecycleHistory", () => {
      const item = makeItem({ memoryLayer: "N3" });
      const result = promoteItem(item, "N1");
      const hist = result.item.lifecycleHistory;
      assert.equal(hist.length, 1);
      assert.equal(hist[0].type, "promote");
      assert.equal(hist[0].from, "N3");
      assert.equal(hist[0].to, "N1");
    });

    it("preserves existing lifecycleHistory entries", () => {
      const existingHist = [{ type: "created", timestamp: now - 5000 }];
      const item = makeItem({ memoryLayer: "N3", lifecycleHistory: existingHist });
      const result = promoteItem(item, "N1");
      assert.equal(result.item.lifecycleHistory.length, 2);
      assert.equal(result.item.lifecycleHistory[0].type, "created");
      assert.equal(result.item.lifecycleHistory[1].type, "promote");
    });
  });

  describe("metadata", () => {
    it("sets promotedFrom and promotedAt in metadata", () => {
      const item = makeItem({ memoryLayer: "N3" });
      const result = promoteItem(item, "N0");
      assert.equal(result.item.metadata.promotedFrom, "N3");
      assert.ok(result.item.metadata.promotedAt > 0);
    });

    it("preserves existing metadata", () => {
      const item = makeItem({ memoryLayer: "N3", metadata: { foo: "bar" } });
      const result = promoteItem(item, "N1");
      assert.equal(result.item.metadata.foo, "bar");
      assert.ok(result.item.metadata.promotedFrom !== undefined);
    });
  });

  describe("category-based layer inference", () => {
    it("infers current layer from category when no memoryLayer set", () => {
      const item = makeItem({ memoryLayer: undefined, type: "OBSERVATION" });
      const result = promoteItem(item, "N0");
      assert.equal(result.item.memoryLayer, "N0");
    });
  });

  describe("updatetAt", () => {
    it("sets updatedAt to promotion time", () => {
      const item = makeItem({ memoryLayer: "N3" });
      const result = promoteItem(item, "N2");
      assert.ok(result.item.updatedAt >= now);
    });
  });
});
