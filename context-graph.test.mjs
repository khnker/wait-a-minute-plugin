import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ContextGraph, NODE_TYPES, EDGE_TYPES } from "./context-graph.js";

describe("ContextGraph", () => {
  // -- Node operations --

  describe("addNode", () => {
    it("adds a valid node", () => {
      const g = new ContextGraph();
      const node = g.addNode({
        id: "t1",
        type: "task",
        content: "Build feature X",
        verified: false,
      });
      assert.equal(node.id, "t1");
      assert.equal(node.type, "task");
      assert.ok(node.createdAt > 0);
      assert.ok(node.updatedAt > 0);
    });

    it("rejects invalid node type", () => {
      const g = new ContextGraph();
      assert.throws(() => g.addNode({ id: "x", type: "invalid", content: "" }));
    });

    it("rejects missing id", () => {
      const g = new ContextGraph();
      assert.throws(() => g.addNode({ type: "task", content: "" }));
    });
  });

  describe("getNode", () => {
    it("returns existing node", () => {
      const g = new ContextGraph();
      g.addNode({ id: "t1", type: "task", content: "test", verified: false });
      assert.equal(g.getNode("t1").id, "t1");
    });

    it("returns undefined for missing node", () => {
      const g = new ContextGraph();
      assert.equal(g.getNode("missing"), undefined);
    });
  });

  describe("getNodes", () => {
    it("returns all nodes", () => {
      const g = new ContextGraph();
      g.addNode({ id: "t1", type: "task", content: "a", verified: false });
      g.addNode({ id: "o1", type: "output", content: "b", verified: false });
      assert.equal(g.getNodes().length, 2);
    });

    it("filters by type", () => {
      const g = new ContextGraph();
      g.addNode({ id: "t1", type: "task", content: "a", verified: false });
      g.addNode({ id: "o1", type: "output", content: "b", verified: false });
      assert.equal(g.getNodes("task").length, 1);
      assert.equal(g.getNodes("output").length, 1);
    });
  });

  describe("updateNode", () => {
    it("updates node properties", () => {
      const g = new ContextGraph();
      g.addNode({ id: "t1", type: "task", content: "old", verified: false });
      const updated = g.updateNode("t1", { content: "new", verified: true });
      assert.equal(updated.content, "new");
      assert.equal(updated.verified, true);
      assert.ok(updated.updatedAt > 0);
    });
  });

  describe("removeNode", () => {
    it("removes node and its edges", () => {
      const g = new ContextGraph();
      g.addNode({ id: "t1", type: "task", content: "a", verified: false });
      g.addNode({ id: "o1", type: "output", content: "b", verified: false });
      g.addEdge({ from: "t1", to: "o1", type: "produces" });

      g.removeNode("t1");
      assert.equal(g.hasNode("t1"), false);
      assert.equal(g.getEdgesFrom("t1").length, 0);
      assert.equal(g.getEdgesTo("o1").filter((e) => e.from === "t1").length, 0);
    });
  });

  // -- Edge operations --

  describe("addEdge", () => {
    it("adds a valid edge", () => {
      const g = new ContextGraph();
      g.addNode({ id: "t1", type: "task", content: "a", verified: false });
      g.addNode({ id: "o1", type: "output", content: "b", verified: false });
      const edge = g.addEdge({ from: "t1", to: "o1", type: "produces" });
      assert.equal(edge.from, "t1");
      assert.equal(edge.to, "o1");
      assert.equal(edge.type, "produces");
    });

    it("rejects edge with missing source", () => {
      const g = new ContextGraph();
      g.addNode({ id: "o1", type: "output", content: "b", verified: false });
      assert.throws(() => g.addEdge({ from: "missing", to: "o1", type: "produces" }));
    });

    it("rejects edge with missing target", () => {
      const g = new ContextGraph();
      g.addNode({ id: "t1", type: "task", content: "a", verified: false });
      assert.throws(() => g.addEdge({ from: "t1", to: "missing", type: "produces" }));
    });

    it("deduplicates edges", () => {
      const g = new ContextGraph();
      g.addNode({ id: "t1", type: "task", content: "a", verified: false });
      g.addNode({ id: "o1", type: "output", content: "b", verified: false });
      g.addEdge({ from: "t1", to: "o1", type: "produces" });
      g.addEdge({ from: "t1", to: "o1", type: "produces" });
      assert.equal(g.getEdgesFrom("t1").length, 1);
    });
  });

  // -- Traversal --

  describe("getDependencies", () => {
    it("returns nodes this node depends on", () => {
      const g = new ContextGraph();
      g.addNode({ id: "t1", type: "task", content: "a", verified: false });
      g.addNode({ id: "o1", type: "output", content: "b", verified: false });
      g.addNode({ id: "e1", type: "evidence", content: "c", verified: false });
      g.addEdge({ from: "t1", to: "o1", type: "requires_output" });
      g.addEdge({ from: "t1", to: "e1", type: "requires_evidence" });

      const deps = g.getDependencies("t1");
      assert.equal(deps.length, 2);
      assert.ok(deps.some((d) => d.id === "o1"));
      assert.ok(deps.some((d) => d.id === "e1"));
    });
  });

  describe("getUpstream", () => {
    it("traverses transitively", () => {
      const g = new ContextGraph();
      g.addNode({ id: "t1", type: "task", content: "a", verified: false });
      g.addNode({ id: "t2", type: "task", content: "b", verified: false });
      g.addNode({ id: "o1", type: "output", content: "c", verified: false });
      g.addEdge({ from: "t1", to: "t2", type: "requires_completion" });
      g.addEdge({ from: "t2", to: "o1", type: "requires_output" });

      const upstream = g.getUpstream("t1");
      assert.equal(upstream.length, 2);
      assert.ok(upstream.some((u) => u.id === "t2"));
      assert.ok(upstream.some((u) => u.id === "o1"));
    });

    it("respects maxDepth", () => {
      const g = new ContextGraph();
      g.addNode({ id: "t1", type: "task", content: "a", verified: false });
      g.addNode({ id: "t2", type: "task", content: "b", verified: false });
      g.addNode({ id: "t3", type: "task", content: "c", verified: false });
      g.addEdge({ from: "t1", to: "t2", type: "requires_completion" });
      g.addEdge({ from: "t2", to: "t3", type: "requires_completion" });

      const upstream = g.getUpstream("t1", 1);
      assert.equal(upstream.length, 1);
      assert.equal(upstream[0].id, "t2");
    });
  });

  describe("getDownstream", () => {
    it("finds nodes that depend on this node", () => {
      const g = new ContextGraph();
      g.addNode({ id: "o1", type: "output", content: "a", verified: false });
      g.addNode({ id: "t1", type: "task", content: "b", verified: false });
      g.addEdge({ from: "t1", to: "o1", type: "requires_output" });

      const downstream = g.getDownstream("o1");
      assert.equal(downstream.length, 1);
      assert.equal(downstream[0].id, "t1");
    });
  });

  describe("getContradicting", () => {
    it("finds contradicting nodes", () => {
      const g = new ContextGraph();
      g.addNode({ id: "e1", type: "evidence", content: "a", verified: false });
      g.addNode({ id: "e2", type: "evidence", content: "b", verified: false });
      g.addEdge({ from: "e1", to: "e2", type: "contradicts" });

      const contradicting = g.getContradicting("e1");
      assert.equal(contradicting.length, 1);
      assert.equal(contradicting[0].id, "e2");
    });
  });

  // -- Validation --

  describe("validate", () => {
    it("valid graph passes", () => {
      const g = new ContextGraph();
      g.addNode({ id: "t1", type: "task", content: "a", verified: false });
      g.addNode({ id: "o1", type: "output", content: "b", verified: false });
      g.addEdge({ from: "t1", to: "o1", type: "produces" });

      const result = g.validate();
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it("detects cycle", () => {
      const g = new ContextGraph();
      g.addNode({ id: "t1", type: "task", content: "a", verified: false });
      g.addNode({ id: "t2", type: "task", content: "b", verified: false });
      g.addEdge({ from: "t1", to: "t2", type: "requires_output" });
      g.addEdge({ from: "t2", to: "t1", type: "requires_output" });

      const result = g.validate();
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("Cycle")));
    });
  });

  // -- Core invariant: task depends on output, not entire context --

  describe("invariant: task depends on output", () => {
    it("T2 depends on O1, not all of T1", () => {
      const g = new ContextGraph();

      // T1 produces O1
      g.addNode({ id: "t1", type: "task", content: "Build auth", verified: false });
      g.addNode({ id: "o1", type: "output", content: "Auth module", verified: true });
      g.addNode({ id: "d1", type: "decision", content: "Use JWT", verified: false });
      g.addEdge({ from: "t1", to: "o1", type: "produces" });
      g.addEdge({ from: "t1", to: "d1", type: "produces" });

      // T2 requires O1 (not d1)
      g.addNode({ id: "t2", type: "task", content: "Add middleware", verified: false });
      g.addEdge({ from: "t2", to: "o1", type: "requires_output" });

      // T2's dependencies should only include O1
      const deps = g.getDependencies("t2");
      assert.equal(deps.length, 1);
      assert.equal(deps[0].id, "o1");
      assert.equal(deps[0].content, "Auth module");
    });
  });

  // -- Evidence integrity --

  describe("evidence integrity", () => {
    it("verified evidence remains addressable", () => {
      const g = new ContextGraph();

      g.addNode({ id: "e1", type: "evidence", content: "npm test passed", verified: true });
      g.addNode({ id: "c1", type: "claim", content: "Feature works", verified: false });
      g.addEdge({ from: "c1", to: "e1", type: "requires_evidence" });

      // Even if claim is invalidated, evidence remains
      g.addNode({ id: "e2", type: "evidence", content: "Test fails on CI", verified: true });
      g.addEdge({ from: "e2", to: "c1", type: "invalidates" });

      const evidence = g.getNode("e1");
      assert.ok(evidence);
      assert.equal(evidence.verified, true);
      assert.equal(evidence.content, "npm test passed");
    });
  });

  // -- Stats --

  describe("stats", () => {
    it("returns correct counts", () => {
      const g = new ContextGraph();
      g.addNode({ id: "t1", type: "task", content: "a", verified: false });
      g.addNode({ id: "o1", type: "output", content: "b", verified: false });
      g.addEdge({ from: "t1", to: "o1", type: "produces" });

      const stats = g.stats();
      assert.equal(stats.nodeCount, 2);
      assert.equal(stats.edgeCount, 1);
      assert.equal(stats.nodesByType.task, 1);
      assert.equal(stats.nodesByType.output, 1);
      assert.equal(stats.edgesByType.produces, 1);
    });
  });
});
