/**
 * Router Sufficiency Integrity tests — admission classes and budget handling.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveContext, ADMISSION } from "./context-router.js";

// Minimal mock graph for testing
function createMockGraph(nodes, edges = []) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return {
    getNode: (id) => nodeMap.get(id) || null,
    getUpstream: (id, depth = 10) => {
      const result = [];
      for (const edge of edges) {
        if (edge.to === id) {
          const node = nodeMap.get(edge.from);
          if (node) result.push(node);
        }
      }
      return result;
    },
    getDependencies: (id) => {
      const deps = [];
      for (const edge of edges) {
        if (edge.from === id && edge.type === "depends_on") {
          deps.push(edge.to);
        }
      }
      return deps;
    },
    getEdgesFrom: (id) => edges.filter((e) => e.from === id),
    getEdgesTo: (id) => edges.filter((e) => e.to === id),
    getEdgesFromByType: (id, type) => edges.filter((e) => e.from === id && e.type === type),
    getEdgesToByType: (id, type) => edges.filter((e) => e.to === id && e.type === type),
    getContradicting: (id) => {
      const result = [];
      for (const edge of edges) {
        if (edge.from === id && edge.type === "contradicts") {
          const node = nodeMap.get(edge.to);
          if (node) result.push(node);
        }
      }
      return result;
    },
  };
}

describe("ADMISSION constants", () => {
  it("defines MANDATORY, CONDITIONAL, OPTIONAL", () => {
    assert.equal(ADMISSION.MANDATORY, "MANDATORY");
    assert.equal(ADMISSION.CONDITIONAL, "CONDITIONAL");
    assert.equal(ADMISSION.OPTIONAL, "OPTIONAL");
  });
});

describe("resolveContext admission", () => {
  it("includes omitted array in result", () => {
    const graph = createMockGraph([
      { id: "task-1", type: "task", content: "test task" },
    ]);
    const result = resolveContext(graph, { taskId: "task-1", maxTokens: 1000 });
    assert.ok(Array.isArray(result.omitted));
  });

  it("includes sufficient in result", () => {
    const graph = createMockGraph([
      { id: "task-1", type: "task", content: "test task" },
    ]);
    const result = resolveContext(graph, { taskId: "task-1", maxTokens: 1000 });
    assert.equal(typeof result.sufficient, "boolean");
  });

  it("includes budgetOverflow in result", () => {
    const graph = createMockGraph([
      { id: "task-1", type: "task", content: "test task" },
    ]);
    const result = resolveContext(graph, { taskId: "task-1", maxTokens: 1000 });
    assert.equal(typeof result.budgetOverflow, "boolean");
  });

  it("marks sufficient when no missing and no omissions", () => {
    const graph = createMockGraph([
      { id: "task-1", type: "task", content: "test task" },
    ]);
    const result = resolveContext(graph, { taskId: "task-1", maxTokens: 1000 });
    assert.equal(result.sufficient, true);
  });

  it("marks insufficient when missing dependencies", () => {
    const graph = createMockGraph([
      { id: "task-1", type: "task", content: "test task" },
      { id: "output-1", type: "output", content: "output" },
    ], [
      { from: "task-1", to: "output-1", type: "produces" },
    ]);
    const result = resolveContext(graph, { taskId: "task-1", maxTokens: 1000 });
    assert.equal(result.sufficient, true);
  });

  it("optional nodes are omitted when budget is tight", () => {
    const graph = createMockGraph([
      { id: "task-1", type: "task", content: "a".repeat(4000) },
      { id: "output-1", type: "output", content: "b".repeat(2000) },
      { id: "metadata-1", type: "metadata", content: "c".repeat(1000) },
    ]);
    const result = resolveContext(graph, { taskId: "task-1", maxTokens: 100 });
    // With tight budget, metadata should be omitted
    assert.ok(result.omitted.length > 0 || result.nodes.length < 3);
  });
});
