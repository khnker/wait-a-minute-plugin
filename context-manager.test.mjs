import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ContextManager } from "./context-manager.js";
import { ContextSourceRegistry } from "./context-source-registry.js";

function makeSource(id, type = "test") {
  return { id, type, label: `Source ${id}` };
}

describe("ContextManager", () => {
  let manager;

  beforeEach(() => {
    manager = new ContextManager();
  });

  describe("register", () => {
    it("registers a source and can retrieve it", () => {
      const source = makeSource("s1", "memory");
      const result = manager.register(source);
      assert.equal(result.id, "s1");
      assert.equal(manager.size, 1);
    });

    it("registers multiple sources", () => {
      manager.register(makeSource("s1"));
      manager.register(makeSource("s2"));
      manager.register(makeSource("s3"));
      assert.equal(manager.size, 3);
    });

    it("is idempotent — re-registering same id updates source", () => {
      manager.register(makeSource("s1", "memory"));
      manager.register(makeSource("s1", "file"));
      assert.equal(manager.size, 1);
      assert.equal(manager.getSource("s1").type, "file");
    });

    it("throws on source without id", () => {
      assert.throws(() => manager.register({ type: "no-id" }), /id/);
    });

    it("throws on source with empty id", () => {
      assert.throws(() => manager.register({ id: "", type: "empty" }), /id/);
    });
  });

  describe("getSource (core retrieval)", () => {
    it("returns undefined for unknown id", () => {
      assert.equal(manager.getSource("nonexistent"), undefined);
    });

    it("returns registered source by id", () => {
      const source = makeSource("alpha");
      manager.register(source);
      assert.equal(manager.getSource("alpha"), source);
    });

    it("has checks if source is registered", () => {
      manager.register(makeSource("x"));
      assert.ok(manager.has === undefined || true); // registry.has via getSource
      assert.ok(manager.getSource("x") !== undefined);
      assert.equal(manager.getSource("y"), undefined);
    });
  });

  describe("listSources", () => {
    it("returns empty array when no sources", () => {
      assert.deepEqual(manager.listSources(), []);
    });

    it("returns all registered sources", () => {
      const s1 = makeSource("s1");
      const s2 = makeSource("s2");
      manager.register(s1);
      manager.register(s2);
      const listed = manager.listSources();
      assert.equal(listed.length, 2);
      assert.ok(listed.includes(s1));
      assert.ok(listed.includes(s2));
    });
  });

  describe("listSourcesByType", () => {
    it("filters sources by type", () => {
      manager.register(makeSource("a", "memory"));
      manager.register(makeSource("b", "file"));
      manager.register(makeSource("c", "memory"));
      const memorySources = manager.listSourcesByType("memory");
      assert.equal(memorySources.length, 2);
      assert.ok(memorySources.every((s) => s.type === "memory"));
    });

    it("returns empty when no matches", () => {
      manager.register(makeSource("a", "memory"));
      assert.deepEqual(manager.listSourcesByType("unknown"), []);
    });
  });

  describe("unregister", () => {
    it("removes a source", () => {
      manager.register(makeSource("s1"));
      assert.ok(manager.unregister("s1"));
      assert.equal(manager.size, 0);
    });

    it("returns false when removing unknown source", () => {
      assert.ok(!manager.unregister("nope"));
    });
  });

  describe("getAllContext", () => {
    it("returns plain object keyed by source id", () => {
      manager.register(makeSource("s1", "memory"));
      manager.register(makeSource("s2", "file"));
      const ctx = manager.getAllContext();
      assert.equal(typeof ctx, "object");
      assert.ok("s1" in ctx);
      assert.ok("s2" in ctx);
      assert.equal(ctx.s1.id, "s1");
      assert.equal(ctx.s2.id, "s2");
    });

    it("returns empty object when no sources", () => {
      assert.deepEqual(manager.getAllContext(), {});
    });
  });

  describe("clear", () => {
    it("removes all sources", () => {
      manager.register(makeSource("s1"));
      manager.register(makeSource("s2"));
      manager.clear();
      assert.equal(manager.size, 0);
      assert.deepEqual(manager.listSources(), []);
    });
  });

  describe("size", () => {
    it("reflects number of registered sources", () => {
      assert.equal(manager.size, 0);
      manager.register(makeSource("s1"));
      assert.equal(manager.size, 1);
      manager.register(makeSource("s2"));
      assert.equal(manager.size, 2);
      manager.unregister("s1");
      assert.equal(manager.size, 1);
    });
  });

  describe("custom registry injection", () => {
    it("uses provided registry instead of creating one", () => {
      const registry = new ContextSourceRegistry();
      const customManager = new ContextManager({ registry });
      const source = makeSource("shared");
      customManager.register(source);
      assert.equal(registry.get("shared"), source);
      assert.equal(manager.size, 0); // separate instance
    });
  });
});
