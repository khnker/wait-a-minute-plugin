/**
 * WAM Context Routing — Evaluation Suite
 *
 * Compares the existing WAM Context Pack against the shadow routing strategy.
 * Prioritizes task correctness and verification over token reduction.
 */

import { ContextGraph } from "./context-graph.js";
import { getCurrentContextPack, getProposedContext, hasRequiredContext, computeOverlap } from "./context-routing-shadow.js";
import { persistTaskState } from "./engine.js";
import fs from "node:fs";
import path from "node:path";

// -- Types --

/**
 * @typedef {Object} EvaluationResult
 * @property {string} scenario
 * @property {string} strategy
 * @property {boolean} taskSuccess
 * @property {boolean} verificationSuccess
 * @property {number} contextTokens
 * @property {number} contextRecall
 * @property {number} contextPrecision
 * @property {number} dependencyCoverage
 * @property {number} evidenceCoverage
 * @property {string[]} missingDependencies
 */

// -- Token estimation --

function estimateTokens(text = "") {
  return Math.ceil((text || "").length / 4);
}

function nodeTokens(node) {
  return estimateTokens(node.content) + 20;
}

// -- Metrics --

function computeMetrics(result, expected, graph) {
  const resultIds = new Set(result.nodeIds);
  const expectedIds = new Set(expected.requiredNodes);

  // Context Recall
  let recall = 0;
  if (expectedIds.size > 0) {
    for (const id of expectedIds) {
      if (resultIds.has(id)) recall++;
    }
    recall /= expectedIds.size;
  }

  // Context Precision
  let precision = 0;
  if (resultIds.size > 0) {
    for (const id of resultIds) {
      if (expectedIds.has(id)) precision++;
    }
    precision /= resultIds.size;
  }

  // Dependency Coverage
  let depCoverage = 1;
  if (expected.missingDeps && expected.missingDeps.length > 0) {
    const foundMissing = result.gaps ? result.gaps.filter((g) => g.type === "missing_dependency") : [];
    depCoverage = foundMissing.length > 0 ? 0 : 1;
  }

  // Evidence Coverage
  const evidenceNodes = graph ? graph.getNodes("evidence") : [];
  const requiredEvidence = evidenceNodes.filter((e) =>
    [...expectedIds].some((id) => {
      if (!graph) return false;
      const edges = graph.getEdgesFrom(id);
      return edges.some((edge) => edge.to === e.id);
    })
  );

  let evidenceCoverage = 1;
  if (requiredEvidence.length > 0) {
    const foundEvidence = requiredEvidence.filter((e) => resultIds.has(e.id));
    evidenceCoverage = foundEvidence.length / requiredEvidence.length;
  }

  // Task Success
  const taskSuccess = expectedIds.size > 0 &&
    [...expectedIds].every((id) => resultIds.has(id));

  // Verification Success
  const contradictions = result.gaps ? result.gaps.filter((g) => g.type === "contradiction") : [];
  const verificationSuccess = contradictions.length === 0 && evidenceCoverage > 0.5;

  return {
    taskSuccess,
    verificationSuccess,
    contextTokens: result.tokenEstimate || 0,
    contextRecall: recall,
    contextPrecision: precision,
    dependencyCoverage: depCoverage,
    evidenceCoverage,
    missingDependencies: result.gaps ? result.gaps.filter((g) => g.type === "missing_dependency").map((g) => g.description) : [],
  };
}

// -- Scenarios --

function buildNoiseScenario() {
  const graph = new ContextGraph();
  const taskId = "task-noise";

  graph.addNode({ id: taskId, type: "task", content: "Build authentication system", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addNode({ id: "auth-output", type: "output", content: "JWT auth module with bcrypt", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addNode({ id: "auth-evidence", type: "evidence", content: "Auth test passed with 100% coverage", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addNode({ id: "auth-decision", type: "decision", content: "Use JWT tokens with 24h expiry", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addNode({ id: "auth-constraint", type: "constraint", content: "Must use bcrypt for password hashing", verified: true, createdAt: Date.now(), updatedAt: Date.now() });

  graph.addEdge({ from: taskId, to: "auth-output", type: "produces" });
  graph.addEdge({ from: taskId, to: "auth-decision", type: "produces" });
  graph.addEdge({ from: "auth-evidence", to: "auth-output", type: "supports" });
  graph.addEdge({ from: taskId, to: "auth-constraint", type: "requires_decision" });

  for (let i = 0; i < 95; i++) {
    graph.addNode({ id: `irr-${i}`, type: "observation", content: `Irrelevant observation ${i}: The weather is nice today`, verified: false, createdAt: Date.now(), updatedAt: Date.now() });
  }

  return {
    name: "noise",
    graph,
    taskId,
    expected: {
      requiredNodes: [taskId, "auth-output", "auth-evidence", "auth-decision", "auth-constraint"],
      missingDeps: [],
    },
  };
}

function buildHiddenDependencyScenario() {
  const graph = new ContextGraph();
  const taskId = "task-deploy";

  graph.addNode({ id: "db-setup", type: "task", content: "Configure PostgreSQL connection pool", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addNode({ id: "db-output", type: "output", content: "PostgreSQL connection string and pool config", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addEdge({ from: "db-setup", to: "db-output", type: "produces" });

  graph.addNode({ id: "api-task", type: "task", content: "Create REST endpoints for user management", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addNode({ id: "api-output", type: "output", content: "Express routes with authentication middleware", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addEdge({ from: "api-task", to: "api-output", type: "produces" });
  graph.addEdge({ from: "api-task", to: "db-output", type: "requires_output" });

  graph.addNode({ id: taskId, type: "task", content: "Deploy application to Kubernetes cluster", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addEdge({ from: taskId, to: "api-output", type: "requires_output" });

  return {
    name: "hidden-dependency",
    graph,
    taskId,
    expected: {
      requiredNodes: [taskId, "api-output", "db-output"],
      missingDeps: [],
    },
  };
}

function buildContradictoryEvidenceScenario() {
  const graph = new ContextGraph();
  const taskId = "task-test";

  graph.addNode({ id: taskId, type: "task", content: "Verify feature works", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addNode({ id: "feature-output", type: "output", content: "Feature implementation", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addNode({ id: "evidence-pass", type: "evidence", content: "Unit test passed locally", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addNode({ id: "evidence-fail", type: "evidence", content: "Integration test failed on CI", verified: true, createdAt: Date.now(), updatedAt: Date.now() });

  graph.addEdge({ from: taskId, to: "feature-output", type: "requires_output" });
  graph.addEdge({ from: taskId, to: "evidence-pass", type: "requires_evidence" });
  graph.addEdge({ from: taskId, to: "evidence-fail", type: "requires_evidence" });
  graph.addEdge({ from: "evidence-pass", to: "evidence-fail", type: "contradicts" });

  return {
    name: "contradictory-evidence",
    graph,
    taskId,
    expected: {
      requiredNodes: [taskId, "feature-output", "evidence-pass", "evidence-fail"],
      missingDeps: [],
    },
  };
}

function buildStaleEvidenceScenario() {
  const graph = new ContextGraph();
  const taskId = "task-data";

  graph.addNode({ id: "old-decision", type: "decision", content: "Use MongoDB for data storage", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addNode({ id: "new-evidence", type: "evidence", content: "MongoDB performance degrades at scale", verified: true, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addNode({ id: taskId, type: "task", content: "Design data layer", verified: false, createdAt: Date.now(), updatedAt: Date.now() });

  graph.addEdge({ from: "new-evidence", to: "old-decision", type: "invalidates" });
  graph.addEdge({ from: taskId, to: "old-decision", type: "requires_decision" });

  return {
    name: "stale-evidence",
    graph,
    taskId,
    expected: {
      requiredNodes: [taskId, "old-decision", "new-evidence"],
      missingDeps: [],
    },
  };
}

function buildMissingDependencyScenario() {
  const graph = new ContextGraph();
  const taskId = "task-missing";

  graph.addNode({ id: taskId, type: "task", content: "Build feature that depends on missing service", verified: false, createdAt: Date.now(), updatedAt: Date.now() });

  // Add edge manually to non-existent node
  const edges = graph.edgesFrom.get(taskId) || [];
  edges.push({ from: taskId, to: "output-missing", type: "requires_output", weight: 1.0 });
  graph.edgesFrom.set(taskId, edges);
  const toEdges = graph.edgesTo.get("output-missing") || [];
  toEdges.push({ from: taskId, to: "output-missing", type: "requires_output", weight: 1.0 });
  graph.edgesTo.set("output-missing", toEdges);

  return {
    name: "missing-dependency",
    graph,
    taskId,
    expected: {
      requiredNodes: [taskId],
      missingDeps: ["output-missing"],
    },
  };
}

function buildPlaywrightChromiumScenario() {
  const graph = new ContextGraph();
  const taskId = "task-scrape";

  graph.addNode({ id: taskId, type: "task", content: "Scrape Lider website with Playwright", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addNode({ id: "browser-output", type: "output", content: "Scraped product data from Lider", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addNode({ id: "chromium-dep", type: "artifact", content: "Chromium browser binary installed", verified: false, createdAt: Date.now(), updatedAt: Date.now() });
  graph.addNode({ id: "playwright-dep", type: "artifact", content: "Playwright npm package installed", verified: true, createdAt: Date.now(), updatedAt: Date.now() });

  graph.addEdge({ from: taskId, to: "browser-output", type: "produces" });
  graph.addEdge({ from: taskId, to: "chromium-dep", type: "depends_on_artifact" });
  graph.addEdge({ from: taskId, to: "playwright-dep", type: "depends_on_artifact" });

  return {
    name: "playwright-chromium",
    graph,
    taskId,
    expected: {
      requiredNodes: [taskId, "browser-output", "chromium-dep", "playwright-dep"],
      missingDeps: [],
    },
  };
}

const SCENARIOS = [
  buildNoiseScenario,
  buildHiddenDependencyScenario,
  buildContradictoryEvidenceScenario,
  buildStaleEvidenceScenario,
  buildMissingDependencyScenario,
  buildPlaywrightChromiumScenario,
];

// -- Benchmark runner --

function runScenarioWithStrategy(scenarioBuilder, strategyName, strategyFn, root) {
  const { name, graph, taskId, expected } = scenarioBuilder();

  // Create task state on disk
  const dir = path.join(root || process.cwd(), ".wam", "tasks", taskId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "state.yaml"),
    JSON.stringify({
      phase: "IMPLEMENTING",
      lastAction: `Test: ${name}`,
      contract: { objective: `Test ${name} scenario` },
      requirements: [{ id: "req-1", title: "Test", status: "pending", evidence: [] }],
      executions: [],
    }, null, 2)
  );

  const result = strategyFn(taskId, graph, root);
  const metrics = computeMetrics(result, expected, graph);

  return {
    scenario: name,
    strategy: strategyName,
    ...metrics,
  };
}

export function runEvaluation(root) {
  const strategies = [
    { name: "current-context-pack", fn: (taskId, graph, root) => getCurrentContextPack(taskId, root) },
    { name: "shadow-routing", fn: (taskId, graph, root) => getProposedContext(taskId, graph, root) },
  ];

  const results = [];
  for (const strategy of strategies) {
    for (const scenarioBuilder of SCENARIOS) {
      const result = runScenarioWithStrategy(scenarioBuilder, strategy.name, strategy.fn, root);
      results.push(result);
    }
  }

  // Summary
  const summary = {};
  for (const r of results) {
    if (!summary[r.strategy]) {
      summary[r.strategy] = { totalTokens: 0, successes: 0, total: 0, avgRecall: 0 };
    }
    summary[r.strategy].totalTokens += r.contextTokens;
    summary[r.strategy].total++;
    if (r.taskSuccess) summary[r.strategy].successes++;
    summary[r.strategy].avgRecall += r.contextRecall;
  }

  for (const key of Object.keys(summary)) {
    summary[key].avgRecall /= summary[key].total;
  }

  return { results, summary };
}
