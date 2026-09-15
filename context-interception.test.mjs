/**
 * Tests for context-interception.js (Change 75)
 * Ejecutar: node --test context-interception.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  interceptContext,
  requirementFilter,
  relevanceScore,
} from "./context-interception.js";

// -- Relevance Score --------------------------------------------------------

test("relevanceScore: returns 0.5 default for no keywords", () => {
  const score = relevanceScore({ content: "hello world", timestamp: Date.now() });
  assert.ok(score >= 0.4 && score <= 0.6, `score was ${score}`);
});

test("relevanceScore: boosts score on keyword match", () => {
  const item = { content: "authentication module JWT", timestamp: Date.now() };
  const score = relevanceScore(item, ["auth", "jwt"]);
  assert.ok(score > 0.7, `score was ${score}`);
});

test("relevanceScore: handles missing content", () => {
  const score = relevanceScore(null, ["foo"]);
  assert.equal(score, 0.5);
});

// -- interceptContext -------------------------------------------------------

test("interceptContext: returns empty for empty input", () => {
  const result = interceptContext([]);
  assert.equal(result.length, 0);
});

test("interceptContext: throws on non-array input", () => {
  assert.throws(() => interceptContext(null), TypeError);
  assert.throws(() => interceptContext("string"), TypeError);
  assert.throws(() => interceptContext(42), TypeError);
});

test("interceptContext: deduplicates by id", () => {
  const raw = [
    { id: "a", content: "test", type: "observation", timestamp: 1000, scope: "session" },
    { id: "a", content: "duplicate", type: "decision", timestamp: 2000, scope: "task" },
    { id: "b", content: "unique", type: "observation", timestamp: 3000, scope: "session" },
  ];
  const result = interceptContext(raw);
  assert.equal(result.length, 2);
  // After dedup, sorting by timestamp desc puts "b" (3000) before "a" (1000)
  assert.ok(result.some((i) => i.id === "a"));
  assert.ok(result.some((i) => i.id === "b"));
  assert.ok(!result.some((i) => result.filter((r) => r.id === "a").length > 1));
});

test("interceptContext: deduplicate=false keeps all", () => {
  const raw = [
    { id: "a", content: "1", type: "observation", timestamp: 1000, scope: "session" },
    { id: "a", content: "2", type: "observation", timestamp: 2000, scope: "session" },
  ];
  const result = interceptContext(raw, { deduplicate: false });
  assert.equal(result.length, 2);
});

test("interceptContext: filters by allowedTypes", () => {
  const raw = [
    { id: "1", content: "auth", type: "observation", timestamp: 1000, scope: "session", relevanceScore: 0.5 },
    { id: "2", content: "decision", type: "decision", timestamp: 2000, scope: "session", relevanceScore: 0.5 },
    { id: "3", content: "evidence", type: "evidence", timestamp: 3000, scope: "session", relevanceScore: 0.5 },
  ];
  const result = interceptContext(raw, { allowedTypes: ["observation", "evidence"] });
  assert.equal(result.length, 2);
  assert.ok(result.every((i) => i.type === "observation" || i.type === "evidence"));
});

test("interceptContext: filters by allowedScopes", () => {
  const raw = [
    { id: "1", content: "global", type: "observation", timestamp: 1000, scope: "GLOBAL", relevanceScore: 0.5 },
    { id: "2", content: "task", type: "observation", timestamp: 2000, scope: "TASK", relevanceScore: 0.5 },
    { id: "3", content: "task2", type: "observation", timestamp: 3000, scope: "TASK", relevanceScore: 0.5 },
  ];
  const result = interceptContext(raw, { allowedScopes: ["TASK"] });
  assert.equal(result.length, 2);
});

test("interceptContext: filters by minRelevance", () => {
  // Use keywords to influence computed relevance scores
  // "alpha" is in item 1 content, so item 1 gets high score
  // Items 2 and 3 don't match, so they get ~0.5 base score
  const raw = [
    { id: "1", content: "alpha test", type: "observation", timestamp: 1000, scope: "session" },
    { id: "2", content: "beta test", type: "observation", timestamp: 2000, scope: "session" },
    { id: "3", content: "gamma test", type: "observation", timestamp: 3000, scope: "session" },
  ];
  // minRelevance=0.75: only item matching keyword passes
  const result = interceptContext(raw, { keywords: ["alpha"], minRelevance: 0.75, maxItems: 100 });
  assert.ok(result.length <= 1);
  if (result.length > 0) {
    assert.equal(result[0].id, "1");
  }
});

test("interceptContext: respects maxItems cap", () => {
  const raw = [
    { id: "1", content: "1", type: "observation", timestamp: 1000, scope: "session" },
    { id: "2", content: "2", type: "observation", timestamp: 2000, scope: "session" },
    { id: "3", content: "3", type: "observation", timestamp: 3000, scope: "session" },
  ];
  const result = interceptContext(raw, { maxItems: 2 });
  assert.equal(result.length, 2);
});

test("interceptContext: applies custom predicate", () => {
  const raw = [
    { id: "1", content: "auth module", type: "observation", timestamp: 1000, scope: "session" },
    { id: "2", content: "payment system", type: "observation", timestamp: 2000, scope: "session" },
    { id: "3", content: "auth test", type: "observation", timestamp: 3000, scope: "session" },
  ];
  const result = interceptContext(raw, {
    predicate: (item) => String(item.content).includes("auth"),
  });
  assert.equal(result.length, 2);
  assert.ok(result.every((i) => String(i.content).includes("auth")));
});

test("interceptContext: sorts by priorityTypes then relevance", () => {
  const raw = [
    { id: "1", content: "decision", type: "decision", timestamp: 1000, scope: "session" },
    { id: "2", content: "observation", type: "observation", timestamp: 2000, scope: "session" },
    { id: "3", content: "also decision", type: "decision", timestamp: 3000, scope: "session" },
  ];
  const result = interceptContext(raw, { priorityTypes: ["decision"] });
  assert.equal(result.length, 3);
  // Both decisions first (sorted by timestamp desc), then observation
  assert.equal(result[0].type, "decision");
  assert.equal(result[1].type, "decision");
  assert.equal(result[2].type, "observation");
});

test("interceptContext: skips items without id", () => {
  const raw = [
    { content: "no id", type: "observation", timestamp: 1000, scope: "session" },
    { id: "1", content: "has id", type: "observation", timestamp: 2000, scope: "session" },
  ];
  const result = interceptContext(raw);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "1");
});

test("interceptContext: returns items with relevanceScore field", () => {
  const raw = [
    { id: "1", content: "test keyword match here", type: "observation", timestamp: Date.now(), scope: "session" },
  ];
  const result = interceptContext(raw, { keywords: ["keyword"], maxItems: 10 });
  assert.equal(result.length, 1);
  assert.ok(typeof result[0].relevanceScore === "number");
});

// -- requirementFilter -------------------------------------------------------

test("requirementFilter: creates valid filter options", () => {
  const opts = requirementFilter(["req-1", "req-2"]);
  assert.ok(typeof opts.predicate === "function");
  const item = { id: "x", relatedRequirements: ["req-1"] };
  assert.ok(opts.predicate(item));
  const item2 = { id: "y", relatedRequirements: ["req-3"] };
  assert.ok(!opts.predicate(item2));
});

test("requirementFilter: handles no relatedRequirements", () => {
  const opts = requirementFilter(["req-1"]);
  const item = { id: "x", relatedRequirements: [] };
  assert.ok(!opts.predicate(item));
  const item2 = { id: "x" };
  assert.ok(!opts.predicate(item2));
});
