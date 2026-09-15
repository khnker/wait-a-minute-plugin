/**
 * ContextManager — Central orchestrator for context source registration,
 * lifecycle, and memory-layer organization.
 *
 * Builds on top of ContextSourceRegistry and adds:
 *   - lifecycle-aware item management (CREATED/ACTIVE/COMPRESSED/...)
 *   - memory layer assignment (N0..N3 + ARCHIVE)
 *   - retrieval helpers filtered by layer/lifecycle
 *   - capacity-driven eviction with archive promotion
 *
 * The public API (register / getSource / listSources / getAllContext /
 * size / clear) is preserved for backwards compatibility.
 */

import { ContextSourceRegistry } from "./context-source-registry.js";
import {
  LIFECYCLE_STATES,
  transition as lifecycleTransition,
  isUsable as lifecycleIsUsable,
  stalenessCheck,
} from "./context-lifecycle.js";
import {
  MEMORY_LAYERS,
  WORKING_LAYERS,
  assignLayer as assignMemoryLayer,
  sortByLayer,
  groupByLayer,
  selectEvictions,
  archiveCandidates,
} from "./context-memory-layers.js";
import { promoteItem as _promoteItem } from "./context-promotion.js";
import { demoteItem as _demoteItem } from "./context-demotion.js";

/**
 * @typedef {Object} ContextManagerOptions
 * @property {ContextSourceRegistry} [registry] - Optional pre-built registry.
 * @property {number} [workingCapacity] - Soft cap for total working items.
 */

/**
 * @typedef {Object} ManagedItem
 * @property {string} id
 * @property {string} type
 * @property {string} [label]
 * @property {string} [content]
 * @property {string} [source]
 * @property {number} [timestamp]
 * @property {string} [scope]
 * @property {string[]} [relatedRequirements]
 * @property {Object} [metadata]
 * @property {string} [lifecycle]
 * @property {string} [memoryLayer]
 * @property {number} [importance]
 * @property {Array} [lifecycleHistory]
 * @property {number} [updatedAt]
 */

class ContextManager {
  /**
   * @param {ContextManagerOptions} [options]
   */
  constructor(options = {}) {
    this.registry = options.registry || new ContextSourceRegistry();
    /** @type {number} */
    this.workingCapacity = options.workingCapacity || 1024;
  }

  // ---------------------------------------------------------------------
  // Registration (preserved API)
  // ---------------------------------------------------------------------

  /**
   * Register a context source via the underlying registry. The source is
   * normalized with default lifecycle (CREATED) and memoryLayer (N3
   * fallback). Returns the registered (and possibly updated) source.
   *
   * @param {ManagedItem} source
   * @returns {ManagedItem}
   */
  register(source) {
    if (!source || typeof source !== "object" || !source.id) {
      throw new TypeError("source must have an id");
    }
    const prepared = this._prepareItem(source);
    return this.registry.register(prepared);
  }

  /**
   * Remove a source by id.
   * @param {string} id
   * @returns {boolean}
   */
  unregister(id) {
    return this.registry.unregister(id);
  }

  /**
   * Retrieve a single context source by id.
   * @param {string} id
   * @returns {ManagedItem | undefined}
   */
  getSource(id) {
    return this.registry.get(id);
  }

  /**
   * List all registered sources.
   * @returns {ManagedItem[]}
   */
  listSources() {
    return this.registry.list();
  }

  /**
   * List sources filtered by type.
   * @param {string} type
   * @returns {ManagedItem[]}
   */
  listSourcesByType(type) {
    return this.registry.listByType(type);
  }

  /**
   * Snapshot of all context sources keyed by id.
   * @returns {Record<string, ManagedItem>}
   */
  getAllContext() {
    const result = {};
    for (const source of this.registry.list()) {
      result[source.id] = source;
    }
    return result;
  }

  /** @returns {number} */
  get size() {
    return this.registry.size;
  }

  /** Clear all registered sources. */
  clear() {
    this.registry.clear();
  }

  // ---------------------------------------------------------------------
  // Lifecycle operations
  // ---------------------------------------------------------------------

  /**
   * Apply a lifecycle transition to the item with the given id.
   * @param {string} id
   * @param {keyof typeof LIFECYCLE_STATES} next
   * @param {Object} [meta]
   * @returns {ManagedItem | undefined}
   */
  transitionItem(id, next, meta = {}) {
    const item = this.registry.get(id);
    if (!item) return undefined;
    const updated = lifecycleTransition(item, next, meta);
    this.registry.register(updated);
    return updated;
  }

  /**
   * Return only items in CREATED or ACTIVE state.
   * @returns {ManagedItem[]}
   */
  listUsable() {
    return this.registry.list().filter(lifecycleIsUsable);
  }

  /**
   * Run a staleness sweep: transition any item whose age exceeds its
   * state's threshold to STALE. Returns the list of items transitioned.
   * @param {number} [now]
   * @returns {ManagedItem[]}
   */
  sweepStale(now = Date.now()) {
    const transitioned = [];
    for (const item of this.registry.list()) {
      const next = stalenessCheck(item, now);
      if (
        next === LIFECYCLE_STATES.STALE &&
        item.lifecycle !== LIFECYCLE_STATES.STALE
      ) {
        const updated = lifecycleTransition(item, LIFECYCLE_STATES.STALE, {
          reason: "stale-sweep",
        });
        this.registry.register(updated);
        transitioned.push(updated);
      }
    }
    return transitioned;
  }

  // ---------------------------------------------------------------------
  // Memory-layer operations
  // ---------------------------------------------------------------------

  /**
   * List items belonging to a specific memory layer.
   * @param {keyof typeof MEMORY_LAYERS} layer
   * @returns {ManagedItem[]}
   */
  listByLayer(layer) {
    return this.registry.list().filter((it) => it.memoryLayer === layer);
  }

  /**
   * List working-memory items (N0..N3), ordered by layer priority.
   * @returns {ManagedItem[]}
   */
  listWorking() {
    const items = this.registry.list().filter((it) =>
      WORKING_LAYERS.includes(it.memoryLayer)
    );
    return sortByLayer(items);
  }

  /**
   * Group all items by memory layer.
   * @returns {Record<keyof typeof MEMORY_LAYERS, ManagedItem[]>}
   */
  groupedByLayer() {
    return groupByLayer(this.registry.list());
  }

  /**
   * Re-assign memory layer for a single item.
   * @param {string} id
   * @param {keyof typeof MEMORY_LAYERS} [layer]
   * @returns {ManagedItem | undefined}
   */
  setLayer(id, layer) {
    const item = this.registry.get(id);
    if (!item) return undefined;
    const updated = assignMemoryLayer(item, layer);
    this.registry.register(updated);
    return updated;
  }

  /**
   * Evict items to satisfy capacity constraints. Evicted items are
   * transitioned to COMPRESSED and moved to the ARCHIVE layer so they
   * remain queryable for provenance.
   * @returns {{evicted: ManagedItem[], remaining: number}}
   */
  evictForCapacity() {
    const items = this.registry.list();
    const evictions = selectEvictions(items);
    for (const item of evictions) {
      let updated = lifecycleTransition(item, LIFECYCLE_STATES.COMPRESSED, {
        reason: "capacity-eviction",
      });
      updated = assignMemoryLayer(updated, MEMORY_LAYERS.ARCHIVE);
      this.registry.register(updated);
    }
    return {
      evicted: evictions,
      remaining: this.registry.size,
    };
  }

  /**
   * Move every COMPRESSED/STALE/INVALIDATED/ARCHIVED item into the
   * ARCHIVE tier so retrieval helpers can treat archive as a single
   * provenance surface.
   * @returns {ManagedItem[]}
   */
  promoteArchive() {
    const items = this.registry.list();
    const candidates = archiveCandidates(items);
    const updated = [];
    for (const item of candidates) {
      if (item.memoryLayer === MEMORY_LAYERS.ARCHIVE) continue;
      const next = assignMemoryLayer(item, MEMORY_LAYERS.ARCHIVE);
      this.registry.register(next);
      updated.push(next);
    }
    return updated;
  }

  // ---------------------------------------------------------------------
  // Promote / demote (integrated API)
  // ---------------------------------------------------------------------

  /**
   * Promote a registered item to a higher-priority memory layer.
   * Delegates to context-promotion.js promoteItem, then persists
   * the result back into the registry.
   * @param {string} id
   * @param {keyof typeof MEMORY_LAYERS} targetLayer (N0–N3)
   * @returns {{item: ManagedItem, event: Object} | undefined}
   */
  promoteItem(id, targetLayer) {
    const item = this.registry.get(id);
    if (!item) return undefined;
    const result = _promoteItem(item, targetLayer);
    this.registry.register(result.item);
    return result;
  }

  /**
   * Demote a registered item to a lower-priority memory layer
   * or ARCHIVE. Delegates to context-demotion.js demoteItem,
   * then persists the result back into the registry.
   * @param {string} id
   * @param {keyof typeof MEMORY_LAYERS} targetLayer (N0–N3 or ARCHIVE)
   * @returns {{item: ManagedItem, event: Object} | undefined}
   */
  demoteItem(id, targetLayer) {
    const item = this.registry.get(id);
    if (!item) return undefined;
    const result = _demoteItem(item, targetLayer);
    this.registry.register(result.item);
    return result;
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  /**
   * Apply defaults (lifecycle, memoryLayer, timestamp) to an incoming
   * item before storage. Never mutates the caller's object.
   * @param {ManagedItem} source
   * @returns {ManagedItem}
   */
  _prepareItem(source) {
    const base = {
      ...source,
      lifecycle: source.lifecycle || LIFECYCLE_STATES.CREATED,
      timestamp: source.timestamp || Date.now(),
      metadata: source.metadata || {},
    };
    return assignMemoryLayer(base, source.memoryLayer);
  }
}

export { ContextManager };