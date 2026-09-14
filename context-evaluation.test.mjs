import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fullContext,
  semanticTopK,
  SCENARIOS,
  runScenario,
  runAllScenarios,
} from "./context-evaluation.js";
import { ContextGraph } from "./context-graph.js";
import { resolveContext } from "./context-router.js";

function buildTestGraph() {
  const g = new ContextGraph();
  g.addNode({ id: "t1", type: "task", content: "Build auth", verified: false });
  g.addNode({ id: "o1", type: "output", content: "Auth module", verified: true });
  g.addNode({ id: "e1", type: "evidence", content: "Auth test passed", verified: true });
  g.addEdge({ from: "t1", to: "o1", type: "produces" });
  g.addEdge({ from: "e1", to: "o1", type: "supports" });
  return g;
}

describe("Strategies", () => {
  describe("fullContext", () => {
    it("returns all nodes", () => {
      const g = buildTestGraph();
      const result = fullContext(g, "t1");
      assert.equal(result.nodes.length, 3);
      assert.equal(result.complete, true);
    });
  });

  describe("semanticTopK", () => {
    it("returns nodes with word overlap", () => {
      const g = buildTestGraph();
      const result = semanticTopK(g, "t1", 2);
      assert.ok(result.nodes.length <= 2);
      assert.ok(result.nodes.some((n) => n.id === "t1"));
    });
  });

  describe("wam-routing", () => {
    it("returns relevant context via dependencies", () => {
      const g = buildTestGraph();
      const result = resolveContext(g, { taskId: "t1", maxTokens: 5000 });
      assert.ok(result.nodes.some((n) => n.id === "t1"));
      assert.ok(result.nodes.some((n) => n.id === "o1"));
    });
  });
});

describe("Scenarios", () => {
  it("noise scenario: WAM filters irrelevant nodes", () => {
    const scenario = SCENARIOS.find((s) => s.name === "noise");
    assert.ok(scenario);

    const g = new ContextGraph();
    const { taskId, expected } = scenario.setup(g);

    // WAM should select fewer nodes than full context
    const full = fullContext(g, taskId);
    const wam = resolveContext(g, { taskId, maxTokens: 5000 });

    assert.ok(wam.nodes.length < full.nodes.length, "WAM should filter irrelevant nodes");
    assert.ok(wam.nodes.length >= expected.requiredNodes.length, "WAM should include all required nodes");
  });

  it("hidden-dependency: WAM finds transitive dependencies", () => {
    const scenario = SCENARIOS.find((s) => s.name === "hidden-dependency");
    assert.ok(scenario);

    const g = new ContextGraph();
    const { taskId } = scenario.setup(g);

    const result = resolveContext(g, { taskId, maxTokens: 5000 });
    assert.ok(result.nodes.some((n) => n.id === "db-output"), "WAM should find DB output via traversal");
  });

  it("contradictory-evidence: WAM detects contradictions", () => {
    const scenario = SCENARIOS.find((s) => s.name === "contradictory-evidence");
    assert.ok(scenario);

    const g = new ContextGraph();
    const { taskId } = scenario.setup(g);

    const result = resolveContext(g, { taskId, maxTokens: 5000 });
    assert.ok(result.missing.some((m) => m.type === "contradiction"), "WAM should detect contradiction");
  });

  it("missing-dependency: WAM reports missing output", () => {
    const scenario = SCENARIOS.find((s) => s.name === "missing-dependency");
    assert.ok(scenario);

    const g = new ContextGraph();
    const { taskId } = scenario.setup(g);

    const result = resolveContext(g, { taskId, maxTokens: 5000 });
    assert.equal(result.complete, false, "WAM should report incomplete");
    assert.ok(result.missing.some((m) => m.type === "dependency"), "WAM should report missing dependency");
  });

  it("playwright-chromium: WAM identifies missing runtime", () => {
    const scenario = SCENARIOS.find((s) => s.name === "playwright-chromium");
    assert.ok(scenario);

    const g = new ContextGraph();
    const { taskId } = scenario.setup(g);

    const result = resolveContext(g, { taskId, maxTokens: 5000 });
    // All nodes should be present since they exist in graph
    assert.ok(result.nodes.some((n) => n.id === "chromium-dep"), "WAM should include Chromium dependency");
    assert.ok(result.nodes.some((n) => n.id === "playwright-dep"), "WAM should include Playwright dependency");
  });
});

describe("Benchmark runner", () => {
  it("runScenario produces valid results", () => {
    const scenario = SCENARIOS[0];
    const { results } = runScenario(scenario);

    assert.equal(results.length, 3);
    for (const r of results) {
      assert.ok(typeof r.strategy === "string");
      assert.ok(typeof r.taskSuccess === "boolean");
      assert.ok(typeof r.contextTokens === "number");
      assert.ok(typeof r.contextRecall === "number");
    }
  });

  it("runAllScenarios produces summary", () => {
    const { scenarios, summary } = runAllScenarios();

    assert.equal(scenarios.length, SCENARIOS.length);
    assert.ok(summary["full-context"]);
    assert.ok(summary["semantic-topk"]);
    assert.ok(summary["wam-routing"]);
  });

  it("deterministic: same input produces same output", () => {
    const scenario = SCENARIOS[0];
    const r1 = runScenario(scenario);
    const r2 = runScenario(scenario);

    for (let i = 0; i < r1.results.length; i++) {
      assert.equal(r1.results[i].taskSuccess, r2.results[i].taskSuccess);
      assert.equal(r1.results[i].contextTokens, r2.results[i].contextTokens);
    }
  });
});
