import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MEMORY_LAYERS,
  WORKING_LAYERS,
  LAYER_CONFIG,
  isMemoryLayer,
  getLayerConfig,
  assignLayer,
  sortByLayer,
  groupByLayer,
  selectEvictions,
  archiveCandidates,
} from "./context-memory-layers.js";

describe("context-memory-layers", () => {
  describe("constants", () => {
    it("defines N0, N1, N2, N3, ARCHIVE", () => {
      assert.deepEqual(Object.keys(MEMORY_LAYERS).sort(), [
        "ARCHIVE",
        "N0",
        "N1",
        "N2",
        "N3",
      ]);
    });

    it("working layers are N0..N3", () => {
      assert.deepEqual(WORKING_LAYERS, ["N0", "N1", "N2", "N3"]);
    });

    it("LAYER_CONFIG is frozen", () => {
      assert.ok(Object.isFrozen(LAYER_CONFIG));
      assert.ok(Object.isFrozen(LAYER_CONFIG.N0));
    });

    it("priorities are monotonic from N0 to ARCHIVE", () => {
      assert.ok(LAYER_CONFIG.N0.priority < LAYER_CONFIG.N1.priority);
      assert.ok(LAYER_CONFIG.N1.priority < LAYER_CONFIG.N2.priority);
      assert.ok(LAYER_CONFIG.N2.priority < LAYER_CONFIG.N3.priority);
      assert.ok(LAYER_CONFIG.N3.priority < LAYER_CONFIG.ARCHIVE.priority);
    });

    it("every layer has non-empty purpose and category list", () => {
      for (const layer of Object.values(MEMORY_LAYERS)) {
        assert.ok(LAYER_CONFIG[layer].purpose.length > 0);
        assert.ok(LAYER_CONFIG[layer].categories.length > 0);
      }
    });
  });

  describe("isMemoryLayer", () => {
    it("accepts known layers", () => {
      assert.equal(isMemoryLayer("N0"), true);
      assert.equal(isMemoryLayer("N1"), true);
      assert.equal(isMemoryLayer("ARCHIVE"), true);
    });

    it("rejects unknown / wrong-type values", () => {
      assert.equal(isMemoryLayer("N4"), false);
      assert.equal(isMemoryLayer(""), false);
      assert.equal(isMemoryLayer(2), false);
      assert.equal(isMemoryLayer(null), false);
      assert.equal(isMemoryLayer(undefined), false);
      assert.equal(isMemoryLayer({}), false);
    });
  });

  describe("getLayerConfig", () => {
    it("returns config for a valid layer", () => {
      const cfg = getLayerConfig("N0");
      assert.equal(cfg.priority, 0);
      assert.ok(cfg.capacity >= 1);
    });

    it("throws on unknown layer", () => {
      assert.throws(() => getLayerConfig("N9"), /Unknown memory layer/);
      assert.throws(() => getLayerConfig(null), /Unknown memory layer/);
    });
  });

  describe("assignLayer()", () => {
    it("uses explicit layer argument", () => {
      const item = { id: "a" };
      const out = assignLayer(item, "N0");
      assert.equal(out.memoryLayer, "N0");
    });

    it("uses item.memoryLayer if present and valid", () => {
      const out = assignLayer({ id: "a", memoryLayer: "N2" });
      assert.equal(out.memoryLayer, "N2");
    });

    it("uses metadata.layer if present and valid", () => {
      const out = assignLayer({ id: "a", metadata: { layer: "N1" } });
      assert.equal(out.memoryLayer, "N1");
    });

    it("defaults by category", () => {
      assert.equal(assignLayer({ id: "x", category: "REQUIREMENT" }).memoryLayer, "N0");
      assert.equal(assignLayer({ id: "x", category: "DECISION" }).memoryLayer, "N0");
      assert.equal(assignLayer({ id: "x", category: "FACT" }).memoryLayer, "N1");
      assert.equal(assignLayer({ id: "x", category: "OBSERVATION" }).memoryLayer, "N2");
      assert.equal(assignLayer({ id: "x", category: "EVIDENCE" }).memoryLayer, "N2");
      assert.equal(assignLayer({ id: "x", category: "CLAIM" }).memoryLayer, "N3");
      assert.equal(assignLayer({ id: "x", category: "ASSUMPTION" }).memoryLayer, "N3");
    });

    it("falls back to N3 when nothing matches", () => {
      const out = assignLayer({ id: "x" });
      assert.equal(out.memoryLayer, "N3");
    });

    it("explicit arg beats item.memoryLayer and metadata", () => {
      const out = assignLayer(
        { id: "a", memoryLayer: "N2", metadata: { layer: "N1" }, category: "FACT" },
        "ARCHIVE"
      );
      assert.equal(out.memoryLayer, "ARCHIVE");
    });

    it("does not mutate input", () => {
      const item = { id: "a", category: "REQUIREMENT" };
      const out = assignLayer(item, "N2");
      assert.equal(item.memoryLayer, undefined);
      assert.equal(out.memoryLayer, "N2");
    });

    it("throws on invalid item", () => {
      assert.throws(() => assignLayer(null), /non-null object/);
    });
  });

  describe("sortByLayer()", () => {
    it("orders by layer priority", () => {
      const items = [
        { id: "n3", memoryLayer: "N3" },
        { id: "n0", memoryLayer: "N0" },
        { id: "n1", memoryLayer: "N1" },
        { id: "arch", memoryLayer: "ARCHIVE" },
        { id: "n2", memoryLayer: "N2" },
      ];
      const out = sortByLayer(items);
      assert.deepEqual(out.map((i) => i.id), ["n0", "n1", "n2", "n3", "arch"]);
    });

    it("is stable within the same layer", () => {
      const items = [
        { id: "a", memoryLayer: "N1", ts: 2 },
        { id: "b", memoryLayer: "N1", ts: 1 },
        { id: "c", memoryLayer: "N0" },
        { id: "d", memoryLayer: "N1", ts: 3 },
      ];
      const out = sortByLayer(items);
      assert.deepEqual(out.map((i) => i.id), ["c", "a", "b", "d"]);
    });

    it("throws on non-array", () => {
      assert.throws(() => sortByLayer("not-array"), /must be an array/);
    });
  });

  describe("groupByLayer()", () => {
    it("groups items by layer", () => {
      const items = [
        { id: "1", memoryLayer: "N0" },
        { id: "2", memoryLayer: "N2" },
        { id: "3", memoryLayer: "N0" },
        { id: "4", memoryLayer: "ARCHIVE" },
      ];
      const out = groupByLayer(items);
      assert.equal(out.N0.length, 2);
      assert.equal(out.N1.length, 0);
      assert.equal(out.N2.length, 1);
      assert.equal(out.N3.length, 0);
      assert.equal(out.ARCHIVE.length, 1);
    });

    it("treats missing layer as N3", () => {
      const out = groupByLayer([{ id: "x" }]);
      assert.equal(out.N3.length, 1);
    });

    it("throws on non-array", () => {
      assert.throws(() => groupByLayer(null), /must be an array/);
    });
  });

  describe("selectEvictions()", () => {
    it("returns empty when under capacity", () => {
      const items = [{ id: "1", memoryLayer: "N0", importance: 0.5, timestamp: 1 }];
      assert.deepEqual(selectEvictions(items), []);
    });

    it("evicts lowest-importance items first", () => {
      const items = [
        { id: "keep1", memoryLayer: "N0", importance: 0.9, timestamp: 5 },
        { id: "keep2", memoryLayer: "N0", importance: 0.7, timestamp: 4 },
        { id: "drop",  memoryLayer: "N0", importance: 0.2, timestamp: 6 },
      ];
      // Bump capacity below size by setting LAYER_CONFIG? Instead, force
      // a small capacity via workingCapacity trick: we test N3 here.
      const itemsN3 = [
        { id: "a", memoryLayer: "N3", importance: 0.1, timestamp: 10 },
        { id: "b", memoryLayer: "N3", importance: 0.9, timestamp: 9 },
        { id: "c", memoryLayer: "N3", importance: 0.3, timestamp: 8 },
      ];
      const evictions = selectEvictions(itemsN3); // N3 cap = 128, 3 items — no eviction
      assert.equal(evictions.length, 0);

      // Build N0 overflow (cap = 16): 17 low-importance + 1 high-importance
      const overflow = [];
      for (let i = 0; i < 17; i++) {
        overflow.push({ id: `low${i}`, memoryLayer: "N0", importance: 0.1, timestamp: i });
      }
      overflow.push({ id: "hi", memoryLayer: "N0", importance: 0.9, timestamp: 100 });
      const dropList = selectEvictions(overflow);
      assert.equal(dropList.length, 2);
      // Evicted items are the lowest-importance, oldest-first
      assert.equal(dropList[0].id, "low0");
      assert.equal(dropList[1].id, "low1");
    });

    it("uses oldest-first as tie-breaker", () => {
      const overflow = [];
      for (let i = 0; i < 17; i++) {
        overflow.push({ id: `eq${i}`, memoryLayer: "N0", importance: 0.5, timestamp: i });
      }
      const dropList = selectEvictions(overflow);
      assert.equal(dropList.length, 1);
      assert.equal(dropList[0].id, "eq0");
    });

    it("ignores ARCHIVE for working-set eviction", () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        id: `arch${i}`,
        memoryLayer: "ARCHIVE",
        importance: 0,
        timestamp: i,
      }));
      // ARCHIVE capacity is Infinity → no eviction
      assert.deepEqual(selectEvictions(items), []);
    });

    it("throws on non-array", () => {
      assert.throws(() => selectEvictions("oops"), /must be an array/);
    });
  });

  describe("archiveCandidates()", () => {
    it("returns items in COMPRESSED/STALE/INVALIDATED/ARCHIVED", () => {
      const items = [
        { id: "1", lifecycle: "CREATED" },
        { id: "2", lifecycle: "ACTIVE" },
        { id: "3", lifecycle: "COMPRESSED" },
        { id: "4", lifecycle: "STALE" },
        { id: "5", lifecycle: "INVALIDATED" },
        { id: "6", lifecycle: "ARCHIVED" },
      ];
      const out = archiveCandidates(items);
      assert.deepEqual(out.map((i) => i.id), ["3", "4", "5", "6"]);
    });

    it("treats missing lifecycle as CREATED (not archive)", () => {
      const out = archiveCandidates([{ id: "1" }]);
      assert.deepEqual(out, []);
    });

    it("throws on non-array", () => {
      assert.throws(() => archiveCandidates({}), /must be an array/);
    });
  });
});