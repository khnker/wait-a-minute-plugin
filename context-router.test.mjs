import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ContextGraph } from "./context-graph.js";
import { resolveContext } from "./context-router.js";

function buildTestGraph() {
  const g = new ContextGraph();

  // T1 produces O1
  g.addNode({ id: "t1", type: "task", content: "Build auth module", verified: false });
  g.addNode({ id: "o1", type: "output", content: "Auth module with JWT", verified: true });
  g.addEdge({ from: "t1", to: "o1", type: "produces" });

  // T1 produces D1
  g.addNode({ id: "d1", type: "decision", content: "Use JWT for auth", verified: false });
  g.addEdge({ from: "t1", to: "d1", type: "produces" });

  // T2 requires O1
  g.addNode({ id: "t2", type: "task", content: "Add auth middleware", verified: false });
  g.addEdge({ from: "t2", to: "o1", type: "requires_output" });

  // E1 supports O1
  g.addNode({ id: "e1", type: "evidence", content: "JWT test passed", verified: true });
  g.addEdge({ from: "e1", to: "o1", type: "supports" });

  // C1 constrains T2
  g.addNode({ id: "c1", type: "constraint", content: "Must use bcrypt for passwords", verified: true });
  g.addEdge({ from: "t2", to: "c1", type: "requires_decision" });

  return g;
}

describe("resolveContext", () => {
  it("returns task node when task exists", () => {
    const g = buildTestGraph();
    const result = resolveContext(g, { taskId: "t2", maxTokens: 5000 });
    assert.ok(result.nodes.some((n) => n.id === "t2"));
  });

  it("returns empty with missing task", () => {
    const g = buildTestGraph();
    const result = resolveContext(g, { taskId: "nonexistent", maxTokens: 5000 });
    assert.equal(result.complete, false);
    assert.ok(result.missing.length > 0);
  });

  it("includes required outputs", () => {
    const g = buildTestGraph();
    const result = resolveContext(g, { taskId: "t2", maxTokens: 5000 });
    assert.ok(result.nodes.some((n) => n.id === "o1"), "should include o1");
  });

  it("includes supporting evidence", () => {
    const g = buildTestGraph();
    const result = resolveContext(g, { taskId: "t2", maxTokens: 5000 });
    assert.ok(result.nodes.some((n) => n.id === "e1"), "should include e1");
  });

  it("includes constraints", () => {
    const g = buildTestGraph();
    const result = resolveContext(g, { taskId: "t2", maxTokens: 5000 });
    assert.ok(result.nodes.some((n) => n.id === "c1"), "should include c1");
  });

  it("respects token budget", () => {
    const g = buildTestGraph();
    const result = resolveContext(g, { taskId: "t2", maxTokens: 50 });
    assert.ok(result.tokenEstimate <= 50);
  });

  it("is deterministic", () => {
    const g = buildTestGraph();
    const r1 = resolveContext(g, { taskId: "t2", maxTokens: 5000 });
    const r2 = resolveContext(g, { taskId: "t2", maxTokens: 5000 });
    assert.deepEqual(
      r1.nodes.map((n) => n.id),
      r2.nodes.map((n) => n.id)
    );
  });

  it("detects missing dependencies", () => {
    const g = new ContextGraph();
    g.addNode({ id: "t1", type: "task", content: "Build feature", verified: false });
    g.addNode({ id: "o1", type: "output", content: "Feature output", verified: true });
    g.addEdge({ from: "t1", to: "o1", type: "requires_output" });

    g.addNode({ id: "t2", type: "task", content: "Use feature", verified: false });
    g.addNode({ id: "o2", type: "output", content: "Feature output 2", verified: true });
    g.addEdge({ from: "t2", to: "o1", type: "requires_output" });
    g.addEdge({ from: "t2", to: "o2", type: "requires_output" });

    // Manually add edge to non-existent node to simulate missing dependency
    const edges = g.edgesFrom.get("t2") || [];
    edges.push({ from: "t2", to: "nonexistent-node", type: "requires_output" });
    g.edgesFrom.set("t2", edges);

    const result = resolveContext(g, { taskId: "t2", maxTokens: 5000 });
    // The missing node should be detected
    assert.ok(result.missing.some((m) => m.type === "dependency"), `missing: ${JSON.stringify(result.missing)}`);
  });

  it("detects contradictory evidence", () => {
    const g = new ContextGraph();
    g.addNode({ id: "t1", type: "task", content: "Test feature", verified: false });
    g.addNode({ id: "e1", type: "evidence", content: "Feature works", verified: true });
    g.addNode({ id: "e2", type: "evidence", content: "Feature broken", verified: true });
    g.addEdge({ from: "t1", to: "e1", type: "requires_evidence" });
    g.addEdge({ from: "t1", to: "e2", type: "requires_evidence" });
    g.addEdge({ from: "e1", to: "e2", type: "contradicts" });

    const result = resolveContext(g, { taskId: "t1", maxTokens: 5000 });
    assert.ok(result.missing.some((m) => m.type === "contradiction"));
  });

  it("hidden dependency found via graph traversal", () => {
    const g = new ContextGraph();
    // T1 -> O1 -> T2 -> O2 -> T3
    g.addNode({ id: "t1", type: "task", content: "Setup DB", verified: false });
    g.addNode({ id: "o1", type: "output", content: "DB connection", verified: true });
    g.addEdge({ from: "t1", to: "o1", type: "produces" });

    g.addNode({ id: "t2", type: "task", content: "Create API", verified: false });
    g.addEdge({ from: "t2", to: "o1", type: "requires_output" });
    g.addNode({ id: "o2", type: "output", content: "REST API", verified: true });
    g.addEdge({ from: "t2", to: "o2", type: "produces" });

    // T3 depends on O2, which depends on T2, which depends on O1
    g.addNode({ id: "t3", type: "task", content: "Deploy API to production", verified: false });
    g.addEdge({ from: "t3", to: "o2", type: "requires_output" });

    const result = resolveContext(g, { taskId: "t3", maxTokens: 5000 });
    // T3 should get O2 (direct dep) and O1 (transitive via T2)
    assert.ok(result.nodes.some((n) => n.id === "o2"), "should include o2");
    assert.ok(result.nodes.some((n) => n.id === "o1"), "should include o1 via traversal");
  });

  it("verified evidence ranks higher than unverified", () => {
    const g = new ContextGraph();
    g.addNode({ id: "t1", type: "task", content: "Test feature", verified: false });
    g.addNode({ id: "e1", type: "evidence", content: "Feature works locally", verified: false });
    g.addNode({ id: "e2", type: "evidence", content: "Feature works on CI", verified: true });
    g.addEdge({ from: "t1", to: "e1", type: "requires_evidence" });
    g.addEdge({ from: "t1", to: "e2", type: "requires_evidence" });

    const result = resolveContext(g, { taskId: "t1", maxTokens: 100 });
    // With small budget, verified evidence should rank higher
    const e2Idx = result.nodes.findIndex((n) => n.id === "e2");
    const e1Idx = result.nodes.findIndex((n) => n.id === "e1");
    if (e1Idx !== -1 && e2Idx !== -1) {
      assert.ok(e2Idx < e1Idx, "verified evidence should come first");
    }
  });
});
