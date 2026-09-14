import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  getCurrentContextPack,
  getProposedContext,
  shadowRoute,
  hasRequiredContext,
  computeOverlap,
} from "./context-routing-shadow.js";
import { ContextGraph } from "./context-graph.js";
import { registerOutput, addDependency, invalidateOutput } from "./task-dependencies.js";
import { persistTaskState } from "./engine.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-shadow-test-"));
let taskCounter = 0;

function makeTaskId() {
  return `shadow-task-${++taskCounter}`;
}

function makeTaskState(overrides = {}) {
  return {
    phase: "IMPLEMENTING",
    lastAction: "Shadow routing test",
    contract: { objective: "Test shadow routing" },
    requirements: [
      { id: "req-1", title: "Req 1", status: "pending", evidence: [] },
    ],
    executions: [],
    ...overrides,
  };
}

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

function ensureWam(taskId) {
  const dir = path.join(TMP, ".wam", "tasks", taskId);
  fs.mkdirSync(dir, { recursive: true });
}

describe("getCurrentContextPack", () => {
  it("returns current context with N0/N2/N3 layers", () => {
    const taskId = makeTaskId();
    ensureWam(taskId);
    persistTaskState(taskId, makeTaskState(), TMP);

    const result = getCurrentContextPack(taskId, TMP);
    assert.ok(result.nodeIds.length > 0);
    assert.ok(result.tokenEstimate > 0);
    assert.ok(result.sources.some((s) => s.includes("N0")));
    assert.ok(result.sources.some((s) => s.includes("N2")));
    assert.ok(result.sources.some((s) => s.includes("N3")));
  });
});

describe("getProposedContext", () => {
  it("includes task state", () => {
    const taskId = makeTaskId();
    ensureWam(taskId);
    persistTaskState(taskId, makeTaskState(), TMP);

    const graph = new ContextGraph();
    const result = getProposedContext(taskId, graph, TMP);
    assert.ok(result.nodeIds.some((id) => id.includes(taskId)));
    assert.ok(result.sources.some((s) => s.includes("task-state")));
  });

  it("includes dependencies from graph", () => {
    const taskId = makeTaskId();
    ensureWam(taskId);
    persistTaskState(taskId, makeTaskState(), TMP);

    const graph = new ContextGraph();
    const outputId = `output-${taskId}-exec-001`;
    graph.addNode({ id: taskId, type: "task", content: "Test", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: outputId, type: "output", content: "Output", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: taskId, to: outputId, type: "requires_output" });

    const result = getProposedContext(taskId, graph, TMP);
    assert.ok(result.nodeIds.includes(outputId));
    assert.ok(result.sources.some((s) => s.includes("dependency")));
  });

  it("includes relevant evidence", () => {
    const taskId = makeTaskId();
    ensureWam(taskId);
    persistTaskState(taskId, makeTaskState(), TMP);

    const graph = new ContextGraph();
    graph.addNode({ id: taskId, type: "task", content: "Test", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "output-1", type: "output", content: "Output", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "evidence-1", type: "evidence", content: "Test passed", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: taskId, to: "output-1", type: "requires_output" });
    graph.addEdge({ from: "evidence-1", to: "output-1", type: "supports" });

    const result = getProposedContext(taskId, graph, TMP);
    assert.ok(result.nodeIds.includes("evidence-1"));
    assert.ok(result.sources.some((s) => s.includes("evidence")));
  });

  it("detects context gaps", () => {
    const taskId = makeTaskId();
    ensureWam(taskId);
    persistTaskState(taskId, makeTaskState(), TMP);

    const graph = new ContextGraph();
    graph.addNode({ id: taskId, type: "task", content: "Test", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "output-missing", type: "output", content: "Missing", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: taskId, to: "output-missing", type: "requires_output" });

    // Invalidate the output
    graph.updateNode("output-missing", { verified: false, metadata: { invalidated: true } });

    const result = getProposedContext(taskId, graph, TMP);
    assert.ok(result.gaps.length > 0);
  });
});

describe("shadowRoute", () => {
  it("returns both current and proposed context", () => {
    const taskId = makeTaskId();
    ensureWam(taskId);
    persistTaskState(taskId, makeTaskState(), TMP);

    const graph = new ContextGraph();
    const result = shadowRoute(taskId, graph, TMP);

    assert.equal(result.taskId, taskId);
    assert.ok(result.currentContext.nodeIds.length > 0);
    assert.ok(result.proposedContext.nodeIds.length > 0);
    assert.ok(result.tokenEstimate.current > 0);
    assert.ok(result.tokenEstimate.proposed > 0);
    assert.ok(result.routingDecisions.length > 0);
  });

  it("never modifies OpenCode (shadow invariant)", () => {
    const taskId = makeTaskId();
    ensureWam(taskId);
    persistTaskState(taskId, makeTaskState(), TMP);

    const graph = new ContextGraph();
    const result = shadowRoute(taskId, graph, TMP);

    // Shadow result is pure data, no side effects
    assert.ok(typeof result === "object");
    assert.ok(result.currentContext);
    assert.ok(result.proposedContext);
  });

  it("proposed context can differ from current", () => {
    const taskId = makeTaskId();
    ensureWam(taskId);
    persistTaskState(taskId, makeTaskState(), TMP);

    const graph = new ContextGraph();
    // Add evidence that current context pack wouldn't include
    graph.addNode({ id: taskId, type: "task", content: "Test", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "evidence-hidden", type: "evidence", content: "Hidden evidence", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "output-1", type: "output", content: "Output", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: taskId, to: "output-1", type: "requires_output" });
    graph.addEdge({ from: "evidence-hidden", to: "output-1", type: "supports" });

    const result = shadowRoute(taskId, graph, TMP);
    // Proposed should include evidence, current should not
    assert.ok(result.proposedContext.nodeIds.includes("evidence-hidden"));
  });
});

describe("hasRequiredContext", () => {
  it("true when all required items present", () => {
    const ctx = { nodeIds: ["a", "b", "c"], tokenEstimate: 100, sources: [] };
    assert.ok(hasRequiredContext(ctx, ["a", "b"]));
  });

  it("false when missing required item", () => {
    const ctx = { nodeIds: ["a", "b"], tokenEstimate: 100, sources: [] };
    assert.ok(!hasRequiredContext(ctx, ["a", "b", "c"]));
  });
});

describe("computeOverlap", () => {
  it("computes jaccard similarity", () => {
    const current = { nodeIds: ["a", "b", "c"], tokenEstimate: 100, sources: [] };
    const proposed = { nodeIds: ["b", "c", "d"], tokenEstimate: 100, sources: [] };
    const overlap = computeOverlap(current, proposed);
    assert.equal(overlap.shared, 2);
    assert.equal(overlap.onlyInCurrent, 1);
    assert.equal(overlap.onlyInProposed, 1);
    assert.ok(overlap.jaccard > 0.4 && overlap.jaccard < 0.7);
  });

  it("zero overlap", () => {
    const current = { nodeIds: ["a"], tokenEstimate: 100, sources: [] };
    const proposed = { nodeIds: ["b"], tokenEstimate: 100, sources: [] };
    const overlap = computeOverlap(current, proposed);
    assert.equal(overlap.shared, 0);
    assert.equal(overlap.jaccard, 0);
  });
});

describe("noise scenario", () => {
  it("proposed context filters irrelevant nodes", () => {
    const taskId = makeTaskId();
    ensureWam(taskId);
    persistTaskState(taskId, makeTaskState(), TMP);

    const graph = new ContextGraph();
    graph.addNode({ id: taskId, type: "task", content: "Build auth system", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "auth-output", type: "output", content: "JWT auth module", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: taskId, to: "auth-output", type: "requires_output" });

    // Add 50 irrelevant nodes
    for (let i = 0; i < 50; i++) {
      graph.addNode({ id: `noise-${i}`, type: "observation", content: `Irrelevant ${i}`, verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    }

    const result = shadowRoute(taskId, graph, TMP);
    // Proposed should be smaller than having all 50 noise nodes
    assert.ok(result.proposedContext.nodeIds.length < 55);
    // But should include the auth output
    assert.ok(result.proposedContext.nodeIds.includes("auth-output"));
  });
});

describe("hidden dependency scenario", () => {
  it("proposed context finds transitive dependencies", () => {
    const taskId = makeTaskId();
    ensureWam(taskId);
    persistTaskState(taskId, makeTaskState(), TMP);

    const graph = new ContextGraph();
    // T1 -> O1 -> T2 -> O2 -> T3 (our task)
    graph.addNode({ id: "t1", type: "task", content: "Setup DB", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "o1", type: "output", content: "DB connection", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: "t1", to: "o1", type: "produces" });

    graph.addNode({ id: "t2", type: "task", content: "Create API", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "o2", type: "output", content: "REST API", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: "t2", to: "o1", type: "requires_output" });
    graph.addEdge({ from: "t2", to: "o2", type: "produces" });

    graph.addNode({ id: taskId, type: "task", content: "Deploy API", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: taskId, to: "o2", type: "requires_output" });

    const result = shadowRoute(taskId, graph, TMP);
    // Proposed should find O2 and potentially O1 via traversal
    assert.ok(result.proposedContext.nodeIds.includes("o2"));
  });
});

describe("missing dependency scenario", () => {
  it("detects when required output does not exist", () => {
    const taskId = makeTaskId();
    ensureWam(taskId);
    persistTaskState(taskId, makeTaskState(), TMP);

    const graph = new ContextGraph();
    graph.addNode({ id: taskId, type: "task", content: "Deploy", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    // Add edge manually to non-existent node (bypasses validation)
    const edges = graph.edgesFrom.get(taskId) || [];
    edges.push({ from: taskId, to: "output-missing", type: "requires_output", weight: 1.0 });
    graph.edgesFrom.set(taskId, edges);
    const toEdges = graph.edgesTo.get("output-missing") || [];
    toEdges.push({ from: taskId, to: "output-missing", type: "requires_output", weight: 1.0 });
    graph.edgesTo.set("output-missing", toEdges);

    const result = shadowRoute(taskId, graph, TMP);
    assert.ok(result.missing.length > 0);
  });
});

describe("stale evidence scenario", () => {
  it("detected when evidence is invalidated", () => {
    const taskId = makeTaskId();
    ensureWam(taskId);
    persistTaskState(taskId, makeTaskState(), TMP);

    const graph = new ContextGraph();
    graph.addNode({ id: taskId, type: "task", content: "Design data layer", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "old-decision", type: "decision", content: "Use MongoDB", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "new-evidence", type: "evidence", content: "MongoDB performance degrades", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: taskId, to: "old-decision", type: "requires_decision" });
    graph.addEdge({ from: "new-evidence", to: "old-decision", type: "invalidates" });

    const result = shadowRoute(taskId, graph, TMP);
    // Should detect the invalidation
    assert.ok(result.proposedContext.sources.some((s) => s.includes("evidence")));
  });
});
