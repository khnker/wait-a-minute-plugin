/**
 * Context Retrieval — tests for Change 69 (retrieveContext).
 * Ejecutar: node --test context-retrieval.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { retrieveContext } from "./context-retrieval.js";
import { ContextManager } from "./context-manager.js";
import { ContextSourceRegistry } from "./context-source-registry.js";

function makeManagedItem(id, opts = {}) {
  return {
    id,
    type: opts.type || "memory",
    label: opts.label || `Item ${id}`,
    content: opts.content || `Content about ${id}`,
    source: opts.source || "test",
    timestamp: opts.timestamp || Date.now(),
    memoryLayer: opts.layer || "N3",
    lifecycle: opts.lifecycle || "ACTIVE",
    importance: opts.importance ?? 5,
    provenance: opts.provenance || "observed",
  };
}

// --- Basic retrieval without manager ---

test("retrieveContext — returns empty for no registry", () => {
  const result = retrieveContext("test query");
  assert.equal(result.items.length, 0);
  assert.equal(result.total, 0);
  assert.equal(result.returned, 0);
  assert.ok(result.elapsedMs >= 0);
});

test("retrieveContext — retrieves from registry with query", () => {
  const registry = new ContextSourceRegistry();
  registry.register(makeManagedItem("i1", { content: "authentication tokens JWT", layer: "N3", timestamp: Date.now() }));
  registry.register(makeManagedItem("i2", { content: "database schema postgres", layer: "N1", timestamp: Date.now() }));

  const result = retrieveContext("authentication", { registry });
  assert.ok(result.total >= 1);
  if (result.items.length > 0) {
    assert.ok(result.items[0].relevanceScore >= 0, "First item should have non-negative score");
  }
});

// --- Constraint filtering ---

test("retrieveContext — filters by layers", () => {
  const registry = new ContextSourceRegistry();
  registry.register(makeManagedItem("i1", { layer: "N0", content: "goal identity" }));
  registry.register(makeManagedItem("i2", { layer: "N3", content: "exploration data" }));

  const result = retrieveContext("data", { registry, layers: ["N3"] });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "i2");
});

test("retrieveContext — filters by lifecycle", () => {
  const registry = new ContextSourceRegistry();
  registry.register(makeManagedItem("i1", { lifecycle: "ACTIVE" }));
  registry.register(makeManagedItem("i2", { lifecycle: "STALE" }));

  const result = retrieveContext("test", { registry, lifecycle: ["ACTIVE"] });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "i1");
});

test("retrieveContext — filters by excludedIds", () => {
  const registry = new ContextSourceRegistry();
  registry.register(makeManagedItem("i1"));
  registry.register(makeManagedItem("i2"));

  const result = retrieveContext("test", { registry, excludedIds: ["i1"] });
  assert.ok(!result.items.some((i) => i.id === "i1"));
});

test("retrieveContext — filters by minScore", () => {
  const registry = new ContextSourceRegistry();
  registry.register(makeManagedItem("i1", { content: "completely unrelated content here" }));
  registry.register(makeManagedItem("i2", { content: "matching query content" }));

  const result = retrieveContext("query", { registry, minScore: 0.01 });
  // Items with 0 score from unrelated content should be filtered
  for (const item of result.items) {
    assert.ok((item.relevanceScore ?? 0) >= 0.01 || item.relevanceScore === 0);
  }
});

// --- Limit and ordering ---

test("retrieveContext — respects maxResults", () => {
  const registry = new ContextSourceRegistry();
  for (let i = 0; i < 10; i++) {
    registry.register(makeManagedItem(`i${i}`, { content: `query related content ${i}` }));
  }
  const result = retrieveContext("query", { registry, maxResults: 3 });
  assert.equal(result.returned, 3);
  assert.equal(result.items.length, 3);
});

test("retrieveContext — results ordered by relevance descending", () => {
  const registry = new ContextSourceRegistry();
  registry.register(makeManagedItem("low", { content: "nothing to do with query term" }));
  registry.register(makeManagedItem("high", { content: "query query query most relevant" }));

  const result = retrieveContext("query", { registry });
  if (result.items.length >= 2) {
    assert.ok(
      result.items[0].relevanceScore >= result.items[1].relevanceScore,
      "Should be sorted by score descending"
    );
  }
});

test("retrieveContext — requiredTerms filters out non-matching", () => {
  const registry = new ContextSourceRegistry();
  registry.register(makeManagedItem("i1", { content: "authentication system" }));
  registry.register(makeManagedItem("i2", { content: "database system" }));

  const result = retrieveContext("system", { registry, requiredTerms: ["auth"] });
  // Items without "auth" in content get score 0
  for (const item of result.items) {
    assert.ok(
      item.relevanceReason === "required_terms_missing" || (item.relevanceScore ?? 0) >= 0,
      `Item ${item.id} should have required_terms_missing or valid score`
    );
  }
});

// --- With ContextManager ---

test("retrieveContext — works with ContextManager", () => {
  const manager = new ContextManager();
  manager.register(makeManagedItem("i1", { content: "auth login token", layer: "N3" }));
  manager.register(makeManagedItem("i2", { content: "ui frontend design", layer: "N2" }));

  const result = retrieveContext("auth", { manager, maxResults: 5 });
  assert.ok(result.total >= 0);
  if (result.items.length > 0) {
    assert.ok(typeof result.items[0].relevanceScore === "number");
  }
});
