/**
 * Context Promotion — move items to higher-priority memory layers.
 *
 * Promotion examples: N3→N2, N2→N1, N1→N0, N3→N0, ARCHIVE→N3, etc.
 *
 * Side effects handled by this module:
 *   - Lifecycle transitions when necessary (COMPRESSED → ACTIVE)
 *   - Metadata updates (memoryLayer, updatedAt, promotion history)
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
 * @typedef {Object} PromotionEvent
 * @property {"promote"} type
 * @property {string} fromLayer
 * @property {string} toLayer
 * @property {boolean} lifecycleChanged
 * @property {string} [fromLifecycle]
 * @property {string} [toLifecycle]
 * @property {number} timestamp
 */

/**
 * @typedef {Object} PromotionResult
 * @property {Object} item — the promoted item (immutable copy with updates)
 * @property {PromotionEvent} event
 */

/**
 * Promote a context item to a higher-priority memory layer.
 *
 * Handles necessary lifecycle transitions (e.g. COMPRESSED → ACTIVE)
 * before the layer change, updates metadata, and logs the event.
 *
 * @param {Object} item - The item to promote (must have memoryLayer or inferable category)
 * @param {string} targetLayer - Target memory layer (N0–N3)
 * @returns {PromotionResult}
 */
export function promoteItem(item, targetLayer) {
  if (!item || typeof item !== "object") {
    throw new TypeError("item must be an object");
  }
  if (!isMemoryLayer(targetLayer)) {
    throw new TypeError(`invalid target layer: ${targetLayer}`);
  }
  if (!WORKING_LAYERS.includes(targetLayer)) {
    throw new TypeError(
      `cannot promote to ${targetLayer}: use demoteItem for archive moves`,
    );
  }

  const currentLayer = resolveCurrentLayer(item);
  const currentPriority = LAYER_CONFIG[currentLayer].priority;
  const targetPriority = LAYER_CONFIG[targetLayer].priority;

  if (targetPriority >= currentPriority) {
    throw new TypeError(
      `not a promotion: ${currentLayer} (priority ${currentPriority}) → ${targetLayer} (priority ${targetPriority})`,
    );
  }

  const now = Date.now();

  // --- Lifecycle transition if necessary ---
  let lifecycle = item.lifecycle || LIFECYCLE_STATES.CREATED;
  let lifecycleChanged = false;
  let fromLifecycle = lifecycle;

  if (lifecycle === LIFECYCLE_STATES.COMPRESSED) {
    if (isValidTransition(lifecycle, LIFECYCLE_STATES.ACTIVE)) {
      const transitioned = lifecycleTransition(item, LIFECYCLE_STATES.ACTIVE, {
        reason: "promotion-from-compressed",
        timestamp: now,
      });
      lifecycle = transitioned.lifecycle;
      lifecycleChanged = true;
    }
  }

  let toLifecycle = lifecycle;

  // --- Build new item (immutable) ---
  const promotedItem = {
    ...item,
    memoryLayer: targetLayer,
    lifecycle,
    updatedAt: now,
    metadata: {
      ...(item.metadata || {}),
      promotedFrom: currentLayer,
      promotedAt: now,
    },
    lifecycleHistory: [
      ...(Array.isArray(item.lifecycleHistory) ? item.lifecycleHistory : []),
      {
        type: "promote",
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
    type: "promote",
    fromLayer: currentLayer,
    toLayer: targetLayer,
    lifecycleChanged,
    ...(lifecycleChanged ? { fromLifecycle, toLifecycle } : {}),
    timestamp: now,
  };

  return { item: Object.freeze(promotedItem), event };
}

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
 * Infer a memory layer from a category string using the same
 * rules as context-memory-layers.js CATEGORY_DEFAULT_LAYER.
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
