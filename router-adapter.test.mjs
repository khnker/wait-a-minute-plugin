/**
 * Router Adapter tests — integration between router and assembly.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adaptRouterResult,
  routeAndAdapt,
  buildGraphFromTaskState,
  ADMISSION,
} from "./router-adapter.js";

describe("adaptRouterResult", () => {
  it("transforms nodes to capsules", () => {
    const routerResult = {
      nodes: [
        { id: "task-1", type: "task", content: "test task", metadata: {} },
        { id: "output-1", type: "output", content: "output", metadata: {} },
      ],
      edges: [],
      missing: [],
      omitted: [],
      complete: true,
      sufficient: true,
      tokenEstimate: 100,
    };

    const result = adaptRouterResult(routerResult);
    assert.equal(result.capsules.length, 2);
    assert.equal(result.capsules[0].context_id, "task-1");
    assert.equal(result.sufficiency, "ok");
    assert.equal(result.source, "router");
  });

  it("handles null router result", () => {
    const result = adaptRouterResult(null);
    assert.equal(result.sufficiency, "insufficient");
    assert.equal(result.source, "fallback");
  });

  it("marks missing dependencies as conditions", () => {
    const routerResult = {
      nodes: [],
      edges: [],
      missing: [{ requiredBy: "task-1", type: "dependency", description: "Missing auth" }],
      omitted: [],
      complete: false,
      sufficient: false,
      tokenEstimate: 0,
    };

    const result = adaptRouterResult(routerResult);
    assert.equal(result.sufficiency, "insufficient");
    assert.ok(result.missing.some((m) => m.includes("Missing auth")));
  });

  it("marks mandatory omitted as missing", () => {
    const routerResult = {
      nodes: [],
      edges: [],
      missing: [],
      omitted: [{ id: "node-1", reason: "budget", admission: "MANDATORY" }],
      complete: true,
      sufficient: false,
      tokenEstimate: 0,
    };

    const result = adaptRouterResult(routerResult);
    assert.equal(result.sufficiency, "insufficient");
    assert.ok(result.missing.some((m) => m.includes("Omitted")));
  });
});

describe("routeAndAdapt", () => {
  it("returns fallback for null graph", () => {
    const result = routeAndAdapt(null, { taskId: "task-1" });
    assert.equal(result.source, "fallback");
    assert.equal(result.sufficiency, "insufficient");
  });

  it("returns fallback for null taskId", () => {
    const graph = { getNode: () => null };
    const result = routeAndAdapt(graph, { taskId: null });
    assert.equal(result.source, "fallback");
  });

  it("executes router and adapts result", () => {
    const graph = {
      getNode: (id) => {
        if (id === "task-1") return { id: "task-1", type: "task", content: "test" };
        return null;
      },
      getEdgesFrom: () => [],
      getEdgesTo: () => [],
      getEdgesFromByType: () => [],
      getEdgesToByType: () => [],
      getUpstream: () => [],
      getDependencies: () => [],
      getContradicting: () => [],
    };

    const result = routeAndAdapt(graph, { taskId: "task-1", budget: 1000 });
    assert.equal(result.source, "router");
    assert.ok(result.capsules.length > 0);
  });
});

describe("buildGraphFromTaskState", () => {
  it("creates graph from task state", () => {
    const taskState = {
      taskId: "task-1",
      lastAction: "implement feature",
      requirements: [
        { id: "req-1", title: "Add auth" },
        { id: "req-2", title: "Add tests" },
      ],
    };

    const graph = buildGraphFromTaskState(taskState, "/tmp");
    assert.ok(graph.getNode("task-1"));
    assert.ok(graph.getNode("req-1"));
    assert.ok(graph.getNode("req-2"));
  });

  it("handles empty task state", () => {
    const graph = buildGraphFromTaskState(null, "/tmp");
    assert.equal(graph.getNode("nonexistent"), null);
  });

  it("creates edges from task to requirements", () => {
    const taskState = {
      taskId: "task-1",
      requirements: [{ id: "req-1", title: "Test" }],
    };

    const graph = buildGraphFromTaskState(taskState, "/tmp");
    const edges = graph.getEdgesFrom("task-1");
    assert.equal(edges.length, 1);
    assert.equal(edges[0].to, "req-1");
  });
});
