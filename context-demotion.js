/**
 * Context Demotion — move items to lower-priority memory layers.
 *
 * Demotion examples: N0→N1, N1→N2, N2→N3, N3→ARCHIVE, etc.
 *
 * Side effects handled by this module:
 *   - Lifecycle transitions when moving to ARCHIVE (ACTIVE → COMPRESSED)
 *   - Metadata updates (memoryLayer, updatedAt, demotion history)
 *   - Event logging via lifecycleHistory entry
 *
 * All operations are immutable: the input item is never mutated.
 */

import {
  WORKING_LAYERS,
  MEMORY_LAYERS,
  LAYER_CONFIG,
  isMemoryLayer,
} from "./context-memory-layers.js";
import {
  LIFECYCLE_STATES,
  transition as lifecycleTransition,
  canTransition as isValidTransition,
} from "./context-lifecycle.js";

/**
 * @typedef {Object} DemotionEvent
 * @property {"demote"} type
 * @property {string} fromLayer
 * @property {string} toLayer
 * @property {boolean} lifecycleChanged
 * @property {string} [fromLifecycle]
 * @property {string} [toLifecycle]
 * @property {number} timestamp
 */

/**
 * @typedef {Object} DemotionResult
 * @property {Object} item — the demoted item (immutable copy with updates)
 * @property {DemotionEvent} event
 */

/**
 * Demote a context item to a lower-priority memory layer.
 *
 * Handles necessary lifecycle transitions when moving to ARCHIVE
 * (e.g. ACTIVE → COMPRESSED). Updates metadata and logs the event.
 *
 * @param {Object} item - The item to demote
 * @param {string} targetLayer - Target memory layer (N0–N3 or ARCHIVE)
 * @returns {DemotionResult}
 */
export function demoteItem(item, targetLayer) {
  if (!item || typeof item !== "object") {
    throw new TypeError("item must be an object");
  }
  if (!isMemoryLayer(targetLayer)) {
    throw new TypeError(`invalid target layer: ${targetLayer}`);
  }

  const currentLayer = resolveCurrentLayer(item);
  const currentPriority = LAYER_CONFIG[currentLayer].priority;
  const targetPriority = LAYER_CONFIG[targetLayer].priority;

  if (targetPriority <= currentPriority) {
    throw new TypeError(
      `not a demotion: ${currentLayer} (priority ${currentPriority}) → ${targetLayer} (priority ${targetPriority})`,
    );
  }

  const now = Date.now();

  // --- Lifecycle transition if moving to ARCHIVE ---
  let lifecycle = item.lifecycle || LIFECYCLE_STATES.CREATED;
  let lifecycleChanged = false;
  let fromLifecycle = lifecycle;

  if (targetLayer === MEMORY_LAYERS.ARCHIVE) {
    if (
      !TERMINAL_STATES.includes(lifecycle) &&
      isValidTransition(lifecycle, LIFECYCLE_STATES.COMPRESSED)
    ) {
      const transitioned = lifecycleTransition(item, LIFECYCLE_STATES.COMPRESSED, {
        reason: "demotion-to-archive",
        timestamp: now,
      });
      lifecycle = transitioned.lifecycle;
      lifecycleChanged = true;
    }
  }

  let toLifecycle = lifecycle;

  // --- Build new item (immutable) ---
  const demotedItem = {
    ...item,
    memoryLayer: targetLayer,
    lifecycle,
    updatedAt: now,
    metadata: {
      ...(item.metadata || {}),
      demotedFrom: currentLayer,
      demotedAt: now,
      ...(targetLayer === MEMORY_LAYERS.ARCHIVE ? { archivedAt: now } : {}),
    },
    lifecycleHistory: [
      ...(Array.isArray(item.lifecycleHistory) ? item.lifecycleHistory : []),
      {
        type: "demote",
        from: currentLayer,
        to: targetLayer,
        ...(lifecycleChanged
          ? { lifecycle: { from: fromLifecycle, to: toLifecycle } }
          : {}),
        timestamp: now,
      },
    ],
  };

  const event = {
    type: "demote",
    fromLayer: currentLayer,
    toLayer: targetLayer,
    lifecycleChanged,
    ...(lifecycleChanged ? { fromLifecycle, toLifecycle } : {}),
    timestamp: now,
  };

  return { item: Object.freeze(demotedItem), event };
}

/** Terminal lifecycle states — cannot be further transitioned. */
const TERMINAL_STATES = Object.freeze(["INVALIDATED", "ARCHIVED"]);

/**
 * Resolve the current memory layer of an item.
 * Falls back from item.memoryLayer → category-based default → N3.
 *
 * @param {Object} item
 * @returns {string}
 */
function resolveCurrentLayer(item) {
  if (isMemoryLayer(item.memoryLayer)) {
    return item.memoryLayer;
  }
  const category = item.type || item.category;
  if (category && typeof category === "string") {
    return inferLayerFromCategory(category);
  }
  return "N3";
}

/**
 * Infer a memory layer from a category string.
 *
 * @param {string} category
 * @returns {string}
 */
function inferLayerFromCategory(category) {
  const defaults = {
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
  };
  return defaults[category] || "N3";
}
