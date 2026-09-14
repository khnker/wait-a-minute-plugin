/**
 * WAM Context Graph — Internal structured representation of task relationships.
 *
 * Represents tasks, outputs, evidence, decisions, constraints, and their typed
 * relationships. Storage-independent, in-memory implementation for now.
 *
 * Invariant: A task depends on an output from another task, not on the entire
 * context of that task.
 */

// -- Types --

/**
 * @typedef {string} ContextNodeType
 * @typedef {string} ContextEdgeType
 */

/** @type {ContextNodeType[]} */
export const NODE_TYPES = [
  "task", "subtask", "requirement", "claim", "action",
  "observation", "evidence", "decision", "constraint", "artifact", "output"
];

/** @type {ContextEdgeType[]} */
export const EDGE_TYPES = [
  "requires_completion", "requires_output", "requires_evidence",
  "requires_decision", "depends_on_artifact", "produces",
  "supports", "contradicts", "invalidates", "related_to"
];

/**
 * @typedef {Object} ContextNode
 * @property {string} id
 * @property {ContextNodeType} type
 * @property {string} content
 * @property {string} [taskId]
 * @property {boolean} verified
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @typedef {Object} ContextEdge
 * @property {string} from
 * @property {string} to
 * @property {ContextEdgeType} type
 * @property {number} [weight]
 */

// -- Validation --

function validateNode(node) {
  if (!node || typeof node !== "object") throw new Error("Node must be an object");
  if (!node.id || typeof node.id !== "string") throw new Error("Node id required");
  if (!NODE_TYPES.includes(node.type)) throw new Error(`Invalid node type: ${node.type}`);
  if (typeof node.content !== "string") throw new Error("Node content required");
  return true;
}

function validateEdge(edge) {
  if (!edge || typeof edge !== "object") throw new Error("Edge must be an object");
  if (!edge.from || typeof edge.from !== "string") throw new Error("Edge from required");
  if (!edge.to || typeof edge.to !== "string") throw new Error("Edge to required");
  if (!EDGE_TYPES.includes(edge.type)) throw new Error(`Invalid edge type: ${edge.type}`);
  return true;
}

// -- ContextGraph --

export class ContextGraph {
  constructor() {
    /** @type {Map<string, ContextNode>} */
    this.nodes = new Map();
    /** @type {Map<string, ContextEdge[]>} */
    this.edgesFrom = new Map();
    /** @type {Map<string, ContextEdge[]>} */
    this.edgesTo = new Map();
  }

  // -- Node operations --

  /**
   * Add a node to the graph.
   * @param {ContextNode} node
   * @returns {ContextNode}
   */
  addNode(node) {
    validateNode(node);
    const now = Date.now();
    const existing = this.nodes.get(node.id);
    const entry = {
      ...node,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.nodes.set(node.id, entry);
    return entry;
  }

  /**
   * Get a node by id.
   * @param {string} id
   * @returns {ContextNode | undefined}
   */
  getNode(id) {
    return this.nodes.get(id);
  }

  /**
   * Check if a node exists.
   * @param {string} id
   * @returns {boolean}
   */
  hasNode(id) {
    return this.nodes.has(id);
  }

  /**
   * Get all nodes, optionally filtered by type.
   * @param {ContextNodeType} [type]
   * @returns {ContextNode[]}
   */
  getNodes(type) {
    const all = [...this.nodes.values()];
    return type ? all.filter((n) => n.type === type) : all;
  }

  /**
   * Update a node's properties.
   * @param {string} id
   * @param {Partial<ContextNode>} patch
   * @returns {ContextNode | null}
   */
  updateNode(id, patch) {
    const node = this.nodes.get(id);
    if (!node) return null;
    const updated = { ...node, ...patch, id: node.id, updatedAt: Date.now() };
    this.nodes.set(id, updated);
    return updated;
  }

  /**
   * Remove a node and all its edges.
   * @param {string} id
   * @returns {boolean}
   */
  removeNode(id) {
    const existed = this.nodes.delete(id);
    if (!existed) return false;

    // Remove all edges involving this node
    const outgoing = this.edgesFrom.get(id) || [];
    for (const edge of outgoing) {
      this._removeFromEdgesTo(edge);
    }
    this.edgesFrom.delete(id);

    const incoming = this.edgesTo.get(id) || [];
    for (const edge of incoming) {
      this._removeFromEdgesFrom(edge);
    }
    this.edgesTo.delete(id);

    return true;
  }

  // -- Edge operations --

  /**
   * Add an edge to the graph.
   * @param {ContextEdge} edge
   * @returns {ContextEdge}
   */
  addEdge(edge) {
    validateEdge(edge);
    if (!this.nodes.has(edge.from)) throw new Error(`Source node ${edge.from} not found`);
    if (!this.nodes.has(edge.to)) throw new Error(`Target node ${edge.to} not found`);

    const entry = { ...edge, weight: edge.weight ?? 1.0 };

    // Check for duplicate
    const fromEdges = this.edgesFrom.get(edge.from) || [];
    const exists = fromEdges.some(
      (e) => e.to === edge.to && e.type === edge.type
    );
    if (exists) return entry;

    fromEdges.push(entry);
    this.edgesFrom.set(edge.from, fromEdges);

    const toEdges = this.edgesTo.get(edge.to) || [];
    toEdges.push(entry);
    this.edgesTo.set(edge.to, toEdges);

    return entry;
  }

  /**
   * Get all edges from a node.
   * @param {string} nodeId
   * @returns {ContextEdge[]}
   */
  getEdgesFrom(nodeId) {
    return this.edgesFrom.get(nodeId) || [];
  }

  /**
   * Get all edges to a node.
   * @param {string} nodeId
   * @returns {ContextEdge[]}
   */
  getEdgesTo(nodeId) {
    return this.edgesTo.get(nodeId) || [];
  }

  /**
   * Get edges of a specific type from a node.
   * @param {string} nodeId
   * @param {ContextEdgeType} type
   * @returns {ContextEdge[]}
   */
  getEdgesFromByType(nodeId, type) {
    return this.getEdgesFrom(nodeId).filter((e) => e.type === type);
  }

  /**
   * Get edges of a specific type to a node.
   * @param {string} nodeId
   * @param {ContextEdgeType} type
   * @returns {ContextEdge[]}
   */
  getEdgesToByType(nodeId, type) {
    return this.getEdgesTo(nodeId).filter((e) => e.type === type);
  }

  // -- Traversal --

  /**
   * Get direct dependencies of a node (nodes it requires).
   * @param {string} nodeId
   * @returns {ContextNode[]}
   */
  getDependencies(nodeId) {
    const depEdges = this.getEdgesFromByType(nodeId, "requires_output")
      .concat(this.getEdgesFromByType(nodeId, "requires_completion"))
      .concat(this.getEdgesFromByType(nodeId, "requires_evidence"))
      .concat(this.getEdgesFromByType(nodeId, "requires_decision"))
      .concat(this.getEdgesFromByType(nodeId, "depends_on_artifact"));

    return depEdges
      .map((e) => this.nodes.get(e.to))
      .filter(Boolean);
  }

  /**
   * Get upstream context (what this node depends on, transitively).
   * @param {string} nodeId
   * @param {number} [maxDepth=10]
   * @returns {ContextNode[]}
   */
  getUpstream(nodeId, maxDepth = 10) {
    const visited = new Set();
    const result = [];

    const traverse = (id, depth) => {
      if (depth >= maxDepth || visited.has(id)) return;
      visited.add(id);

      const deps = this.getDependencies(id);
      for (const dep of deps) {
        if (!visited.has(dep.id)) {
          result.push(dep);
          traverse(dep.id, depth + 1);
        }
      }

      // Also traverse through "produces" edges to find tasks that produce this node
      const producers = this.getEdgesToByType(id, "produces");
      for (const edge of producers) {
        if (!visited.has(edge.from)) {
          const producerNode = this.nodes.get(edge.from);
          if (producerNode) {
            result.push(producerNode);
            traverse(edge.from, depth + 1);
          }
        }
      }
    };

    traverse(nodeId, 0);
    return result;
  }

  /**
   * Get downstream context (what depends on this node, transitively).
   * @param {string} nodeId
   * @param {number} [maxDepth=10]
   * @returns {ContextNode[]}
   */
  getDownstream(nodeId, maxDepth = 10) {
    const visited = new Set();
    const result = [];

    const traverse = (id, depth) => {
      if (depth > maxDepth || visited.has(id)) return;
      visited.add(id);

      const dependents = this.getEdgesTo(id)
        .filter((e) => ["requires_output", "requires_completion", "depends_on_artifact"].includes(e.type));

      for (const edge of dependents) {
        if (!visited.has(edge.from)) {
          const node = this.nodes.get(edge.from);
          if (node) {
            result.push(node);
            traverse(edge.from, depth + 1);
          }
        }
      }
    };

    traverse(nodeId, 0);
    return result;
  }

  /**
   * Get nodes that are invalidated by a given node.
   * @param {string} nodeId
   * @returns {ContextNode[]}
   */
  getInvalidatedBy(nodeId) {
    return this.getEdgesFromByType(nodeId, "invalidates")
      .map((e) => this.nodes.get(e.to))
      .filter(Boolean);
  }

  /**
   * Get nodes that contradict a given node.
   * @param {string} nodeId
   * @returns {ContextNode[]}
   */
  getContradicting(nodeId) {
    const fromContradictions = this.getEdgesFromByType(nodeId, "contradicts")
      .map((e) => this.nodes.get(e.to));
    const toContradictions = this.getEdgesToByType(nodeId, "contradicts")
      .map((e) => this.nodes.get(e.from));

    return [...fromContradictions, ...toContradictions].filter(Boolean);
  }

  // -- Validation --

  /**
   * Validate graph consistency.
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];

    // Check all edges reference existing nodes
    for (const [fromId, edges] of this.edgesFrom) {
      if (!this.nodes.has(fromId)) {
        errors.push(`Edge source ${fromId} not in nodes`);
      }
      for (const edge of edges) {
        if (!this.nodes.has(edge.to)) {
          errors.push(`Edge target ${edge.to} not in nodes`);
        }
      }
    }

    // Check for cycles in dependency edges
    const visited = new Set();
    const inStack = new Set();

    const hasCycle = (nodeId) => {
      if (inStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      inStack.add(nodeId);

      const deps = this.getEdgesFromByType(nodeId, "requires_output")
        .concat(this.getEdgesFromByType(nodeId, "depends_on_artifact"));

      for (const edge of deps) {
        if (hasCycle(edge.to)) return true;
      }

      inStack.delete(nodeId);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (hasCycle(nodeId)) {
        errors.push(`Cycle detected involving node ${nodeId}`);
        break;
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get graph statistics.
   * @returns {{ nodeCount: number, edgeCount: number, nodesByType: Record<string, number>, edgesByType: Record<string, number> }}
   */
  stats() {
    const nodesByType = {};
    for (const node of this.nodes.values()) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }

    const edgesByType = {};
    let edgeCount = 0;
    for (const edges of this.edgesFrom.values()) {
      edgeCount += edges.length;
      for (const edge of edges) {
        edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
      }
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount,
      nodesByType,
      edgesByType,
    };
  }

  // -- Internal helpers --

  _removeFromEdgesTo(edge) {
    const toEdges = this.edgesTo.get(edge.to);
    if (!toEdges) return;
    const idx = toEdges.findIndex(
      (e) => e.from === edge.from && e.type === edge.type
    );
    if (idx !== -1) toEdges.splice(idx, 1);
  }

  _removeFromEdgesFrom(edge) {
    const fromEdges = this.edgesFrom.get(edge.from);
    if (!fromEdges) return;
    const idx = fromEdges.findIndex(
      (e) => e.to === edge.to && e.type === edge.type
    );
    if (idx !== -1) fromEdges.splice(idx, 1);
  }
}
