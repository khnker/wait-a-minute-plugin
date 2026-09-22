/**
 * Tests for Runtime Context Graph Semantics (Change 02)
 */

import test from "node:test";
import assert from "node:assert";
import { buildRuntimeContextGraph } from "./runtime-context-graph.js";

test("runtime context graph uses correct semantic edge types without depends_on_artifact for constraints", () => {
  const taskState = {
    taskId: "task-1",
    requirements: [
      { id: "req-1", description: "Requirement one" }
    ]
  };

  const decisions = [
    { id: "dec-1", requirementId: "req-1", summary: "Use deterministic router" }
  ];

  const constraints = [
    { id: "con-1", requirementId: "req-1", description: "Must be fast" }
  ];

  const evidenceLineage = [
    { id: "ev-1", requirementId: "req-1", content: "Evidence supports req-1", status: "valid" }
  ];

  const artifacts = [
    { id: "art-1", requirementId: "req-1", path: "src/foo.js" }
  ];

  const observations = [
    { id: "obs-1", requirementId: "req-1", content: "Observed latency" }
  ];

  const hypotheses = [
    { id: "hyp-1", taskId: "task-1", statement: "Hypothesis statement" }
  ];

  const experiments = [
    { id: "exp-1", hypothesisId: "hyp-1", description: "Run test" }
  ];

  const g = buildRuntimeContextGraph({
    taskState,
    decisions,
    constraints,
    evidenceLineage,
    artifacts,
    observations,
    hypotheses,
    experiments
  });

  // Verify constraint edges: must be related_to, not depends_on_artifact
  const conEdges = g.getEdgesFrom("req-1").filter((e) => e.to === "con-1");
  assert.ok(conEdges.length > 0, "Constraint edge must exist");
  for (const edge of conEdges) {
    assert.notStrictEqual(edge.type, "depends_on_artifact", "Constraints must not use depends_on_artifact");
    assert.strictEqual(edge.type, "related_to", "Constraints must use related_to");
  }
  assert.strictEqual(g.getNode("con-1").metadata?.relation, "constraint");

  // Check specific edge types
  assert.ok(g.getEdgesFrom("task-1").some(e => e.to === "req-1" && e.type === "requires_completion"),
    "Task requires_completion req-1");
  assert.ok(g.getEdgesFrom("ev-1").some(e => e.to === "req-1" && e.type === "supports"),
    "Evidence supports req-1");
  assert.ok(g.getEdgesFrom("dec-1").some(e => e.to === "req-1" && e.type === "supports"),
    "Decision supports req-1");
  assert.ok(g.getEdgesFrom("task-1").some(e => e.to === "art-1" && e.type === "produces"),
    "Task produces art-1");
  assert.ok(g.getEdgesFrom("obs-1").some(e => e.to === "req-1" && e.type === "related_to"),
    "Observation related_to req-1");
  assert.ok(g.getEdgesFrom("hyp-1").some(e => e.to === "task-1" && e.type === "related_to"),
    "Hypothesis related_to task-1");
});
