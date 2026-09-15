/**
 * Context Memory Layers — hierarchical memory tiers for context items.
 *
 * Working Memory (active, in-session):
 *   N0 — Identity / goal
 *   N1 — Domain / project
 *   N2 — Current state / evidence
 *   N3 — Retrieval / exploration
 *
 * Archive (durable, off-session):
 *   ARCHIVE — historical, compressed, retained for provenance
 *
 * Each tier defines:
 *   - a priority (lower number = higher priority for assembly)
 *   - capacity hints (soft limits; actual eviction done by manager)
 *   - inclusion rules (which ContextCategory types belong here)
 *   - lifecycle expectations (which states are typical for this tier)
 *
 * Compatibility: tier assignment is read from item.memoryLayer, falling
 * back to inference by category/importance so legacy items without the
 * field still sort correctly.
 */

import { LIFECYCLE_STATES } from "./context-lifecycle.js";

/**
 * @typedef {"N0"|"N1"|"N2"|"N3"|"ARCHIVE"} MemoryLayer
 */

/** @type {Record<MemoryLayer, MemoryLayer>} */
export const MEMORY_LAYERS = Object.freeze({
  N0: "N0",
  N1: "N1",
  N2: "N2",
  N3: "N3",
  ARCHIVE: "ARCHIVE",
});

/** @type {MemoryLayer[]} */
export const WORKING_LAYERS = Object.freeze(["N0", "N1", "N2", "N3"]);

/**
 * Tier metadata — priority (lower = higher priority), capacity (max
 * items suggested), and allowed categories.
 * @type {Record<MemoryLayer, {priority: number, capacity: number, categories: string[], purpose: string}>}
 */
function freezeLayer(obj) {
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === "object" && obj[k] !== null) {
      freezeLayer(obj[k]);
    }
  }
  return Object.freeze(obj);
}

export const LAYER_CONFIG = freezeLayer({
  N0: {
    priority: 0,
    capacity: 16,
    purpose: "Identity / goal — who the user/agent is and the headline objective.",
    categories: ["REQUIREMENT", "DECISION"],
  },
  N1: {
    priority: 1,
    capacity: 64,
    purpose: "Domain / project — stable project facts, conventions, scope.",
    categories: ["FACT", "REQUIREMENT"],
  },
  N2: {
    priority: 2,
    capacity: 256,
    purpose: "Current state / evidence — in-flight state, observations, evidence.",
    categories: ["OBSERVATION", "EVIDENCE", "RESULT", "ERROR"],
  },
  N3: {
    priority: 3,
    capacity: 128,
    purpose: "Retrieval / exploration — tentative claims, hypotheses, search traces.",
    categories: ["CLAIM", "ASSUMPTION", "ACTION"],
  },
  ARCHIVE: {
    priority: 4,
    capacity: Infinity,
    purpose: "Archive — compressed, historically retained for provenance.",
    categories: ["FACT", "OBSERVATION", "CLAIM", "ASSUMPTION", "DECISION",
                 "REQUIREMENT", "EVIDENCE", "ERROR", "ACTION", "RESULT"],
  },
});

/**
 * Default category → layer mapping when no explicit memoryLayer is set
 * on the item. Categories listed in multiple layers resolve to the
 * highest-priority layer (smallest priority number).
 */
const CATEGORY_DEFAULT_LAYER = Object.freeze({
  REQUIREMENT: "N0",
  DECISION: "N0",
  FACT: "N1",
  OBSERVATION: "N2",
  EVIDENCE: "N2",
  RESULT: "N2",
  ERROR: "N2",
  CLAIM: "N3",
  ASSUMPTION: "N3",
  ACTION: "N3",
});

/**
 * Validate that a value is a known memory layer.
 * @param {unknown} layer
 * @returns {boolean}
 */
export function isMemoryLayer(layer) {
  return typeof layer === "string" && layer in MEMORY_LAYERS;
}

/**
 * Get the tier config for a layer.
 * @param {MemoryLayer} layer
 * @returns {typeof LAYER_CONFIG[MemoryLayer]}
 */
export function getLayerConfig(layer) {
  if (!isMemoryLayer(layer)) {
    throw new TypeError(`Unknown memory layer: ${String(layer)}`);
  }
  return LAYER_CONFIG[layer];
}

/**
 * Assign a memory layer to an item. Priority of resolution:
 *   1. Explicit item.memoryLayer if valid.
 *   2. item.metadata.layer if valid.
 *   3. Default by item.category (if provided) via CATEGORY_DEFAULT_LAYER.
 *   4. N3 as the safest fallback (exploration tier absorbs unknowns).
 *
 * Returns a NEW item with `memoryLayer` populated; original is not mutated.
 * @param {Object} item
 * @param {MemoryLayer} [explicitLayer]
 * @returns {Object}
 */
export function assignLayer(item, explicitLayer) {
  if (!item || typeof item !== "object") {
    throw new TypeError("item must be a non-null object");
  }
  let layer = explicitLayer;
  if (!isMemoryLayer(layer) && isMemoryLayer(item.memoryLayer)) {
    layer = item.memoryLayer;
  }
  if (!isMemoryLayer(layer) && item.metadata && isMemoryLayer(item.metadata.layer)) {
    layer = item.metadata.layer;
  }
  if (!isMemoryLayer(layer) && item.category && CATEGORY_DEFAULT_LAYER[item.category]) {
    layer = CATEGORY_DEFAULT_LAYER[item.category];
  }
  if (!isMemoryLayer(layer)) {
    layer = MEMORY_LAYERS.N3;
  }
  return { ...item, memoryLayer: layer };
}

/**
 * Sort items by tier priority (N0 first, ARCHIVE last). Stable for items
 * within the same layer: original order preserved.
 * @param {Object[]} items
 * @returns {Object[]}
 */
export function sortByLayer(items) {
  if (!Array.isArray(items)) {
    throw new TypeError("items must be an array");
  }
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const pa = LAYER_CONFIG[a.item.memoryLayer || "N3"].priority;
      const pb = LAYER_CONFIG[b.item.memoryLayer || "N3"].priority;
      if (pa !== pb) return pa - pb;
      return a.idx - b.idx;
    })
    .map(({ item }) => item);
}

/**
 * Group items by memory layer.
 * @param {Object[]} items
 * @returns {Record<MemoryLayer, Object[]>}
 */
export function groupByLayer(items) {
  if (!Array.isArray(items)) {
    throw new TypeError("items must be an array");
  }
  const out = { N0: [], N1: [], N2: [], N3: [], ARCHIVE: [] };
  for (const item of items) {
    const layer = isMemoryLayer(item.memoryLayer) ? item.memoryLayer : MEMORY_LAYERS.N3;
    out[layer].push(item);
  }
  return out;
}

/**
 * Return the set of items that should be evicted because their tier
 * exceeds its configured capacity. Eviction policy:
 *   - ACTIVE/CREATED items are protected until tier is over capacity.
 *   - Lowest importance first (importance default 0.5).
 *   - Among equal importance, oldest first.
 * @param {Object[]} items
 * @returns {Object[]} Items recommended for eviction (already-compressed
 *                    or archive-eligible items moved out of working set).
 */
export function selectEvictions(items) {
  if (!Array.isArray(items)) {
    throw new TypeError("items must be an array");
  }
  const grouped = groupByLayer(items);
  const evictions = [];
  for (const layer of WORKING_LAYERS) {
    const bucket = grouped[layer];
    const cap = LAYER_CONFIG[layer].capacity;
    if (bucket.length <= cap) continue;
    const surplus = bucket.length - cap;
    const sorted = bucket.slice().sort((a, b) => {
      const ia = typeof a.importance === "number" ? a.importance : 0.5;
      const ib = typeof b.importance === "number" ? b.importance : 0.5;
      if (ia !== ib) return ia - ib; // least important first
      return (a.timestamp || 0) - (b.timestamp || 0); // oldest first
    });
    for (let i = 0; i < surplus; i++) {
      evictions.push(sorted[i]);
    }
  }
  return evictions;
}

/**
 * Promote items to ARCHIVE based on lifecycle state. Items in COMPRESSED,
 * STALE, INVALIDATED, or ARCHIVED move to the archive tier.
 * @param {Object[]} items
 * @returns {Object[]}
 */
export function archiveCandidates(items) {
  if (!Array.isArray(items)) {
    throw new TypeError("items must be an array");
  }
  return items.filter((it) => {
    const state = it.lifecycle || LIFECYCLE_STATES.CREATED;
    return (
      state === LIFECYCLE_STATES.COMPRESSED ||
      state === LIFECYCLE_STATES.STALE ||
      state === LIFECYCLE_STATES.INVALIDATED ||
      state === LIFECYCLE_STATES.ARCHIVED
    );
  });
}

export default {
  MEMORY_LAYERS,
  WORKING_LAYERS,
  LAYER_CONFIG,
  isMemoryLayer,
  getLayerConfig,
  assignLayer,
  sortByLayer,
  groupByLayer,
  selectEvictions,
  archiveCandidates,
};