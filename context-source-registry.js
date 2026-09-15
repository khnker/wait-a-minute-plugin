/**
 * Context Source Registry — Registration and lookup for context sources.
 *
 * Manages a collection of context sources (id → source mapping).
 * Sources are plain objects with at least an `id` and `type` field.
 *
 * Keeps registration idempotent: re-registering the same id updates the source.
 */

/**
 * @typedef {Object} ContextSource
 * @property {string} id - Unique identifier for the source
 * @property {string} type - Source type/category
 */

class ContextSourceRegistry {
  constructor() {
    /** @type {Map<string, ContextSource>} */
    this._sources = new Map();
  }

  /**
   * Register or update a context source.
   * @param {ContextSource} source
   * @returns {ContextSource} The registered source.
   */
  register(source) {
    if (!source || typeof source.id !== "string" || !source.id) {
      throw new TypeError("Source must have a non-empty string `id`");
    }
    this._sources.set(source.id, source);
    return source;
  }

  /**
   * Remove a source by id.
   * @param {string} id
   * @returns {boolean} true if removed, false if not found.
   */
  unregister(id) {
    return this._sources.delete(id);
  }

  /**
   * Retrieve a source by id.
   * @param {string} id
   * @returns {ContextSource | undefined}
   */
  get(id) {
    return this._sources.get(id);
  }

  /**
   * Check if a source is registered.
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return this._sources.has(id);
  }

  /**
   * List all registered sources.
   * @returns {ContextSource[]}
   */
  list() {
    return [...this._sources.values()];
  }

  /**
   * List sources filtered by type.
   * @param {string} type
   * @returns {ContextSource[]}
   */
  listByType(type) {
    return this.list().filter((s) => s.type === type);
  }

  /**
   * Total number of registered sources.
   * @returns {number}
   */
  get size() {
    return this._sources.size;
  }

  /**
   * Clear all sources.
   */
  clear() {
    this._sources.clear();
  }
}

export { ContextSourceRegistry };
