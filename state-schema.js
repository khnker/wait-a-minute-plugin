// state-schema.js
// JSON Schema validation for durable state documents with corruption detection
// (hash + schema validation). No external dependencies — uses Node's built-in.

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Schema registry
// ---------------------------------------------------------------------------

/**
 * Minimal JSON Schema subset validator. Supports:
 *  - type: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null"
 *  - properties (with required[])
 *  - items
 *  - enum, const, pattern (string regex), minLength, maxLength
 *  - minimum, maximum
 *  - additionalProperties: false
 *  - oneOf, anyOf (shallow)
 *
 * Returns { valid: boolean, errors: [{ path, message }] }
 */
export function validateSchema(schema, value) {
  const errors = [];
  walk(schema, value, "", errors);
  return { valid: errors.length === 0, errors };
}

function walk(schema, value, path, errors) {
  if (schema === true) return;          // any value
  if (schema === false) {
    errors.push({ path, message: "schema disallows this value" });
    return;
  }
  if (typeof schema !== "object" || schema === null) return;

  // oneOf / anyOf (shallow — first match wins, otherwise collect all)
  if (Array.isArray(schema.oneOf)) {
    const matched = schema.oneOf.some((sub) => validateSchema(sub, value).valid);
    if (!matched) errors.push({ path, message: "does not match any oneOf branch" });
    return;
  }
  if (Array.isArray(schema.anyOf)) {
    const matched = schema.anyOf.some((sub) => validateSchema(sub, value).valid);
    if (!matched) errors.push({ path, message: "does not match any anyOf branch" });
    return;
  }

  // const / enum
  if (Object.prototype.hasOwnProperty.call(schema, "const")) {
    if (!deepEqual(schema.const, value))
      errors.push({ path, message: `expected const ${JSON.stringify(schema.const)}` });
    return;
  }
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some((v) => deepEqual(v, value)))
      errors.push({ path, message: `expected one of ${JSON.stringify(schema.enum)}` });
    return;
  }

  // type
  if (schema.type) {
    const actual = jsonType(value);
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.includes(actual)) {
      errors.push({
        path,
        message: `expected type ${expected.join("|")}, got ${actual}`,
      });
      return;
    }
  }

  // string constraints
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength)
      errors.push({ path, message: `string shorter than minLength ${schema.minLength}` });
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength)
      errors.push({ path, message: `string longer than maxLength ${schema.maxLength}` });
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern).test(value))
          errors.push({ path, message: `does not match pattern ${schema.pattern}` });
      } catch {
        /* ignore bad regex */
      }
    }
  }

  // numeric constraints
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum)
      errors.push({ path, message: `value below minimum ${schema.minimum}` });
    if (typeof schema.maximum === "number" && value > schema.maximum)
      errors.push({ path, message: `value above maximum ${schema.maximum}` });
  }

  // object
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(value, key))
          errors.push({ path: joinPath(path, key), message: "missing required field" });
      }
    }
    if (schema.properties) {
      for (const [k, sub] of Object.entries(schema.properties)) {
        if (Object.prototype.hasOwnProperty.call(value, k))
          walk(sub, value[k], joinPath(path, k), errors);
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const k of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties, k))
          errors.push({ path: joinPath(path, k), message: "additional property not allowed" });
      }
    }
  }

  // array
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => walk(schema.items, item, `${path}[${i}]`, errors));
  }
}

function joinPath(base, key) {
  if (!base) return String(key);
  if (/^\d+$/.test(String(key))) return `${base}[${key}]`;
  return `${base}.${key}`;
}

function jsonType(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number" && Number.isInteger(v)) return "integer";
  return typeof v;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

// ---------------------------------------------------------------------------
// Schemas for the five state surfaces defined in design.md
// ---------------------------------------------------------------------------

const commonEnvelope = {
  type: "object",
  required: ["stateVersion", "lastModifiedAt"],
  properties: {
    stateVersion: { type: "integer", minimum: 1 },
    lastModifiedAt: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
};

export const SCHEMAS = {
  assessment: {
    ...commonEnvelope,
    properties: {
      ...commonEnvelope.properties,
      taskId: { type: "string", minLength: 1 },
      summary: { type: "string" },
      result: { enum: ["PASS", "FAIL", "WARN", "INCONCLUSIVE"] },
      findings: {
        type: "array",
        items: {
          type: "object",
          required: ["path", "result"],
          properties: {
            path: { type: "string" },
            result: { enum: ["PASS", "FAIL", "WARN", "INCONCLUSIVE"] },
            reason: { type: "string" },
          },
        },
      },
    },
    required: ["stateVersion", "lastModifiedAt", "taskId", "result"],
  },

  plan: {
    ...commonEnvelope,
    properties: {
      ...commonEnvelope.properties,
      planId: { type: "string", minLength: 1 },
      taskId: { type: "string", minLength: 1 },
      steps: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "status"],
          properties: {
            id: { type: "string", minLength: 1 },
            status: { enum: ["pending", "running", "done", "failed", "skipped"] },
            description: { type: "string" },
          },
        },
      },
    },
    required: ["stateVersion", "lastModifiedAt", "planId", "taskId", "steps"],
  },

  evidence: {
    ...commonEnvelope,
    properties: {
      ...commonEnvelope.properties,
      taskId: { type: "string", minLength: 1 },
      stepId: { type: "string", minLength: 1 },
      kind: { enum: ["file", "log", "metric", "snapshot"] },
      contentHash: { type: "string", minLength: 1 },
    },
    required: ["stateVersion", "lastModifiedAt", "taskId", "stepId", "kind", "contentHash"],
  },

  completion: {
    ...commonEnvelope,
    properties: {
      ...commonEnvelope.properties,
      taskId: { type: "string", minLength: 1 },
      status: { enum: ["complete", "incomplete", "blocked"] },
      reportPath: { type: "string" },
    },
    required: ["stateVersion", "lastModifiedAt", "taskId", "status"],
  },

  drift: {
    type: "object",
    required: ["taskId", "lastModifiedAt", "entries"],
    properties: {
      taskId: { type: "string", minLength: 1 },
      lastModifiedAt: { type: "string", minLength: 1 },
      entries: {
        type: "array",
        items: {
          type: "object",
          required: ["ts", "kind"],
          properties: {
            ts: { type: "string", minLength: 1 },
            kind: { enum: ["deviation", "correction", "warning"] },
            note: { type: "string" },
          },
        },
      },
    },
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Hash + corruption detection
// ---------------------------------------------------------------------------

/**
 * Canonical JSON: stable key ordering so hashing is deterministic.
 */
export function canonicalJSON(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortKeys);
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
  return out;
}

/**
 * Compute a SHA-256 hash of a state document payload (excluding the `_hash` itself).
 */
export function computeHash(payload) {
  const { _hash, ...rest } = payload;
  return createHash("sha256").update(canonicalJSON(rest)).digest("hex");
}

/**
 * Wrap a payload with a `_hash` field that commits the canonical-JSON hash.
 */
export function seal(payload) {
  const hash = computeHash(payload);
  return { ...payload, _hash: hash };
}

/**
 * Verify a sealed payload. Returns { valid, reason? }.
 */
export function verify(payload) {
  if (!payload || typeof payload !== "object" || !("_hash" in payload))
    return { valid: false, reason: "missing _hash field" };
  const expected = payload._hash;
  const actual = computeHash(payload);
  if (expected !== actual) return { valid: false, reason: "hash mismatch (corruption detected)" };
  return { valid: true };
}

/**
 * Validate + verify a sealed payload. Returns { valid, errors, reason? }.
 */
export function validateSealed(schema, payload) {
  const v = verify(payload);
  if (!v.valid) return { valid: false, errors: [], reason: v.reason };
  // _hash is metadata, strip it for schema check
  const { _hash, ...data } = payload;
  return { ...validateSchema(schema, data), reason: undefined };
}

export const STATE_TYPES = Object.keys(SCHEMAS);
