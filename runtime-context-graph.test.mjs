/**
 * runtime-context-graph.test.mjs — coverage for the layer-aware assembler.
 *
 * Validates that buildRuntimeContextGraph():
 *   - Builds a ContextGraph instance.
 *   - Adds task, requirement, evidence, decision, constraint, artifact,
 *     observation, hypothesis, and experiment nodes when supplied.
 *   - Skips empty input gracefully.
 *   - Adds edges only when both endpoints exist.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { buildRuntimeContextGraph } from "./runtime-context-graph.js";
import { NODE_TYPES } from "./context-graph.js";

test("RCG.1 returns a ContextGraph instance", () => {
  const g = buildRuntimeContextGraph({});
  assert.ok(g);
  assert.equal(typeof g.addNode, "function");
  assert.equal(typeof g.getNodes, "function");
});

test("RCG.2 builds task + requirements with requires_completion edge", () => {
  const g = buildRuntimeContextGraph({
    taskState: {
      taskId: "task-1",
      contract: { objective: "Ship runtime graph" },
      requirements: [
        { id: "req-1", title: "Cover all layers" },
        { id: "req-2", title: "Stay deterministic" },
      ],
    },
  });
  const task = g.getNode("task-1");
  assert.ok(task);
  assert.equal(task.type, "task");
  assert.equal(task.content, "Ship runtime graph");
  const req1 = g.getNode("req-1");
  assert.ok(req1);
  assert.equal(req1.type, "requirement");
  // Per requirement: 1 requires_completion edge + 1 depends_on_artifact to its output shadow
  const edgesFromTask = g.getEdgesFrom("task-1");
  assert.equal(edgesFromTask.filter((e) => e.type === "requires_completion").length, 2);
  assert.equal(edgesFromTask.filter((e) => e.type === "depends_on_artifact").length, 2);
});

test("RCG.3 evidence supports linked requirement", () => {
  const g = buildRuntimeContextGraph({
    taskState: {
      taskId: "task-1",
      requirements: [{ id: "req-1" }],
    },
    evidenceLineage: [
      { id: "ev-1", content: "saw X", requirementId: "req-1", status: "valid" },
      { id: "ev-2", content: "saw Y" }, // no requirement link → fallback to task
    ],
  });
  const ev1 = g.getNode("ev-1");
  assert.ok(ev1);
  assert.equal(ev1.verified, true);
  const ev1Edges = g.getEdgesFrom("ev-1");
  assert.equal(ev1Edges.length, 1);
  assert.equal(ev1Edges[0].to, "req-1");
  assert.equal(ev1Edges[0].type, "supports");

  const ev2 = g.getNode("ev-2");
  assert.ok(ev2);
  const ev2Edges = g.getEdgesFrom("ev-2");
  assert.equal(ev2Edges.length, 1);
  assert.equal(ev2Edges[0].to, "task-1");
});

test("RCG.4 decisions, constraints, artifacts, observations", () => {
  const g = buildRuntimeContextGraph({
    taskState: {
      taskId: "task-1",
      requirements: [{ id: "req-1" }],
    },
    decisions: [{ id: "dec-1", summary: "Use builder pattern", requirementId: "req-1" }],
    constraints: [{ id: "c-1", description: "Must be deterministic" }],
    artifacts: [{ id: "art-1", path: "/tmp/x", requirementId: "req-1" }],
    observations: [{ id: "obs-1", content: "Logged output" }],
  });
  assert.ok(g.getNode("dec-1"));
  assert.ok(g.getNode("c-1"));
  assert.ok(g.getNode("art-1"));
  assert.ok(g.getNode("obs-1"));
  // decision → requirement
  assert.equal(g.getEdgesFrom("dec-1")[0].to, "req-1");
  // task → constraint (depends_on_artifact)
  const taskEdges = g.getEdgesFrom("task-1");
  assert.ok(taskEdges.some((e) => e.to === "c-1" && e.type === "depends_on_artifact"));
  // task → artifact (produces)
  assert.ok(taskEdges.some((e) => e.to === "art-1" && e.type === "produces"));
  // observation → task (related_to)
  assert.equal(g.getEdgesFrom("obs-1")[0].to, "task-1");
});

test("RCG.5 hypotheses and experiments are added only when supplied", () => {
  const noHE = buildRuntimeContextGraph({ taskState: { taskId: "task-1" } });
  assert.equal(noHE.getNodes("claim").length, 0);
  assert.equal(noHE.getNodes("action").length, 0);

  const withHE = buildRuntimeContextGraph({
    taskState: { taskId: "task-1" },
    hypotheses: [{ id: "h-1", statement: "X causes Y" }],
    experiments: [{ id: "exp-1", description: "Run test", hypothesisId: "h-1" }],
  });
  assert.equal(withHE.getNodes("claim").length, 1);
  assert.equal(withHE.getNodes("action").length, 1);
  // experiment → hypothesis (supports)
  const expEdges = withHE.getEdgesFrom("exp-1");
  assert.ok(expEdges.some((e) => e.to === "h-1" && e.type === "supports"));
});

test("RCG.6 cognition summary node is added when cognitionState present", () => {
  const g = buildRuntimeContextGraph({
    taskState: { taskId: "task-1" },
    cognitionState: { id: "cog-1", summary: "Focus on graph", load: 0.4 },
  });
  assert.ok(g.getNode("cog-1"));
  assert.equal(g.getNode("cog-1").metadata.kind, "cognition");
});

test("RCG.7 invalid items are skipped without throwing", () => {
  const g = buildRuntimeContextGraph({
    taskState: { taskId: "task-1" },
    evidenceLineage: [null, { id: "" }, { id: "ev-ok" }],
    decisions: [undefined, { id: "dec-ok", summary: "x" }],
    artifacts: [{ id: "art-ok" }],
  });
  assert.equal(g.getNodes("evidence").length, 1);
  assert.equal(g.getNodes("decision").length, 1);
  assert.equal(g.getNodes("artifact").length, 1);
});

test("RCG.8 all emitted node types are valid NODE_TYPES", () => {
  const g = buildRuntimeContextGraph({
    taskState: {
      taskId: "task-1",
      requirements: [{ id: "req-1" }],
    },
    evidenceLineage: [{ id: "ev-1" }],
    decisions: [{ id: "dec-1" }],
    constraints: [{ id: "c-1" }],
    artifacts: [{ id: "art-1" }],
    observations: [{ id: "obs-1" }],
    hypotheses: [{ id: "h-1" }],
    experiments: [{ id: "exp-1" }],
    cognitionState: { id: "cog-1", summary: "x" },
  });
  for (const n of g.getNodes()) {
    assert.ok(
      NODE_TYPES.includes(n.type),
      `node ${n.id} has invalid type ${n.type}`
    );
  }
});
