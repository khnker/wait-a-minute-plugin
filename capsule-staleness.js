/**
 * Capsule Staleness Detection — proactive detection and auto-staling.
 *
 * Detects stale capsules proactively and auto-stales them.
 * Estimates max staleness (MSL) per session from activity patterns.
 *
 * MSL = max gap between consecutive selections + safety margin.
 * If no selections yet, default = 24h.
 */

import fs from "node:fs";
import path from "node:path";

/** Default TTL in days */
const DEFAULT_TTL_DAYS = 30;

/** Safety margin multiplier for MSL */
const SAFETY_MARGIN = 1.5;

/**
 * @typedef {Object} StalenessConfig
 * @property {number} ttl_days - Default TTL in days
 * @property {number} msl_hours - Max staleness limit in hours
 * @property {boolean} auto_stale - Whether to auto-mark stale capsules
 */

/**
 * @typedef {Object} StalenessResult
 * @property {string} contextId
 * @property {boolean} stale
 * @property {string} reason
 * @property {number} age_days
 * @property {number} freshness
 */

/**
 * Default staleness configuration.
 */
export const DEFAULT_CONFIG = {
  ttl_days: DEFAULT_TTL_DAYS,
  msl_hours: 24,
  auto_stale: true,
};

/**
 * Calculate capsule freshness based on age.
 *
 * @param {Object} capsule
 * @param {number} now - Current timestamp (ms)
 * @returns {number} Freshness score 0-1
 */
export function freshness(capsule, now = Date.now()) {
  const updated = new Date(capsule.updated_at || capsule.created_at).getTime();
  const days = Math.max(0, (now - updated) / 86400000);
  return Math.max(0.1, 1 - days / DEFAULT_TTL_DAYS);
}

/**
 * Check if a capsule is stale based on TTL and MSL.
 *
 * @param {Object} capsule
 * @param {StalenessConfig} config
 * @param {number} now - Current timestamp (ms)
 * @returns {StalenessResult}
 */
export function checkStaleness(capsule, config = DEFAULT_CONFIG, now = Date.now()) {
  const created = new Date(capsule.created_at).getTime();
  const updated = new Date(capsule.updated_at || capsule.created_at).getTime();
  const ageDays = (now - created) / 86400000;
  const lastUpdateDays = (now - updated) / 86400000;

  // Check TTL expiration
  if (ageDays > config.ttl_days) {
    return {
      contextId: capsule.context_id,
      stale: true,
      reason: `ttl_exceeded: age ${ageDays.toFixed(1)}d > TTL ${config.ttl_days}d`,
      age_days: ageDays,
      freshness: freshness(capsule, now),
    };
  }

  // Check MSL (max staleness limit)
  const mslDays = config.msl_hours / 24;
  if (lastUpdateDays > mslDays) {
    return {
      contextId: capsule.context_id,
      stale: true,
      reason: `msl_exceeded: last update ${lastUpdateDays.toFixed(1)}d > MSL ${mslDays.toFixed(1)}d`,
      age_days: ageDays,
      freshness: freshness(capsule, now),
    };
  }

  // Check if lifecycle is already stale
  if (capsule.lifecycle === "stale") {
    return {
      contextId: capsule.context_id,
      stale: true,
      reason: "already_stale",
      age_days: ageDays,
      freshness: freshness(capsule, now),
    };
  }

  return {
    contextId: capsule.context_id,
    stale: false,
    reason: "fresh",
    age_days: ageDays,
    freshness: freshness(capsule, now),
  };
}

/**
 * Estimate MSL (max staleness limit) from session activity patterns.
 *
 * @param {string} root - Project root
 * @param {string} sessionId - Session ID
 * @returns {number} MSL in hours
 */
export function estimateMSL(root, sessionId) {
  const tracesDir = path.join(root, ".wam", "traces");
  const selectionLog = path.join(tracesDir, "selection-log.jsonl");

  if (!fs.existsSync(selectionLog)) {
    return DEFAULT_CONFIG.msl_hours;
  }

  try {
    const content = fs.readFileSync(selectionLog, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    // Get timestamps for this session
    const timestamps = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.session_id === sessionId || !entry.session_id) {
          timestamps.push(new Date(entry.timestamp).getTime());
        }
      } catch {}
    }

    if (timestamps.length < 2) {
      return DEFAULT_CONFIG.msl_hours;
    }

    // Calculate gaps between consecutive selections
    timestamps.sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < timestamps.length; i++) {
      gaps.push(timestamps[i] - timestamps[i - 1]);
    }

    // MSL = max gap + safety margin
    const maxGap = Math.max(...gaps);
    const mslMs = maxGap * SAFETY_MARGIN;
    const mslHours = Math.max(1, mslMs / 3600000);

    // Clamp to reasonable bounds
    return Math.min(72, Math.max(1, mslHours));
  } catch {
    return DEFAULT_CONFIG.msl_hours;
  }
}

/**
 * Scan all active capsules and return staleness results.
 *
 * @param {string} root - Project root
 * @param {StalenessConfig} config
 * @returns {StalenessResult[]}
 */
export function scanForStale(root, config = DEFAULT_CONFIG) {
  const capsulesDir = path.join(root, ".wam", "capsules");
  if (!fs.existsSync(capsulesDir)) {
    return [];
  }

  const results = [];
  const files = fs.readdirSync(capsulesDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(capsulesDir, file), "utf-8");
      const capsule = JSON.parse(content);

      if (capsule.lifecycle === "active") {
        results.push(checkStaleness(capsule, config));
      }
    } catch {}
  }

  return results;
}

/**
 * Auto-mark stale capsules in a directory.
 *
 * @param {string} root - Project root
 * @param {StalenessConfig} config
 * @returns {string[]} List of capsule IDs that were marked stale
 */
export function autoMarkStale(root, config = DEFAULT_CONFIG) {
  if (!config.auto_stale) {
    return [];
  }

  const capsulesDir = path.join(root, ".wam", "capsules");
  if (!fs.existsSync(capsulesDir)) {
    return [];
  }

  const marked = [];
  const files = fs.readdirSync(capsulesDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      const filePath = path.join(capsulesDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const capsule = JSON.parse(content);

      if (capsule.lifecycle === "active") {
        const result = checkStaleness(capsule, config);
        if (result.stale) {
          capsule.lifecycle = "stale";
          capsule.updated_at = new Date().toISOString();
          fs.writeFileSync(filePath, JSON.stringify(capsule, null, 2) + "\n");
          marked.push(capsule.context_id);
        }
      }
    } catch {}
  }

  return marked;
}

/**
 * Get staleness report for a project.
 *
 * @param {string} root - Project root
 * @param {StalenessConfig} config
 * @returns {Object} Staleness report
 */
export function getStalenessReport(root, config = DEFAULT_CONFIG) {
  const results = scanForStale(root, config);
  const stale = results.filter((r) => r.stale);
  const fresh = results.filter((r) => !r.stale);

  return {
    total: results.length,
    stale: stale.length,
    fresh: fresh.length,
    staleCapsules: stale.map((r) => ({
      id: r.contextId,
      reason: r.reason,
      age_days: r.age_days,
    })),
    freshCapsules: fresh.map((r) => ({
      id: r.contextId,
      freshness: r.freshness,
      age_days: r.age_days,
    })),
    config,
  };
}
