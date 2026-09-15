/**
 * Context Output Policy — MUST/SHOULD/DO_NOT_INCLUDE policies for LLM context.
 *
 * Change 76: Policy-based filtering of what context is included,
 * should be included, or must NOT be included when building LLM prompts.
 *
 * Policies:
 *   MUST           — Always included, never filtered out
 *   SHOULD         — Include unless over budget
 *   DO_NOT_INCLUDE — Never included
 *   UNCLASSIFIED   — Default, treated as SHOULD
 */

/** @typedef {"MUST"|"SHOULD"|"DO_NOT_INCLUDE"|"UNCLASSIFIED"} PolicyLevel */

/**
 * @typedef {Object} PolicyRule
 * @property {string} id - Rule identifier
 * @property {PolicyLevel} policy - The policy level
 * @property {(item: Object) => boolean} match - Predicate to match items
 * @property {string} reason - Human-readable reason
 */

/**
 * @typedef {Object} PolicyResult
 * @property {Object[]} must - Items classified MUST
 * @property {Object[]} should - Items classified SHOULD
 * @property {Object[]} excluded - Items classified DO_NOT_INCLUDE
 * @property {Object[]} unclassified - Items without policy match
 * @property {Set<string>} includedIds - IDs of all items included (must + should)
 */

const DEFAULT_POLICY = "UNCLASSIFIED";

/**
 * Change 76 — applyOutputPolicy
 *
 * Categorizes items into MUST / SHOULD / DO_NOT_INCLUDE / UNCLASSIFIED
 * based on a list of policy rules.
 *
 * @param {Object[]} items - Context items to categorize
 * @param {PolicyRule[]} rules - Policy rules to apply
 * @returns {PolicyResult}
 */
export function applyOutputPolicy(items, rules) {
  if (!Array.isArray(items)) {
    throw new TypeError("items must be an array");
  }
  if (!Array.isArray(rules)) {
    throw new TypeError("rules must be an array");
  }

  const must = [];
  const should = [];
  const excluded = [];
  const unclassified = [];

  for (const item of items) {
    if (!item || !item.id) continue;

    let matched = false;
    for (const rule of rules) {
      if (!rule.match || !rule.match(item)) continue;
      matched = true;
      switch (rule.policy) {
        case "MUST":
          must.push(item);
          break;
        case "SHOULD":
          should.push(item);
          break;
        case "DO_NOT_INCLUDE":
          excluded.push(item);
          break;
        default:
          unclassified.push(item);
      }
      break; // First matching rule wins
    }
    if (!matched) {
      unclassified.push(item);
    }
  }

  const includedIds = new Set([...must, ...should].map((i) => i.id));

  return { must, should, excluded, unclassified, includedIds };
}

/**
 * Filter items to only those allowed by policy (MUST + SHOULD).
 * DO_NOT_INCLUDE items are removed.
 *
 * @param {Object[]} items
 * @param {PolicyRule[]} rules
 * @returns {Object[]}
 */
export function filterByPolicy(items, rules) {
  const result = applyOutputPolicy(items, rules);
  return [...result.must, ...result.should];
}

/**
 * Create a simple type-based policy rule.
 * @param {string} id
 * @param {PolicyLevel} policy
 * @param {string[]} types
 * @param {string} reason
 * @returns {PolicyRule}
 */
export function typePolicyRule(id, policy, types, reason) {
  return {
    id,
    policy,
    match: (item) => item && types.includes(item.type),
    reason,
  };
}

/**
 * Create a simple scope-based policy rule.
 * @param {string} id
 * @param {PolicyLevel} policy
 * @param {string[]} scopes
 * @param {string} reason
 * @returns {PolicyRule}
 */
export function scopePolicyRule(id, policy, scopes, reason) {
  return {
    id,
    policy,
    match: (item) => item && scopes.includes(item.scope),
    reason,
  };
}
