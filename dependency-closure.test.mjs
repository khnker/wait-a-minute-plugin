/**
 * Dependency Closure tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  traverseUpstream,
  traverseDownstream,
  computeDependencyClosure,
  checkTraversalSafety,
} from "./dependency-closure.js";

// Mock graph for testing
function createMockGraph(nodes, edges = []) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return {
    getNode: (id) => nodeMap.get(id) || null,
    getEdgesFrom: (id) => edges.filter((e) => e.from === id),
    getEdgesTo: (id) => edges.filter((e) => e.to === id),
    getEdgesFromByType: (id, type) => edges.filter((e) => e.from === id && e.type === type),
    getEdgesToByType: (id, type) => edges.filter((e) => e.to === id && e.type === type),
  };
}

describe("traverseUpstream", () => {
  it("collects direct dependencies", () => {
    const graph = createMockGraph(
      [
        { id: "task", type: "task", content: "task" },
        { id: "output", type: "output", content: "output" },
      ],
      [{ from: "task", to: "output", type: "depends_on" }]
    );

    const result = traverseUpstream(graph, "task");
    assert.ok(result.nodes.includes("task"));
    assert.ok(result.nodes.includes("output"));
  });

  it("collects transitive dependencies", () => {
    const graph = createMockGraph(
      [
        { id: "task", type: "task", content: "task" },
        { id: "output", type: "output", content: "output" },
        { id: "evidence", type: "evidence", content: "evidence" },
      ],
      [
        { from: "task", to: "output", type: "depends_on" },
        { from: "output", to: "evidence", type: "depends_on" },
      ]
    );

    const result = traverseUpstream(graph, "task");
    assert.equal(result.nodes.length, 3);
  });

  it("handles cycles without infinite loop", () => {
    const graph = createMockGraph(
      [
        { id: "a", type: "task", content: "a" },
        { id: "b", type: "task", content: "b" },
      ],
      [
        { from: "a", to: "b", type: "depends_on" },
        { from: "b", to: "a", type: "depends_on" },
      ]
    );

    const result = traverseUpstream(graph, "a");
    assert.ok(result.nodes.length <= 2);
    assert.equal(result.limitReached, false);
  });

  it("respects maxNodes limit", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({ id: `node-${i}`, type: "task", content: `node ${i}` }));
    const edges = [];
    for (let i = 0; i < 19; i++) {
      edges.push({ from: `node-${i}`, to: `node-${i + 1}`, type: "depends_on" });
    }

    const graph = createMockGraph(nodes, edges);
    const result = traverseUpstream(graph, "node-0", { maxNodes: 5 });
    assert.ok(result.nodes.length <= 5);
    assert.equal(result.limitReached, true);
    assert.equal(result.limitType, "maxNodes");
  });

  it("respects maxCost limit", () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({ id: `node-${i}`, type: "task", content: `node ${i}` }));
    const edges = [];
    for (let i = 0; i < 99; i++) {
      edges.push({ from: `node-${i}`, to: `node-${i + 1}`, type: "depends_on" });
    }

    const graph = createMockGraph(nodes, edges);
    const result = traverseUpstream(graph, "node-0", { maxCost: 10 });
    assert.ok(result.cost <= 11);
    assert.equal(result.limitReached, true);
    assert.equal(result.limitType, "maxCost");
  });

  it("follows produces edges in reverse", () => {
    const graph = createMockGraph(
      [
        { id: "task", type: "task", content: "task" },
        { id: "output", type: "output", content: "output" },
        { id: "upstream", type: "task", content: "upstream" },
      ],
      [
        { from: "upstream", to: "output", type: "produces" },
        { from: "task", to: "output", type: "depends_on" },
      ]
    );

    const result = traverseUpstream(graph, "task");
    assert.ok(result.nodes.includes("upstream"));
  });
});

describe("traverseDownstream", () => {
  it("collects downstream effects", () => {
    const graph = createMockGraph(
      [
        { id: "task", type: "task", content: "task" },
        { id: "output", type: "output", content: "output" },
      ],
      [{ from: "task", to: "output", type: "produces" }]
    );

    const result = traverseDownstream(graph, "task");
    assert.ok(result.nodes.includes("task"));
    assert.ok(result.nodes.includes("output"));
  });

  it("handles empty graph", () => {
    const graph = createMockGraph([{ id: "alone", type: "task", content: "alone" }]);
    const result = traverseDownstream(graph, "alone");
    assert.equal(result.nodes.length, 1);
  });
});

describe("computeDependencyClosure", () => {
  it("combines upstream and downstream", () => {
    const graph = createMockGraph(
      [
        { id: "task", type: "task", content: "task" },
        { id: "upstream", type: "task", content: "upstream" },
        { id: "downstream", type: "output", content: "downstream" },
      ],
      [
        { from: "upstream", to: "task", type: "depends_on" },
        { from: "task", to: "downstream", type: "produces" },
      ]
    );

    const result = computeDependencyClosure(graph, ["task"]);
    assert.ok(result.nodes.includes("upstream"));
    assert.ok(result.nodes.includes("task"));
    assert.ok(result.nodes.includes("downstream"));
  });

  it("handles multiple starting nodes", () => {
    const graph = createMockGraph(
      [
        { id: "a", type: "task", content: "a" },
        { id: "b", type: "task", content: "b" },
        { id: "c", type: "task", content: "c" },
      ],
      [
        { from: "a", to: "b", type: "depends_on" },
        { from: "b", to: "c", type: "depends_on" },
      ]
    );

    const result = computeDependencyClosure(graph, ["a", "c"]);
    assert.equal(result.nodes.length, 3);
  });

  it("deduplicates nodes", () => {
    const graph = createMockGraph(
      [
        { id: "a", type: "task", content: "a" },
        { id: "b", type: "task", content: "b" },
      ],
      [
        { from: "a", to: "b", type: "depends_on" },
        { from: "b", to: "a", type: "depends_on" },
      ]
    );

    const result = computeDependencyClosure(graph, ["a", "b"]);
    assert.equal(result.nodes.length, 2);
  });
});

describe("checkTraversalSafety", () => {
  it("returns safe for simple graphs", () => {
    const graph = createMockGraph([
      { id: "task", type: "task", content: "task" },
    ]);

    const result = checkTraversalSafety(graph, "task");
    assert.equal(result.safe, true);
  });

  it("returns unsafe for deep chains", () => {
    const nodes = Array.from({ length: 50 }, (_, i) => ({ id: `node-${i}`, type: "task", content: `node ${i}` }));
    const edges = [];
    for (let i = 0; i < 49; i++) {
      edges.push({ from: `node-${i}`, to: `node-${i + 1}`, type: "depends_on" });
    }

    const graph = createMockGraph(nodes, edges);
    const result = checkTraversalSafety(graph, "node-0");
    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("limit"));
  });
});
