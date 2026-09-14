/**
 * Capsule Staleness Detection tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  freshness,
  checkStaleness,
  estimateMSL,
  scanForStale,
  autoMarkStale,
  getStalenessReport,
  DEFAULT_CONFIG,
} from "./capsule-staleness.js";

describe("freshness", () => {
  it("returns 1.0 for just-updated capsule", () => {
    const capsule = {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    assert.equal(freshness(capsule), 1.0);
  });

  it("decays linearly over 30 days", () => {
    const now = Date.now();
    const capsule = {
      created_at: new Date(now - 15 * 86400000).toISOString(),
      updated_at: new Date(now - 15 * 86400000).toISOString(),
    };
    const f = freshness(capsule, now);
    assert.ok(f > 0.4 && f < 0.6, `Expected ~0.5, got ${f}`);
  });

  it("never drops below 0.1", () => {
    const capsule = {
      created_at: new Date(Date.now() - 365 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 365 * 86400000).toISOString(),
    };
    assert.equal(freshness(capsule), 0.1);
  });
});

describe("checkStaleness", () => {
  it("returns fresh for new capsule", () => {
    const capsule = {
      context_id: "cap-1",
      lifecycle: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const result = checkStaleness(capsule);
    assert.equal(result.stale, false);
    assert.equal(result.reason, "fresh");
  });

  it("returns stale for TTL exceeded", () => {
    const capsule = {
      context_id: "cap-2",
      lifecycle: "active",
      created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    const result = checkStaleness(capsule, DEFAULT_CONFIG);
    assert.equal(result.stale, true);
    assert.ok(result.reason.includes("ttl_exceeded"));
  });

  it("returns stale for MSL exceeded", () => {
    const capsule = {
      context_id: "cap-3",
      lifecycle: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date(Date.now() - 48 * 3600000).toISOString(),
    };
    const result = checkStaleness(capsule, DEFAULT_CONFIG);
    assert.equal(result.stale, true);
    assert.ok(result.reason.includes("msl_exceeded"));
  });

  it("returns stale for already stale capsule", () => {
    const capsule = {
      context_id: "cap-4",
      lifecycle: "stale",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const result = checkStaleness(capsule);
    assert.equal(result.stale, true);
    assert.equal(result.reason, "already_stale");
  });

  it("respects custom TTL", () => {
    const capsule = {
      context_id: "cap-5",
      lifecycle: "active",
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    const result = checkStaleness(capsule, { ...DEFAULT_CONFIG, ttl_days: 3 });
    assert.equal(result.stale, true);
  });

  it("returns age_days", () => {
    const capsule = {
      context_id: "cap-6",
      lifecycle: "active",
      created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    const result = checkStaleness(capsule);
    assert.ok(result.age_days >= 9 && result.age_days <= 11);
  });
});

describe("DEFAULT_CONFIG", () => {
  it("has reasonable defaults", () => {
    assert.equal(DEFAULT_CONFIG.ttl_days, 30);
    assert.equal(DEFAULT_CONFIG.msl_hours, 24);
    assert.equal(DEFAULT_CONFIG.auto_stale, true);
  });
});
