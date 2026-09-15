/**
 * Context Budget Manager — N0-N3/Archive Budget Tracking & Enforcement.
 *
 * Change 72: Tracks token budgets per memory layer, enforces limits,
 * reports violations, and suggests eviction priorities.
 *
 * Budget model:
 *   - Each layer (N0, N1, N2, N3, ARCHIVE) has a max token budget.
 *   - Items are tracked with their estimated token cost.
 *   - Budget violations are reported with remediation suggestions.
 *   - N0 is always protected (minimum guaranteed budget).
 *
 * Invariant: Total budget across layers >= reserved + flex from assembly.
 */

/** Default tier budgets in tokens (approximate). */
const DEFAULT_BUDGETS = Object.freeze({
  N0: 200,      // Identity/goal — tiny but mandatory
  N1: 800,      // Domain/project context
  N2: 500,      // Current task state/evidence
  N3: 1500,     // Session/capsule retrieval layer
  ARCHIVE: 4000, // Historical/compressed
});

/** Minimum guaranteed budgets (cannot be reduced). */
const MINIMUM_BUDGETS = Object.freeze({
  N0: 100,
  N1: 100,
  N2: 100,
  N3: 200,
  ARCHIVE: 500,
});

const LAYER_ORDER = ["N0", "N1", "N2", "N3", "ARCHIVE"];

/**
 * ContextBudgetManager tracks and enforces token budgets per memory layer.
 */
export class ContextBudgetManager {
  /**
   * @param {Object} [options]
   * @param {Object} [options.budgets] - Custom max budgets per layer.
   * @param {Object} [options.minimums] - Custom minimum budgets per layer.
   */
  constructor(options = {}) {
    this._budgets = { ...DEFAULT_BUDGETS, ...(options.budgets || {}) };
    this._minimums = { ...MINIMUM_BUDGETS, ...(options.minimums || {}) };
    /** @type {Map<string, {tokens: number, itemId: string, admission: string}>} */
    this._items = new Map();
    /** @type {Array<{layer: string, action: string, detail: string, timestamp: number}>} */
    this._auditLog = [];
  }

  // ---------------------------------------------------------------
  // Budget configuration
  // ---------------------------------------------------------------

  /** Get max budget for a layer. */
  getBudget(layer) {
    return this._budgets[layer] ?? 0;
  }

  /** Get minimum guaranteed budget for a layer. */
  getMinimum(layer) {
    return this._minimums[layer] ?? 0;
  }

  /** Get all budgets. */
  getAllBudgets() {
    return { ...this._budgets };
  }

  /** Set budget for a layer. */
  setBudget(layer, tokens) {
    if (tokens < this.getMinimum(layer)) {
      throw new Error(
        `Budget for ${layer} (${tokens}) below minimum (${this.getMinimum(layer)})`
      );
    }
    this._budgets[layer] = tokens;
    this._log(layer, "budget_updated", `Budget set to ${tokens}`);
  }

  // ---------------------------------------------------------------
  // Item tracking
  // ---------------------------------------------------------------

  /** Register an item with its token cost in a layer. */
  addItem(layer, itemId, tokens, admission = "OPTIONAL") {
    if (!LAYER_ORDER.includes(layer)) {
      throw new Error(`Unknown layer: ${layer}`);
    }
    this._items.set(itemId, { layer, tokens, itemId, admission });
    this._log(layer, "item_added", `${itemId}: ${tokens} tok (${admission})`);
    return this.getLayerUsage(layer);
  }

  /** Remove an item from tracking. */
  removeItem(itemId) {
    const item = this._items.get(itemId);
    if (item) {
      this._items.delete(itemId);
      this._log(item.layer, "item_removed", itemId);
    }
    return item;
  }

  /** Get all tracked items for a layer. */
  getItems(layer) {
    return Array.from(this._items.values()).filter((i) => i.layer === layer);
  }

  /** Get all tracked items. */
  getAllItems() {
    return Array.from(this._items.values());
  }

  // ---------------------------------------------------------------
  // Usage & enforcement
  // ---------------------------------------------------------------

  /** Get current token usage for a layer. */
  getLayerUsage(layer) {
    let used = 0;
    for (const item of this._items.values()) {
      if (item.layer === layer) used += item.tokens;
    }
    const budget = this.getBudget(layer);
    return {
      layer,
      used,
      budget,
      remaining: Math.max(0, budget - used),
      utilization: budget > 0 ? used / budget : 0,
      overBudget: used > budget,
    };
  }

  /** Get usage for all layers. */
  getAllUsage() {
    return LAYER_ORDER.map((layer) => this.getLayerUsage(layer));
  }

  /** Get total tokens across all layers. */
  getTotalUsage() {
    let total = 0;
    for (const item of this._items.values()) total += item.tokens;
    return total;
  }

  /** Check for budget violations and return report. */
  checkViolations() {
    const violations = [];
    for (const layer of LAYER_ORDER) {
      const usage = this.getLayerUsage(layer);
      if (usage.overBudget) {
        const excess = usage.used - usage.budget;
        const minimumProtected = usage.used > this.getMinimum(layer)
          ? this.getMinimum(layer)
          : usage.used;
        violations.push({
          layer,
          severity: this.getMinimum(layer) > 0 && usage.used <= this.getMinimum(layer)
            ? "SOFT"
            : "HARD",
          overBy: excess,
          used: usage.used,
          budget: usage.budget,
          minimum: this.getMinimum(layer),
          suggestion: this._suggestEviction(layer, excess),
        });
      }
    }
    return {
      violations,
      clean: violations.length === 0,
      totalOverBudget: violations.reduce((sum, v) => sum + v.overBy, 0),
    };
  }

  /** Suggest items to evict from a layer to meet budget. */
  _suggestEviction(layer, excessTokens) {
    const items = this.getItems(layer).sort((a, b) => a.tokens - b.tokens);
    const suggestions = [];
    let freed = 0;
    for (const item of items) {
      if (freed >= excessTokens) break;
      suggestions.push({ itemId: item.itemId, tokens: item.tokens, admission: item.admission });
      freed += item.tokens;
    }
    return suggestions;
  }

  // ---------------------------------------------------------------
  // Audit & reporting
  // ---------------------------------------------------------------

  /** Get audit log entries. */
  getAuditLog() {
    return [...this._auditLog];
  }

  /** Generate a budget report summary. */
  report() {
    const allUsage = this.getAllUsage();
    const check = this.checkViolations();
    return {
      layer: allUsage,
      layers: allUsage,
      totalUsed: this.getTotalUsage(),
      totalBudget: Object.values(this._budgets).reduce((a, b) => a + b, 0),
      violations: check.violations,
      violationReport: check,
      timestamp: Date.now(),
    };
  }

  _log(layer, action, detail) {
    this._auditLog.push({
      layer,
      action,
      detail,
      timestamp: Date.now(),
    });
    // Keep audit log manageable
    if (this._auditLog.length > 10000) {
      this._auditLog = this._auditLog.slice(-5000);
    }
  }
}

export { DEFAULT_BUDGETS, MINIMUM_BUDGETS, LAYER_ORDER };
