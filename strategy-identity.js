// strategy-identity.js
// Canonical hashing and identity for approvedStrategy objects.
//
// Exports:
//   - createStrategyIdentity(rawStrategy): builds an identity { canonical, hash, ephemeral }
//   - normalizeStrategy(rawStrategy): returns the canonical projection (volatile fields
//     removed, keys sorted recursively, arrays normalized for stability)
//   - hashStrategy(rawStrategy | identity): returns sha256 of canonical JSON
//   - sameStrategy(a, b): strict-equality of canonical hashes
//
// Design goals:
//   - Stable across property reordering (top-level + nested object keys sorted).
//   - Stable across volatile/ephemeral fields (timestamps, IDs, attempt counters).
//   - Pure: no I/O, no Date.now() side effects, no randomness.
//   - Deterministic JSON via canonical projection.

import { createHash } from "node:crypto";

// Volatile keys do NOT affect strategy semantics and MUST be stripped before hashing.
const VOLATILE_KEYS = new Set([
  "createdAt",
  "updatedAt",
  "modifiedAt",
  "instanceId",
  "runId",
  "correlationId",
  "requestId",
  "sessionId",
  "traceId",
  "attempt",
  "durationMs",
  "timestamp",
  "ts",
  "id",
  "_id",
]);

// Keys whose value is an array of strategy rules (allowed/prohibited actions).
// Arrays under these keys are sorted by their string representation to remain stable.
const SORTED_ARRAY_KEYS = new Set([
  "allowedActions",
  "prohibitedActions",
]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isVolatileKey(key) {
  return VOLATILE_KEYS.has(key);
}

function stableKey(value) {
  if (value === null) return " ";
  if (typeof value === "string") return `s:${value}`;
  if (typeof value === "number") return `n:${value}`;
  if (typeof value === "boolean") return `b:${value}`;
  if (Array.isArray(value)) return `a:${value.map(stableKey).join("|")}`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `o:${keys.map((k) => `${k}=${stableKey(value[k])}`).join("&")}`;
  }
  return `u:${String(value)}`;
}

function stableSortArray(arr) {
  if (arr.length === 0) return arr;
  const indexed = arr.map((v, i) => ({ i, k: stableKey(v) }));
  indexed.sort((a, b) => {
    if (a.k < b.k) return -1;
    if (a.k > b.k) return 1;
    return a.i - b.i;
  });
  return indexed.map((x) => arr[x.i]);
}

function canonicalizeValue(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const arr = value.map((v) => canonicalizeValue(v));
    return stableSortArray(arr);
  }
  if (typeof value === "object") {
    if (!isPlainObject(value)) return value;
    const sortedKeys = Object.keys(value).sort();
    const out = {};
    for (const key of sortedKeys) {
      if (isVolatileKey(key)) continue;
      out[key] = canonicalizeValue(value[key]);
    }
    return out;
  }
  return value;
}

function normalizeStrategy(rawStrategy) {
  if (rawStrategy === null || rawStrategy === undefined) return null;
  if (typeof rawStrategy !== "object") return null;
  return canonicalizeValue(rawStrategy);
}

function hashStrategy(input) {
  const normalized =
    input && typeof input === "object" && input.__normalized === true
      ? input.canonical
      : normalizeStrategy(input);
  if (normalized === null) return null;
  const json = JSON.stringify(normalized);
  return createHash("sha256").update(json).digest("hex");
}

function collectEphemeralKeys(value, prefix = "") {
  const found = [];
  if (value === null || value === undefined) return found;
  if (typeof value !== "object" || Array.isArray(value)) return found;
  if (!isPlainObject(value)) return found;
  for (const key of Object.keys(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isVolatileKey(key)) {
      found.push(path);
    } else {
      const child = value[key];
      if (child && typeof child === "object" && !Array.isArray(child) && isPlainObject(child)) {
        found.push(...collectEphemeralKeys(child, path));
      }
    }
  }
  return found;
}

function createStrategyIdentity(rawStrategy) {
  const canonical = normalizeStrategy(rawStrategy);
  const hash = canonical === null ? null : hashStrategy({ __normalized: true, canonical });
  const ephemeral = collectEphemeralKeys(rawStrategy);
  return {
    canonical,
    hash,
    ephemeral,
    __normalized: true,
  };
}

function sameStrategy(a, b) {
  const ha = hashStrategy(a);
  const hb = hashStrategy(b);
  if (ha === null && hb === null) return true;
  if (ha === null || hb === null) return false;
  return ha === hb;
}

export {
  createStrategyIdentity,
  normalizeStrategy,
  hashStrategy,
  sameStrategy,
  // exported for tests / advanced use:
  canonicalizeValue as _canonicalizeValue,
  VOLATILE_KEYS as _VOLATILE_KEYS,
  SORTED_ARRAY_KEYS as _SORTED_ARRAY_KEYS,
};
