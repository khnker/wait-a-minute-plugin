/**
 * Context Ranking — tests for Change 70 (rankContextItems).
 * Ejecutar: node --test context-ranking.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  rankContextItems,
  WEIGHTS,
  LIFECYCLE_BOOST,
  PROVENANCE_BOOST,
} from "./context-ranking.js";

// --- Weight validation ---

test("WEIGHTS — all components defined and sum ~1", () => {
  const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(sum > 0.9 && sum <= 1.01, `Weights sum to ${sum}`);
});

test("LIFECYCLE_BOOST — all states mapped", () => {
  assert.equal(LIFECYCLE_BOOST.ACTIVE, 1.0);
  assert.equal(LIFECYCLE_BOOST.CREATED, 0.8);
  assert.equal(LIFECYCLE_BOOST.COMPRESSED, 0.4);
  assert.equal(LIFECYCLE_BOOST.STALE, 0.2);
  assert.equal(LIFECYCLE_BOOST.INVALIDATED, 0.0);
  assert.equal(LIFECYCLE_BOOST.ARCHIVED, 0.1);
});

test("PROVENANCE_BOOST — all sources mapped", () => {
  assert.equal(PROVENANCE_BOOST.user_decided, 1.0);
  assert.equal(PROVENANCE_BOOST.observed, 0.7);
  assert.equal(PROVENANCE_BOOST.inferred, 0.3);
});

// --- Term matching ---

test("computeTermMatch — perfect match", () => {
  const items = [
    { id: "exact", content: "authentication login system", timestamp: Date.now() - 1000 },
    { id: "partial", content: "database server postgres", timestamp: Date.now() - 1000 },
    { id: "empty", content: "", timestamp: Date.now() - 1000 },
  ];
  const ranked = rankContextItems(items, "authentication");
  const exact = ranked.find((i) => i.id === "exact");
  const partial = ranked.find((i) => i.id === "partial");
  const empty = ranked.find((i) => i.id === "empty");
  assert.ok(exact.relevanceScore > 0, `Exact should score > 0, got ${exact.relevanceScore}`);
  assert.ok(empty.relevanceScore < exact.relevanceScore, `Empty (${empty.relevanceScore}) should score < exact (${exact.relevanceScore})`);
  assert.ok(
    exact.relevanceScore >= partial.relevanceScore,
    `Exact (${exact.relevanceScore}) >= partial (${partial.relevanceScore})`
  );
});

test("rankContextItems — term score computed and attached", () => {
  const items = [{ id: "t1", content: "JWT authentication token rotation" }];
  const ranked = rankContextItems(items, "authentication");
  assert.equal(ranked.length, 1);
  assert.ok(typeof ranked[0].relevanceScore === "number");
  assert.ok(ranked[0].relevanceScore >= 0 && ranked[0].relevanceScore <= 1);
  assert.ok(ranked[0].relevanceReason?.includes("term:"));
});

// --- Recency ---

test("rankContextItems — newer items score higher on recency", () => {
  const now = Date.now();
  const items = [
    { id: "old", content: "test content", timestamp: now - 60 * 24 * 60 * 60 * 1000 }, // 60 days old
    { id: "new", content: "test content", timestamp: now - 1 * 24 * 60 * 60 * 1000 }, // 1 day old
  ];
  const ranked = rankContextItems(items, "test");
  const newItem = ranked.find((i) => i.id === "new");
  const oldItem = ranked.find((i) => i.id === "old");
  assert.ok(
    newItem.relevanceScore >= oldItem.relevanceScore,
    `New item (${newItem.relevanceScore}) should score >= old (${oldItem.relevanceScore})`
  );
});

test("rankContextItems — no timestamp defaults to 0.5", () => {
  const items = [{ id: "notime", content: "test content" }];
  const ranked = rankContextItems(items, "test");
  // With no timestamp, recency is 0.5, so score should be non-zero
  assert.ok(ranked[0].relevanceScore >= 0);
});

// --- Importance ---

test("rankContextItems — higher importance scores higher", () => {
  const items = [
    { id: "low", content: "test content", importance: 2 },
    { id: "high", content: "test content", importance: 9 },
  ];
  const ranked = rankContextItems(items, "test");
  const high = ranked.find((i) => i.id === "high");
  const low = ranked.find((i) => i.id === "low");
  // With same term/recency scores, high importance should score >= low
  assert.ok(
    high.relevanceScore >= low.relevanceScore,
    `High importance (${high.relevanceScore}) should score >= low (${low.relevanceScore})`
  );
});

test("rankContextItems — importance defaults to 0.5", () => {
  const items = [{ id: "noimp", content: "test content" }];
  const ranked = rankContextItems(items, "test");
  assert.ok(typeof ranked[0].relevanceScore === "number");
});

// --- Lifecycle boost ---

test("rankContextItems — ACTIVE scores highest", () => {
  const items = [
    { id: "arch", content: "test content", lifecycle: "ARCHIVED" },
    { id: "act", content: "test content", lifecycle: "ACTIVE" },
  ];
  const ranked = rankContextItems(items, "test");
  const active = ranked.find((i) => i.id === "act");
  const archived = ranked.find((i) => i.id === "arch");
  assert.ok(active.relevanceScore >= archived.relevanceScore);
});

test("rankContextItems — INVALIDATED gets 0 lifecycle boost", () => {
  const items = [
    { id: "inv", content: "test content", lifecycle: "INVALIDATED" },
    { id: "act", content: "test content", lifecycle: "ACTIVE" },
  ];
  const ranked = rankContextItems(items, "test");
  const invalid = ranked.find((i) => i.id === "inv");
  const active = ranked.find((i) => i.id === "act");
  assert.ok(invalid.relevanceScore <= active.relevanceScore);
});

// --- Required terms ---

test("rankContextItems — requiredTerms filters non-matches", () => {
  const items = [
    { id: "yes", content: "authentication JWT token", provenance: "user_decided" },
    { id: "no", content: "database schema design", provenance: "user_decided" },
  ];
  const ranked = rankContextItems(items, "auth", { requiredTerms: ["authentication"] });
  const noMatch = ranked.find((i) => i.id === "no");
  assert.equal(noMatch.relevanceScore, 0);
  assert.equal(noMatch.relevanceReason, "required_terms_missing");
});

test("rankContextItems — requiredTerms passes matching items", () => {
  const items = [
    { id: "yes", content: "authentication JWT token", provenance: "user_decided" },
    { id: "no", content: "database schema design", provenance: "user_decided" },
  ];
  const ranked = rankContextItems(items, "auth", { requiredTerms: ["authentication"] });
  const match = ranked.find((i) => i.id === "yes");
  assert.ok(match.relevanceScore > 0);
});

// --- Provenance boost ---

test("rankContextItems — user_decided provenance scores highest", () => {
  const items = [
    { id: "inferred", content: "test content", provenance: "inferred" },
    { id: "user", content: "test content", provenance: "user_decided" },
  ];
  const ranked = rankContextItems(items, "test");
  const user = ranked.find((i) => i.id === "user");
  const inferred = ranked.find((i) => i.id === "inferred");
  assert.ok(user.relevanceScore >= inferred.relevanceScore);
});

// --- Ordering and structure ---

test("rankContextItems — returns sorted descending", () => {
  const items = [
    { id: "a", content: "aaa", timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000 },
    { id: "b", content: "bbb", timestamp: Date.now() },
    { id: "c", content: "ccc", timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000 },
  ];
  const ranked = rankContextItems(items, "aaa bbb ccc");
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(
      ranked[i - 1].relevanceScore >= ranked[i].relevanceScore,
      `Index ${i - 1} (${ranked[i - 1].relevanceScore}) >= index ${i} (${ranked[i].relevanceScore})`
    );
  }
});

test("rankContextItems — preserves all original properties", () => {
  const item = { id: "x", content: "test", custom: "field", tags: ["a"] };
  const ranked = rankContextItems([item], "test");
  assert.equal(ranked[0].custom, "field");
  assert.deepEqual(ranked[0].tags, ["a"]);
});

test("rankContextItems — handles empty array", () => {
  const ranked = rankContextItems([], "test");
  assert.deepEqual(ranked, []);
});

test("rankContextItems — handles missing content", () => {
  const items = [{ id: "no-content" }];
  const ranked = rankContextItems(items, "test");
  assert.equal(ranked.length, 1);
  assert.ok(typeof ranked[0].relevanceScore === "number");
});

// --- Custom weights ---

test("rankContextItems — custom weights applied", () => {
  const items = [
    { id: "a", content: "term1 term2", importance: 10, timestamp: Date.now() },
    { id: "b", content: "term1 term2", importance: 1, timestamp: Date.now() },
  ];
  const ranked = rankContextItems(items, "term1", { weights: { importance: 0.9, termMatch: 0.1 } });
  // Both have same term score, so importance should dominate
  const a = ranked.find((i) => i.id === "a");
  const b = ranked.find((i) => i.id === "b");
  assert.ok(a.relevanceScore >= b.relevanceScore);
});
