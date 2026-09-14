/**
 * WAM Task Dependencies
 *
 * Typed dependencies between tasks. Each dependency connects an output
 * from one task's execution to a requirement of another task.
 *
 * The dependency model extends the existing WAM task model using ContextGraph
 * as the underlying structure.
 */

import { ContextGraph } from "./context-graph.js";
import { getTaskState, persistTaskState } from "./engine.js";

// -- Types --

/**
 * @typedef {"requires_completion"|"requires_output"|"requires_evidence"|"requires_decision"|"depends_on_artifact"|"blocked_by"|"invalidated_by"} DependencyType
 * @typedef {"decision"|"artifact"|"evidence"|"constraint"|"observation"|"verification"} OutputType
 */

/**
 * @typedef {Object} TaskDependency
 * @property {string} from - Task or node that has the dependency
 * @property {string} to - Task or node that is depended upon
 * @property {DependencyType} type
 * @property {boolean} required
 * @property {number} createdAt
 */

/**
 * @typedef {Object} TaskOutput
 * @property {string} id
 * @property {string} taskId
 * @property {string} executionId
 * @property {OutputType} type
 * @property {string} content
 * @property {boolean} verified
 * @property {number} createdAt
 */

// -- Persistent Graph Store --

const GRAPH_FILE = "context-graph.json";

function loadGraph(root) {
  const graph = new ContextGraph();
  const stateDir = path.join(root || process.cwd(), ".wam");
  const graphFile = path.join(stateDir, GRAPH_FILE);

  try {
    const raw = fs.readFileSync(graphFile, "utf-8");
    const data = JSON.parse(raw);
    for (const node of data.nodes || []) graph.addNode(node);
    for (const edge of data.edges || []) {
      try { graph.addEdge(edge); } catch { /* skip invalid */ }
    }
  } catch { /* fresh graph */ }

  return graph;
}

function saveGraph(graph, root) {
  const stateDir = path.join(root || process.cwd(), ".wam");
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });

  const nodes = graph.getNodes().map((n) => ({
    id: n.id, type: n.type, content: n.content,
    taskId: n.taskId, verified: n.verified,
    metadata: n.metadata, createdAt: n.createdAt, updatedAt: n.updatedAt,
  }));

  const edges = [];
  const seen = new Set();
  for (const node of graph.getNodes()) {
    for (const edge of graph.getEdgesFrom(node.id)) {
      const key = `${edge.from}|${edge.to}|${edge.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ from: edge.from, to: edge.to, type: edge.type, weight: edge.weight });
      }
    }
  }

  fs.writeFileSync(
    path.join(stateDir, GRAPH_FILE),
    JSON.stringify({ nodes, edges }, null, 2)
  );
}

// Need to import these
import fs from "node:fs";
import path from "node:path";

// -- Output Management --

/**
 * Register an output produced by a task execution.
 */
export function registerOutput(taskId, executionId, outputType, content, verified, root) {
  const graph = loadGraph(root);
  const outputId = `output-${taskId}-${executionId}-${Date.now()}`;

  const node = {
    id: outputId,
    type: "output",
    content,
    taskId,
    verified: verified || false,
    metadata: { executionId, outputType },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  graph.addNode(node);

  // Link output to its producing task (use raw taskId as node id)
  if (!graph.getNode(taskId)) {
    graph.addNode({
      id: taskId,
      type: "task",
      content: content.slice(0, 200),
      taskId,
      verified: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  graph.addEdge({ from: taskId, to: outputId, type: "produces" });
  saveGraph(graph, root);

  return outputId;
}

// -- Dependency Management --

/**
 * Add a dependency between two tasks/nodes.
 */
export function addDependency(fromId, toId, type, required, root) {
  const graph = loadGraph(root);

  // Ensure nodes exist
  if (!graph.getNode(fromId)) {
    graph.addNode({
      id: fromId, type: "task", content: fromId,
      verified: false, createdAt: Date.now(), updatedAt: Date.now(),
    });
  }
  if (!graph.getNode(toId)) {
    graph.addNode({
      id: toId, type: "task", content: toId,
      verified: false, createdAt: Date.now(), updatedAt: Date.now(),
    });
  }

  const edge = graph.addEdge({ from: fromId, to: toId, type, weight: 1.0 });
  saveGraph(graph, root);

  return { from: fromId, to: toId, type, required: required !== false, createdAt: Date.now() };
}

/**
 * Get all dependencies of a node.
 */
export function getDependencies(nodeId, root) {
  const graph = loadGraph(root);
  return graph.getDependencies(nodeId);
}

/**
 * Get all nodes that depend on this node.
 */
export function getDependents(nodeId, root) {
  const graph = loadGraph(root);
  return graph.getDownstream(nodeId);
}

/**
 * Traverse upstream through the dependency graph.
 */
export function getUpstream(nodeId, root, maxDepth) {
  const graph = loadGraph(root);
  return graph.getUpstream(nodeId, maxDepth);
}

// -- Missing Dependency Detection --

/**
 * Detect missing dependencies for a node.
 * Returns gaps where required outputs are not yet produced.
 */
export function detectMissingDependencies(nodeId, root) {
  const graph = loadGraph(root);
  const deps = graph.getDependencies(nodeId);

  const missing = [];
  for (const dep of deps) {
    const edges = graph.getEdgesFrom(nodeId);
    const depEdge = edges.find((e) => e.to === dep.id);
    if (depEdge && ["requires_output", "requires_completion", "requires_evidence",
                     "requires_decision", "depends_on_artifact"].includes(depEdge.type)) {
      if (!dep.verified && dep.type === "output") {
        const outputNode = graph.getNode(dep.id);
        if (!outputNode) {
          missing.push({ requiredBy: nodeId, type: "dependency", description: `Output ${dep.id} not found` });
        }
      }
    }
  }

  return missing;
}

// -- Invalidation --

/**
 * Invalidate an output node and all downstream nodes.
 */
export function invalidateOutput(outputId, reason, root) {
  const graph = loadGraph(root);

  const node = graph.getNode(outputId);
  if (!node) throw new Error(`Output ${outputId} not found`);

  graph.updateNode(outputId, {
    verified: false,
    metadata: { ...node.metadata, invalidated: true, invalidationReason: reason },
  });

  const downstream = graph.getDownstream(outputId);

  for (const d of downstream) {
    try {
      graph.addEdge({ from: outputId, to: d.id, type: "invalidates" });
    } catch { /* already exists */ }
  }

  saveGraph(graph, root);
  return { invalidated: outputId, affected: downstream.map((d) => d.id) };
}

/**
 * Check if a node has any invalidated dependencies.
 */
export function getInvalidatedDependencies(nodeId, root) {
  const graph = loadGraph(root);
  const deps = graph.getDependencies(nodeId);

  return deps.filter((dep) => {
    const meta = dep.metadata;
    return meta && meta.invalidated;
  });
}

// -- Context Gap --

/**
 * Detect context gaps: nodes that cannot proceed due to missing dependencies.
 */
export function detectContextGaps(nodeId, root) {
  const graph = loadGraph(root);
  const missing = detectMissingDependencies(nodeId, root);
  const invalidated = getInvalidatedDependencies(nodeId, root);

  const gaps = [];

  for (const m of missing) {
    gaps.push({
      type: "missing_dependency",
      severity: "blocking",
      description: m.description,
      requiredBy: m.requiredBy,
    });
  }

  for (const inv of invalidated) {
    gaps.push({
      type: "invalidated_dependency",
      severity: "warning",
      description: `Dependency ${inv.id} was invalidated`,
      requiredBy: nodeId,
    });
  }

  return gaps;
}
