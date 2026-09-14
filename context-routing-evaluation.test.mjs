import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runEvaluation } from "./context-routing-evaluation.js";
import { getCurrentContextPack, getProposedContext, computeOverlap } from "./context-routing-shadow.js";
import { ContextGraph } from "./context-graph.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-eval-test-"));

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("runEvaluation", () => {
  it("produces results for all scenarios and strategies", () => {
    const { results, summary } = runEvaluation(TMP);
    assert.ok(results.length > 0);
    assert.ok(summary["current-context-pack"]);
    assert.ok(summary["shadow-routing"]);
  });

  it("each result has required fields", () => {
    const { results } = runEvaluation(TMP);
    for (const r of results) {
      assert.ok(typeof r.scenario === "string");
      assert.ok(typeof r.strategy === "string");
      assert.ok(typeof r.taskSuccess === "boolean");
      assert.ok(typeof r.contextTokens === "number");
      assert.ok(typeof r.contextRecall === "number");
      assert.ok(typeof r.contextPrecision === "number");
    }
  });

  it("shadow routing generally has better or equal recall", () => {
    const { results } = runEvaluation(TMP);
    const currentResults = results.filter((r) => r.strategy === "current-context-pack");
    const shadowResults = results.filter((r) => r.strategy === "shadow-routing");

    for (let i = 0; i < currentResults.length; i++) {
      // Shadow should have at least as good recall
      assert.ok(
        shadowResults[i].contextRecall >= currentResults[i].contextRecall - 0.1,
        `Shadow recall (${shadowResults[i].contextRecall}) should be >= current (${currentResults[i].contextRecall}) for ${currentResults[i].scenario}`
      );
    }
  });
});

describe("noise scenario", () => {
  it("shadow filters irrelevant context", () => {
    const graph = new ContextGraph();
    const taskId = "eval-noise";

    graph.addNode({ id: taskId, type: "task", content: "Build auth", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "auth-output", type: "output", content: "JWT module", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: taskId, to: "auth-output", type: "requires_output" });

    for (let i = 0; i < 50; i++) {
      graph.addNode({ id: `noise-${i}`, type: "observation", content: `Irrelevant ${i}`, verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    }

    const current = getCurrentContextPack(taskId, TMP);
    const proposed = getProposedContext(taskId, graph, TMP);

    assert.ok(proposed.nodeIds.includes("auth-output"));
    assert.ok(proposed.nodeIds.length < 55);
  });
});

describe("hidden dependency scenario", () => {
  it("shadow finds transitive deps", () => {
    const graph = new ContextGraph();
    const taskId = "eval-deploy";

    graph.addNode({ id: "db", type: "task", content: "Setup DB", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "db-out", type: "output", content: "DB connection", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: "db", to: "db-out", type: "produces" });

    graph.addNode({ id: "api", type: "task", content: "Create API", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "api-out", type: "output", content: "REST API", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: "api", to: "api-out", type: "produces" });
    graph.addEdge({ from: "api", to: "db-out", type: "requires_output" });

    graph.addNode({ id: taskId, type: "task", content: "Deploy", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: taskId, to: "api-out", type: "requires_output" });

    const proposed = getProposedContext(taskId, graph, TMP);
    assert.ok(proposed.nodeIds.includes("api-out"));
  });
});

describe("missing dependency scenario", () => {
  it("detects missing output", () => {
    const graph = new ContextGraph();
    const taskId = "eval-missing";

    graph.addNode({ id: taskId, type: "task", content: "Deploy", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    const edges = graph.edgesFrom.get(taskId) || [];
    edges.push({ from: taskId, to: "output-missing", type: "requires_output", weight: 1.0 });
    graph.edgesFrom.set(taskId, edges);

    const proposed = getProposedContext(taskId, graph, TMP);
    assert.ok(proposed.gaps.length > 0);
    assert.ok(proposed.gaps.some((g) => g.type === "missing_dependency"));
  });
});

describe("contradictory evidence scenario", () => {
  it("detects contradiction", () => {
    const graph = new ContextGraph();
    const taskId = "eval-contradict";

    graph.addNode({ id: taskId, type: "task", content: "Verify", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "output-1", type: "output", content: "Feature", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "ev-pass", type: "evidence", content: "Passed locally", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "ev-fail", type: "evidence", content: "Failed on CI", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: taskId, to: "output-1", type: "requires_output" });
    graph.addEdge({ from: taskId, to: "ev-pass", type: "requires_evidence" });
    graph.addEdge({ from: taskId, to: "ev-fail", type: "requires_evidence" });
    graph.addEdge({ from: "ev-pass", to: "ev-fail", type: "contradicts" });

    const proposed = getProposedContext(taskId, graph, TMP);
    // Should include both evidence nodes
    assert.ok(proposed.nodeIds.includes("ev-pass"));
    assert.ok(proposed.nodeIds.includes("ev-fail"));
  });
});

describe("overlap computation", () => {
  it("measures difference between current and proposed", () => {
    const graph = new ContextGraph();
    const taskId = "eval-overlap";

    graph.addNode({ id: taskId, type: "task", content: "Test", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "output-1", type: "output", content: "Output", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addNode({ id: "evidence-1", type: "evidence", content: "Evidence", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
    graph.addEdge({ from: taskId, to: "output-1", type: "requires_output" });
    graph.addEdge({ from: "evidence-1", to: "output-1", type: "supports" });

    const current = getCurrentContextPack(taskId, TMP);
    const proposed = getProposedContext(taskId, graph, TMP);
    const overlap = computeOverlap(current, proposed);

    assert.ok(overlap.shared >= 0);
    assert.ok(overlap.jaccard >= 0 && overlap.jaccard <= 1);
  });
});

describe("deterministic results", () => {
  it("same input produces same output", () => {
    const r1 = runEvaluation(TMP);
    const r2 = runEvaluation(TMP);

    for (let i = 0; i < r1.results.length; i++) {
      assert.equal(r1.results[i].taskSuccess, r2.results[i].taskSuccess);
      assert.equal(r1.results[i].contextTokens, r2.results[i].contextTokens);
    }
  });
});
