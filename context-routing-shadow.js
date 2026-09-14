/**
 * WAM Context Routing — Shadow Mode
 *
 * Computes what context WAM would send for a task, without modifying
 * OpenCode context. Used for evaluation against the current context pack.
 */

import { ContextGraph } from "./context-graph.js";
import { getResumeContext, getPreviousFailures, getPreviousDecisions } from "./task-runs.js";
import { getDependencies, getUpstream, detectMissingDependencies, detectContextGaps } from "./task-dependencies.js";
import { resolveContext } from "./context-router.js";
import { getTaskState } from "./engine.js";

// -- Types --

/**
 * @typedef {Object} ContextSnapshot
 * @property {string[]} nodeIds
 * @property {number} tokenEstimate
 * @property {string[]} sources - Where each piece of context came from
 */

/**
 * @typedef {Object} ContextGap
 * @property {string} type
 * @property {string} severity
 * @property {string} description
 */

/**
 * @typedef {Object} ShadowContextResult
 * @property {string} taskId
 * @property {ContextSnapshot} currentContext
 * @property {ContextSnapshot} proposedContext
 * @property {ContextGap[]} missing
 * @property {{ current: number, proposed: number }} tokenEstimate
 * @property {string[]} routingDecisions - Why each piece was selected
 */

// -- Token estimation --

function estimateTokens(text = "") {
  return Math.ceil((text || "").length / 4);
}

function nodeTokens(node) {
  return estimateTokens(node.content) + 20;
}

// -- Current Context Pack (simulates what WAM currently sends) --

/**
 * Simulate the current WAM context pack for a task.
 * This represents the N0-N3 model.
 */
export function getCurrentContextPack(taskId, root) {
  const sources = [];
  const nodeIds = [];
  let tokens = 0;

  // N0: Global policy (minimal)
  sources.push("N0:global-policy");
  tokens += 50;

  // N2: Task state (required)
  const state = getTaskState(taskId, root);
  if (state) {
    nodeIds.push(`task-${taskId}`);
    const taskTokens = estimateTokens(JSON.stringify(state));
    tokens += taskTokens;
    sources.push(`N2:task-state (${taskTokens} tokens)`);
  }

  // N3: Session context (top-level only)
  sources.push("N3:session-context");
  tokens += 200;

  return { nodeIds, tokenEstimate: tokens, sources };
}

// -- Proposed Context (shadow routing) --

/**
 * Compute proposed context using dependency-aware routing.
 * Combines: task state + dependencies + evidence + relevant history.
 */
export function getProposedContext(taskId, graph, root) {
  const sources = [];
  const nodeIds = [];
  let tokens = 0;

  // 1. Current task state (always included)
  nodeIds.push(taskId);
  sources.push("task-state");
  tokens += 200;

  // 2. Required dependencies (from graph)
  if (graph) {
    const deps = graph.getDependencies(taskId);
    for (const dep of deps) {
      nodeIds.push(dep.id);
      tokens += nodeTokens(dep);
      sources.push(`dependency:${dep.type}`);
    }

    // 3. Upstream context (transitive deps)
    const upstream = graph.getUpstream(taskId, 3);
    for (const u of upstream) {
      if (!nodeIds.includes(u.id)) {
        nodeIds.push(u.id);
        tokens += nodeTokens(u);
        sources.push(`upstream:${u.type}`);
      }
    }
  }

  // 4. Required evidence
  if (graph) {
    const evidenceNodes = graph.getNodes("evidence");
    for (const e of evidenceNodes) {
      if (!nodeIds.includes(e.id)) {
        // Check if this evidence supports any of our dependencies
        const supports = graph.getEdgesFrom(e.id);
        const relevant = supports.some((s) => nodeIds.includes(s.to));
        if (relevant) {
          nodeIds.push(e.id);
          tokens += nodeTokens(e);
          sources.push("evidence:supports-dependency");
        }
      }
    }
  }

  // 5. Relevant execution history (last 2 failures + 3 decisions)
  const failures = getPreviousFailures(taskId, root);
  for (const f of failures.slice(-2)) {
    nodeIds.push(`exec-failure-${f.id}`);
    tokens += estimateTokens(f.outcome || "") + 20;
    sources.push(`history:failure`);
  }

  const decisions = getPreviousDecisions(taskId, root, 3);
  for (const d of decisions) {
    nodeIds.push(`exec-decision-${d.executionId}`);
    tokens += estimateTokens(d.decision) + 20;
    sources.push(`history:decision`);
  }

  // 6. Context gaps
  let gaps = [];
  if (graph) {
    // Detect missing deps by checking edges from this task
    const edges = graph.getEdgesFrom(taskId);
    for (const edge of edges) {
      if (["requires_output", "requires_completion", "requires_evidence",
           "requires_decision", "depends_on_artifact"].includes(edge.type)) {
        const targetNode = graph.getNode(edge.to);
        if (!targetNode) {
          gaps.push({ type: "missing_dependency", severity: "blocking", description: `Output ${edge.to} not found` });
        } else if (!targetNode.verified) {
          gaps.push({ type: "unverified_dependency", severity: "warning", description: `Output ${edge.to} not verified` });
        }
      }
    }
  }

  return {
    nodeIds,
    tokenEstimate: tokens,
    sources,
    gaps,
  };
}

// -- Shadow Router --

/**
 * Run shadow routing: compute both current and proposed context.
 * Never modifies OpenCode input.
 */
export function shadowRoute(taskId, graph, root) {
  const current = getCurrentContextPack(taskId, root);
  const proposed = getProposedContext(taskId, graph, root);
  const missing = proposed.gaps || [];

  const routingDecisions = proposed.sources.map((s) => `Include: ${s}`);

  if (missing.length > 0) {
    routingDecisions.push(`Block: ${missing.length} context gaps detected`);
  }

  return {
    taskId,
    currentContext: {
      nodeIds: current.nodeIds,
      tokenEstimate: current.tokenEstimate,
      sources: current.sources,
    },
    proposedContext: {
      nodeIds: proposed.nodeIds,
      tokenEstimate: proposed.tokenEstimate,
      sources: proposed.sources,
    },
    missing,
    tokenEstimate: {
      current: current.tokenEstimate,
      proposed: proposed.tokenEstimate,
    },
    routingDecisions,
  };
}

// -- Evaluation Helpers --

/**
 * Check if proposed context includes all required items from current context.
 */
export function hasRequiredContext(proposed, required) {
  return required.every((r) => proposed.nodeIds.includes(r));
}

/**
 * Compute context overlap between current and proposed.
 */
export function computeOverlap(current, proposed) {
  const currentSet = new Set(current.nodeIds);
  const proposedSet = new Set(proposed.nodeIds);
  const intersection = [...currentSet].filter((id) => proposedSet.has(id));
  const union = new Set([...currentSet, ...proposedSet]);

  return {
    shared: intersection.length,
    onlyInCurrent: currentSet.size - intersection.length,
    onlyInProposed: proposedSet.size - intersection.length,
    jaccard: union.size > 0 ? intersection.length / union.size : 0,
  };
}
