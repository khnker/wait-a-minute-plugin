/**
 * WAM Context Evaluation — Benchmark suite for comparing context strategies.
 *
 * Runs deterministic benchmarks comparing:
 * 1. Full Context
 * 2. Semantic Top-K
 * 3. WAM Context Routing
 *
 * No OpenCode integration. Runs in isolation.
 */

import { ContextGraph } from "./context-graph.js";
import { resolveContext } from "./context-router.js";

// -- Types --

/**
 * @typedef {Object} ContextEvaluation
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

/**
 * @typedef {Object} BenchmarkScenario
 * @property {string} name
 * @property {string} description
 * @property {(graph: ContextGraph) => { taskId: string, expected: { requiredNodes: string[], missingDeps: string[] } }} setup
 */

// -- Token estimation --

function estimateTokens(text = "") {
  return Math.ceil((text || "").length / 4);
}

function nodeTokens(node) {
  return estimateTokens(node.content) + 20;
}

// -- Strategies --

/**
 * Full Context: returns all nodes.
 */
export function fullContext(graph, taskId) {
  const nodes = graph.getNodes();
  const edges = [];
  for (const node of nodes) {
    for (const edge of graph.getEdgesFrom(node.id)) {
      edges.push(edge);
    }
  }
  const tokenEstimate = nodes.reduce((sum, n) => sum + nodeTokens(n), 0);
  return { nodes, edges, missing: [], complete: true, tokenEstimate };
}

/**
 * Semantic Top-K: returns nodes with highest word overlap.
 */
export function semanticTopK(graph, taskId, k = 10) {
  const taskNode = graph.getNode(taskId);
  if (!taskNode) return { nodes: [], edges: [], missing: [], complete: false, tokenEstimate: 0 };

  const taskWords = new Set(
    taskNode.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );

  const scored = graph.getNodes().map((node) => {
    const nodeWords = new Set(
      node.content.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    );
    let overlap = 0;
    for (const w of nodeWords) if (taskWords.has(w)) overlap++;
    const score = nodeWords.size > 0 ? overlap / nodeWords.size : 0;
    return { node, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, k).map((s) => s.node);
  const selectedIds = new Set(selected.map((n) => n.id));

  const edges = [];
  for (const node of selected) {
    for (const edge of graph.getEdgesFrom(node.id)) {
      if (selectedIds.has(edge.to)) edges.push(edge);
    }
  }

  const tokenEstimate = selected.reduce((sum, n) => sum + nodeTokens(n), 0);
  return { nodes: selected, edges, missing: [], complete: true, tokenEstimate };
}

// -- Evaluation metrics --

function computeMetrics(result, expected, graph) {
  const resultIds = new Set(result.nodes.map((n) => n.id));
  const expectedIds = new Set(expected.requiredNodes);

  // Context Recall: how many expected nodes were retrieved
  let recall = 0;
  if (expectedIds.size > 0) {
    for (const id of expectedIds) {
      if (resultIds.has(id)) recall++;
    }
    recall /= expectedIds.size;
  }

  // Context Precision: how many retrieved nodes are actually needed
  let precision = 0;
  if (resultIds.size > 0) {
    for (const id of resultIds) {
      if (expectedIds.has(id)) precision++;
    }
    precision /= resultIds.size;
  }

  // Dependency Coverage: are all dependencies satisfied?
  let depCoverage = 1;
  if (expected.missingDeps.length > 0) {
    const foundMissing = result.missing.filter((m) => m.type === "dependency");
    depCoverage = foundMissing.length > 0 ? 0 : 1;
  }

  // Evidence Coverage: are evidence nodes present?
  const evidenceNodes = graph.getNodes("evidence");
  const requiredEvidence = evidenceNodes.filter((e) =>
    [...expectedIds].some((id) => {
      const edges = graph.getEdgesFrom(id);
      return edges.some((edge) => edge.to === e.id);
    })
  );

  let evidenceCoverage = 1;
  if (requiredEvidence.length > 0) {
    const foundEvidence = requiredEvidence.filter((e) => resultIds.has(e.id));
    evidenceCoverage = foundEvidence.length / requiredEvidence.length;
  }

  // Task Success: all required nodes present
  const taskSuccess = expectedIds.size > 0 &&
    [...expectedIds].every((id) => resultIds.has(id));

  // Verification Success: no contradictions and all evidence present
  const contradictions = result.missing.filter((m) => m.type === "contradiction");
  const verificationSuccess = contradictions.length === 0 && evidenceCoverage > 0.5;

  return {
    taskSuccess,
    verificationSuccess,
    contextTokens: result.tokenEstimate,
    contextRecall: recall,
    contextPrecision: precision,
    dependencyCoverage: depCoverage,
    evidenceCoverage,
    missingDependencies: result.missing.filter((m) => m.type === "dependency").map((m) => m.description),
  };
}

// -- Scenarios --

/** @type {BenchmarkScenario[]} */
export const SCENARIOS = [
  {
    name: "noise",
    description: "100 nodes, 5 relevant, 95 irrelevant",
    setup: (graph) => {
      // Add 95 irrelevant nodes
      for (let i = 0; i < 95; i++) {
        graph.addNode({
          id: `irr-${i}`,
          type: "observation",
          content: `Irrelevant observation ${i}: The weather is nice today and we had lunch`,
          verified: false,
        });
      }

      // Add 5 relevant nodes with dependencies
      graph.addNode({ id: "task-1", type: "task", content: "Build authentication system", verified: false });
      graph.addNode({ id: "output-1", type: "output", content: "JWT auth module with bcrypt", verified: true });
      graph.addNode({ id: "evidence-1", type: "evidence", content: "Auth test passed with 100% coverage", verified: true });
      graph.addNode({ id: "decision-1", type: "decision", content: "Use JWT tokens with 24h expiry", verified: false });
      graph.addNode({ id: "constraint-1", type: "constraint", content: "Must use bcrypt for password hashing", verified: true });

      graph.addEdge({ from: "task-1", to: "output-1", type: "produces" });
      graph.addEdge({ from: "task-1", to: "decision-1", type: "produces" });
      graph.addEdge({ from: "evidence-1", to: "output-1", type: "supports" });
      graph.addEdge({ from: "task-1", to: "constraint-1", type: "requires_decision" });

      return {
        taskId: "task-1",
        expected: {
          requiredNodes: ["task-1", "output-1", "evidence-1", "decision-1", "constraint-1"],
          missingDeps: [],
        },
      };
    },
  },

  {
    name: "hidden-dependency",
    description: "Required context has low semantic similarity but is connected via graph",
    setup: (graph) => {
      graph.addNode({ id: "db-setup", type: "task", content: "Configure PostgreSQL connection pool", verified: false });
      graph.addNode({ id: "db-output", type: "output", content: "PostgreSQL connection string and pool config", verified: true });
      graph.addEdge({ from: "db-setup", to: "db-output", type: "produces" });

      graph.addNode({ id: "api-task", type: "task", content: "Create REST endpoints for user management", verified: false });
      graph.addNode({ id: "api-output", type: "output", content: "Express routes with authentication middleware", verified: true });
      graph.addEdge({ from: "api-task", to: "api-output", type: "produces" });
      graph.addEdge({ from: "api-task", to: "db-output", type: "requires_output" });

      // This task has low semantic similarity to DB but depends on it transitively
      graph.addNode({ id: "deploy-task", type: "task", content: "Deploy application to Kubernetes cluster", verified: false });
      graph.addEdge({ from: "deploy-task", to: "api-output", type: "requires_output" });

      return {
        taskId: "deploy-task",
        expected: {
          requiredNodes: ["deploy-task", "api-output", "db-output"],
          missingDeps: [],
        },
      };
    },
  },

  {
    name: "contradictory-evidence",
    description: "Two pieces of evidence disagree",
    setup: (graph) => {
      graph.addNode({ id: "test-task", type: "task", content: "Verify feature works", verified: false });
      graph.addNode({ id: "feature-output", type: "output", content: "Feature implementation", verified: true });
      graph.addNode({ id: "evidence-pass", type: "evidence", content: "Unit test passed locally", verified: false });
      graph.addNode({ id: "evidence-fail", type: "evidence", content: "Integration test failed on CI", verified: true });

      graph.addEdge({ from: "test-task", to: "feature-output", type: "requires_output" });
      graph.addEdge({ from: "test-task", to: "evidence-pass", type: "requires_evidence" });
      graph.addEdge({ from: "test-task", to: "evidence-fail", type: "requires_evidence" });
      graph.addEdge({ from: "evidence-pass", to: "evidence-fail", type: "contradicts" });

      return {
        taskId: "test-task",
        expected: {
          requiredNodes: ["test-task", "feature-output", "evidence-pass", "evidence-fail"],
          missingDeps: [],
        },
      };
    },
  },

  {
    name: "stale-evidence",
    description: "A previous decision is invalidated by newer evidence",
    setup: (graph) => {
      graph.addNode({ id: "old-decision", type: "decision", content: "Use MongoDB for data storage", verified: false });
      graph.addNode({ id: "new-evidence", type: "evidence", content: "MongoDB performance degrades at scale, PostgreSQL recommended", verified: true });
      graph.addNode({ id: "current-task", type: "task", content: "Design data layer", verified: false });

      graph.addEdge({ from: "new-evidence", to: "old-decision", type: "invalidates" });
      graph.addEdge({ from: "current-task", to: "old-decision", type: "requires_decision" });

      return {
        taskId: "current-task",
        expected: {
          requiredNodes: ["current-task", "old-decision", "new-evidence"],
          missingDeps: [],
        },
      };
    },
  },

  {
    name: "missing-dependency",
    description: "A task requires an output that does not exist",
    setup: (graph) => {
      graph.addNode({ id: "task-1", type: "task", content: "Build feature that depends on missing service", verified: false });
      // Note: output-1 is NOT added to the graph
      // Add edge manually to bypass validation (we're testing missing deps)
      const edges = graph.edgesFrom.get("task-1") || [];
      edges.push({ from: "task-1", to: "output-1", type: "requires_output", weight: 1.0 });
      graph.edgesFrom.set("task-1", edges);

      const toEdges = graph.edgesTo.get("output-1") || [];
      toEdges.push({ from: "task-1", to: "output-1", type: "requires_output", weight: 1.0 });
      graph.edgesTo.set("output-1", toEdges);

      return {
        taskId: "task-1",
        expected: {
          requiredNodes: ["task-1"],
          missingDeps: ["output-1"],
        },
      };
    },
  },

  {
    name: "playwright-chromium",
    description: "Browser automation with missing Chromium runtime",
    setup: (graph) => {
      graph.addNode({ id: "scrape-task", type: "task", content: "Scrape Lider website with Playwright", verified: false });
      graph.addNode({ id: "browser-output", type: "output", content: "Scraped product data from Lider", verified: false });
      graph.addNode({ id: "chromium-dep", type: "artifact", content: "Chromium browser binary installed", verified: false });
      graph.addNode({ id: "playwright-dep", type: "artifact", content: "Playwright npm package installed", verified: true });

      graph.addEdge({ from: "scrape-task", to: "browser-output", type: "produces" });
      graph.addEdge({ from: "scrape-task", to: "chromium-dep", type: "depends_on_artifact" });
      graph.addEdge({ from: "scrape-task", to: "playwright-dep", type: "depends_on_artifact" });

      return {
        taskId: "scrape-task",
        expected: {
          requiredNodes: ["scrape-task", "browser-output", "chromium-dep", "playwright-dep"],
          missingDeps: [],
        },
      };
    },
  },
];

// -- Benchmark runner --

/**
 * Run a single scenario against all strategies.
 * @param {BenchmarkScenario} scenario
 * @returns {{ scenario: string, results: ContextEvaluation[] }}
 */
export function runScenario(scenario) {
  const graph = new ContextGraph();
  const { taskId, expected } = scenario.setup(graph);

  const strategies = [
    { name: "full-context", fn: fullContext },
    { name: "semantic-topk", fn: (g, id) => semanticTopK(g, id, 10) },
    { name: "wam-routing", fn: resolveContext },
  ];

  const results = strategies.map(({ name, fn }) => {
    const result = fn(graph, taskId);
    const metrics = computeMetrics(result, expected, graph);
    return { strategy: name, ...metrics };
  });

  return { scenario: scenario.name, results };
}

/**
 * Run all scenarios.
 * @returns {{ scenarios: { scenario: string, results: ContextEvaluation[] }[], summary: Record<string, number> }}
 */
export function runAllScenarios() {
  const scenarios = SCENARIOS.map(runScenario);

  // Aggregate summary
  const summary = {};
  for (const { results } of scenarios) {
    for (const result of results) {
      const key = `${result.strategy}`;
      if (!summary[key]) {
        summary[key] = { totalTokens: 0, successes: 0, total: 0 };
      }
      summary[key].totalTokens += result.contextTokens;
      summary[key].total++;
      if (result.taskSuccess) summary[key].successes++;
    }
  }

  return { scenarios, summary };
}
