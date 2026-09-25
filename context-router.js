/**
 * WAM Context Routing — Task-aware context selection.
 *
 * Given an active task and a Context Graph, determines the minimum
 * sufficient context required for that task. Deterministic, no LLM.
 *
 * Admission classes:
 *   MANDATORY — never dropped, even if exceeding budget
 *   CONDITIONAL — dropped after OPTIONAL
 *   OPTIONAL — dropped first when budget is tight
 */

import { EDGE_TYPES } from "./context-graph.js";

/**
 * Admission classes for context budget policy.
 */
export const ADMISSION = {
  MANDATORY: "MANDATORY",
  CONDITIONAL: "CONDITIONAL",
  OPTIONAL: "OPTIONAL",
};

// -- Types --

/**
 * @typedef {"MANDATORY" | "CONDITIONAL" | "OPTIONAL"} AdmissionClass
 */

/**
 * @typedef {Object} ResolveContextOptions
 * @property {string} taskId - The task to resolve context for
 * @property {number} [maxTokens=4000] - Maximum token budget
 */

/**
 * @typedef {Object} ContextGap
 * @property {string} requiredBy - Node ID that requires this context
 * @property {string} type - Type of missing context
 * @property {string} description - What is missing
 */

/**
 * @typedef {Object} OmittedNode
 * @property {string} id - Node ID
 * @property {string} reason - Why it was omitted
 * @property {AdmissionClass} admission - Admission class
 */

/**
 * @typedef {Object} ResolvedContext
 * @property {import('./context-graph.js').ContextNode[]} nodes
 * @property {import('./context-graph.js').ContextEdge[]} edges
 * @property {ContextGap[]} missing
 * @property {OmittedNode[]} omitted
 * @property {boolean} complete
 * @property {boolean} sufficient
 * @property {number} tokenEstimate
 */

// -- Token estimation --

function estimateTokens(text = "") {
  return Math.ceil((text || "").length / 4);
}

function nodeTokens(node) {
  return estimateTokens(node.content) + 20; // overhead for metadata
}

/**
 * Determine admission class for a node based on causal necessity.
 *
 * MANDATORY: Required to continue execution or satisfy completion.
 * CONDITIONAL: Evidence/Decisions required for verification.
 * OPTIONAL: Extra context.
 */
function getAdmissionClass(node, taskNode, graph) {
  // 1. Mandatory: Task/Completion requirements or output type with MANDATORY admission
  if (node.id === taskNode?.id || node.type === "task" || node.type === "requirement" || (node.type === "output" && node.metadata?.admission === "MANDATORY")) {
    return ADMISSION.MANDATORY;
  }

  // 2. Mandatory: Execution dependencies
  // If it's required for the task to proceed, it's MANDATORY
  const edgesToTask = graph.getEdgesTo(taskNode?.id);
  const isDirectDep = edgesToTask.some(e => e.from === node.id || e.to === node.id);
  if (isDirectDep) return ADMISSION.MANDATORY;

  // 3. Conditional: Evidence/Decisions for verification
  if (node.type === "evidence" || node.type === "decision" || node.type === "constraint") {
    return ADMISSION.CONDITIONAL;
  }

  // 4. Everything else is OPTIONAL
  return ADMISSION.OPTIONAL;
}

// -- Relevance scoring --

function computeRelevance(node, taskNode, graph) {
  let score = 0;

  // Base: type relevance
  const typeWeights = {
    output: 1.0,
    evidence: 0.9,
    requirement: 0.85,
    decision: 0.8,
    constraint: 0.75,
    artifact: 0.7,
    task: 0.6,
    claim: 0.5,
    observation: 0.4,
    subtask: 0.3,
  };
  score += typeWeights[node.type] || 0.1;

  // Verification bonus
  if (node.verified) score *= 1.2;

  // Content similarity (simple word overlap)
  const taskWords = new Set(
    (taskNode?.content || "").toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );
  const nodeWords = new Set(
    (node.content || "").toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );
  let overlap = 0;
  for (const w of nodeWords) if (taskWords.has(w)) overlap++;
  if (nodeWords.size > 0) score += (overlap / nodeWords.size) * 0.5;

  return Math.min(score, 2.0);
}

/**
 * Get executable requirements based on causal dependencies.
 */
export function getExecutableRequirements(graph) {
  const reqs = graph.getNodes("requirement");
  const executable = [];

  for (const req of reqs) {
    if (req.verified || req.status === "done") continue;

    // Traverse upstream to find causal blockers
    const deps = graph.getUpstream(req.id, 5);
    const blockers = deps.filter(d => 
      !d.verified && 
      (d.type === "requirement" || d.type === "decision" || d.type === "constraint")
    );

    if (blockers.length === 0) {
      executable.push({
        requirementId: req.id,
        action: req.content,
        blockers: [],
        dependencies: deps.map(d => d.id),
        rationale: "All causal dependencies satisfied"
      });
    } else {
      executable.push({
        requirementId: req.id,
        action: req.content,
        blockers: blockers.map(b => b.id),
        dependencies: deps.map(d => d.id),
        rationale: "Blocked by unresolved causal dependencies"
      });
    }
  }
  // Sort: executable first
  return executable.sort((a, b) => (a.blockers.length === 0 ? -1 : 1));
}

/**
 * Resolve minimum sufficient context for a task.
 *
 * @param {import('./context-graph.js').ContextGraph} graph
 * @param {ResolveContextOptions} options
 * @returns {ResolvedContext}
 */
export function resolveContext(graph, options) {
  const { taskId, maxTokens = 4000 } = options;

  const taskNode = graph.getNode(taskId);
  if (!taskNode) {
    return {
      nodes: [],
      edges: [],
      missing: [{ requiredBy: taskId, type: "task", description: `Task ${taskId} not found` }],
      complete: false,
      tokenEstimate: 0,
    };
  }

  // Phase 1: Collect directly required nodes
  const required = new Set();
  const missing = [];

  // Also include any node with admission: "MANDATORY" explicitly
  for (const node of graph.nodes.values()) {
    if (node.metadata?.admission === "MANDATORY") {
      required.add(node.id);
    }
  }

  // Get direct dependencies
  const deps = graph.getDependencies(taskId);
  for (const dep of deps) {
    required.add(dep.id);
  }

  // Phase 2: Expand dependency chain (transitively through outputs)
  const upstream = graph.getUpstream(taskId, 5);
  for (const node of upstream) {
    required.add(node.id);
  }

  // Also traverse through "produces" edges to find hidden dependencies
  for (const id of [...required]) {
    const producing = graph.getEdgesFromByType(id, "produces");
    for (const edge of producing) {
      required.add(edge.to);
    }
  }

  // Phase 3: Collect supporting evidence for required outputs
  const requiredOutputs = [...required]
    .map((id) => graph.getNode(id))
    .filter((n) => n && n.type === "output");

  for (const output of requiredOutputs) {
    // Find evidence that supports this output
    const supportingEdges = graph.getEdgesToByType(output.id, "supports");
    for (const edge of supportingEdges) {
      const evidence = graph.getNode(edge.from);
      if (evidence) required.add(evidence.id);
    }

    // Find requirements that this output fulfills
    const requiredByEdges = graph.getEdgesToByType(output.id, "requires_output");
    for (const edge of requiredByEdges) {
      const req = graph.getNode(edge.from);
      if (req) required.add(req.id);
    }
  }

  // Phase 4: Check for missing dependencies
  for (const id of [...required]) {
    const node = graph.getNode(id);
    if (!node) {
      // Find who requires this
      const reqEdges = graph.getEdgesTo(id);
      const requiredBy = reqEdges.length > 0 ? reqEdges[0].from : taskId;
      missing.push({
        requiredBy,
        type: "dependency",
        description: `Required node ${id} not found in graph`,
      });
      required.delete(id);
    }
  }

  // Also check edges from required nodes for missing targets
  for (const id of [...required]) {
    const edges = graph.getEdgesFrom(id);
    for (const edge of edges) {
      if (["requires_output", "requires_completion", "requires_evidence",
           "requires_decision", "depends_on_artifact"].includes(edge.type)) {
        if (!graph.getNode(edge.to)) {
          missing.push({
            requiredBy: id,
            type: "dependency",
            description: `Required node ${edge.to} not found (via ${edge.type})`,
          });
        }
      }
    }
  }

  // Phase 5: Detect contradictions
  const contradictions = [];
  for (const id of [...required]) {
    const contradicting = graph.getContradicting(id);
    for (const c of contradicting) {
      if (required.has(c.id)) {
        contradictions.push({ node1: id, node2: c.id });
      }
    }
  }

  // Phase 6: Filter by token budget with admission classes
  const nodes = [...required]
    .map((id) => graph.getNode(id))
    .filter(Boolean);

  // Assign admission class based on node type and relationship to task
  const mandatory = [];
  const conditional = [];
  const optional = [];

  for (const node of nodes) {
    const admission = getAdmissionClass(node, taskNode, graph);
    if (admission === ADMISSION.MANDATORY) {
      mandatory.push(node);
    } else if (admission === ADMISSION.CONDITIONAL) {
      conditional.push(node);
    } else {
      optional.push(node);
    }
  }

  // Sort each group by relevance (deterministic)
  const sortByRelevance = (a, b) => {
    const ra = computeRelevance(a, taskNode, graph);
    const rb = computeRelevance(b, taskNode, graph);
    if (rb !== ra) return rb - ra;
    return a.id.localeCompare(b.id);
  };

  mandatory.sort(sortByRelevance);
  conditional.sort(sortByRelevance);
  optional.sort(sortByRelevance);

  // Select MANDATORY first, then CONDITIONAL, then OPTIONAL
  let totalTokens = 0;
  const selectedNodes = [];
  const omitted = [];

  // Phase 6a: Select all MANDATORY nodes (even if exceeding budget)
  for (const node of mandatory) {
    const tokens = nodeTokens(node);
    selectedNodes.push(node);
    totalTokens += tokens;
  }

  // Phase 6b: Select CONDITIONAL nodes within remaining budget
  for (const node of conditional) {
    const tokens = nodeTokens(node);
    if (totalTokens + tokens <= maxTokens) {
      selectedNodes.push(node);
      totalTokens += tokens;
    } else {
      omitted.push({
        id: node.id,
        reason: "budget",
        admission: ADMISSION.CONDITIONAL,
      });
    }
  }

  // Phase 6c: Select OPTIONAL nodes within remaining budget
  for (const node of optional) {
    const tokens = nodeTokens(node);
    if (totalTokens + tokens <= maxTokens) {
      selectedNodes.push(node);
      totalTokens += tokens;
    } else {
      omitted.push({
        id: node.id,
        reason: "budget",
        admission: ADMISSION.OPTIONAL,
      });
    }
  }

  // Phase 7: Collect edges between selected nodes
  const selectedIds = new Set(selectedNodes.map((n) => n.id));
  const edges = [];
  for (const node of selectedNodes) {
    for (const edge of graph.getEdgesFrom(node.id)) {
      if (selectedIds.has(edge.to)) {
        edges.push(edge);
      }
    }
  }

  // Phase 8: Add contradiction warnings to missing
  for (const contr of contradictions) {
    missing.push({
      requiredBy: contr.node1,
      type: "contradiction",
      description: `Node ${contr.node1} contradicts ${contr.node2}`,
    });
  }

  // Phase 9: Determine completeness and sufficiency
  const complete = missing.length === 0;

  // Check if any MANDATORY nodes were omitted
  const mandatoryOmitted = omitted.filter((o) => o.admission === ADMISSION.MANDATORY);

  // Check if mandatory exceeded budget
  const mandatoryTokens = mandatory.reduce((sum, n) => sum + nodeTokens(n), 0);
  const budgetOverflow = mandatoryTokens > maxTokens;

  // Sufficient = complete + no mandatory omitted + no budget overflow + no contradictions
  const sufficient = complete && mandatoryOmitted.length === 0 && !budgetOverflow && contradictions.length === 0;

  // Determine status
  let status;
  if (contradictions.length > 0) {
    status = "CONFLICTED";
  } else if (!complete || mandatoryOmitted.length > 0 || budgetOverflow) {
    status = "INSUFFICIENT";
  } else if (selectedNodes.length < required.size) {
    status = "PARTIAL";
  } else {
    status = "COMPLETE";
  }

  return {
    nodes: selectedNodes,
    edges,
    missing,
    omitted,
    complete,
    sufficient,
    status,
    tokenEstimate: totalTokens,
    budgetOverflow,
    mandatoryOmitted: mandatoryOmitted.length,
    summary: {
      required: required.size,
      selected: selectedNodes.length,
      omitted: omitted.length,
      missing: missing.length,
      contradictions: contradictions.length,
    },
  };
}
