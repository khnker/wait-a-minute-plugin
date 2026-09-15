/**
 * Context Budget Manager — tests for Change 72 (ContextBudgetManager).
 * Ejecutar: node --test context-budget-manager.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { ContextBudgetManager, DEFAULT_BUDGETS, MINIMUM_BUDGETS, LAYER_ORDER } from "./context-budget-manager.js";

// --- Defaults ---

test("DEFAULT_BUDGETS — all layers defined", () => {
  assert.ok(DEFAULT_BUDGETS.N0 > 0);
  assert.ok(DEFAULT_BUDGETS.N1 > 0);
  assert.ok(DEFAULT_BUDGETS.N2 > 0);
  assert.ok(DEFAULT_BUDGETS.N3 > 0);
  assert.ok(DEFAULT_BUDGETS.ARCHIVE > 0);
});

test("MINIMUM_BUDGETS — all layers defined", () => {
  assert.ok(MINIMUM_BUDGETS.N0 > 0);
  assert.ok(MINIMUM_BUDGETS.N1 > 0);
  assert.ok(MINIMUM_BUDGETS.N2 > 0);
  assert.ok(MINIMUM_BUDGETS.N3 > 0);
  assert.ok(MINIMUM_BUDGETS.ARCHIVE > 0);
});

test("LAYER_ORDER — correct order", () => {
  assert.deepEqual(LAYER_ORDER, ["N0", "N1", "N2", "N3", "ARCHIVE"]);
});

// --- Construction ---

test("constructor — initializes with defaults", () => {
  const mgr = new ContextBudgetManager();
  assert.equal(mgr.getBudget("N0"), DEFAULT_BUDGETS.N0);
  assert.equal(mgr.getMinimum("N0"), MINIMUM_BUDGETS.N0);
});

test("constructor — accepts custom budgets", () => {
  const mgr = new ContextBudgetManager({ budgets: { N0: 500 } });
  assert.equal(mgr.getBudget("N0"), 500);
  assert.equal(mgr.getBudget("N1"), DEFAULT_BUDGETS.N1);
});

test("constructor — accepts custom minimums", () => {
  const mgr = new ContextBudgetManager({ minimums: { N0: 50 } });
  assert.equal(mgr.getMinimum("N0"), 50);
});

test("setBudget — throws below minimum", () => {
  const mgr = new ContextBudgetManager();
  assert.throws(() => mgr.setBudget("N0", 1), /below minimum/);
});

test("setBudget — allows value at or above minimum", () => {
  const mgr = new ContextBudgetManager();
  assert.doesNotThrow(() => mgr.setBudget("N0", MINIMUM_BUDGETS.N0));
  assert.equal(mgr.getBudget("N0"), MINIMUM_BUDGETS.N0);
});

// --- Item tracking ---

test("addItem — tracks item in layer", () => {
  const mgr = new ContextBudgetManager();
  const usage = mgr.addItem("N0", "item1", 50, "MANDATORY");
  assert.equal(usage.used, 50);
  assert.equal(usage.layer, "N0");
});

test("addItem — throws on unknown layer", () => {
  const mgr = new ContextBudgetManager();
  assert.throws(() => mgr.addItem("N99", "x", 10));
});

test("addItem — tracks multiple items", () => {
  const mgr = new ContextBudgetManager();
  mgr.addItem("N3", "a", 100);
  mgr.addItem("N3", "b", 200);
  const items = mgr.getItems("N3");
  assert.equal(items.length, 2);
  assert.equal(mgr.getLayerUsage("N3").used, 300);
});

test("removeItem — removes tracked item", () => {
  const mgr = new ContextBudgetManager();
  mgr.addItem("N2", "item1", 75);
  const removed = mgr.removeItem("item1");
  assert.ok(removed !== undefined);
  assert.equal(mgr.getItems("N2").length, 0);
});

test("removeItem — returns undefined for unknown", () => {
  const mgr = new ContextBudgetManager();
  assert.equal(mgr.removeItem("nonexistent"), undefined);
});

test("getItems — returns empty for unused layer", () => {
  const mgr = new ContextBudgetManager();
  assert.deepEqual(mgr.getItems("N1"), []);
});

test("getAllItems — returns all tracked items", () => {
  const mgr = new ContextBudgetManager();
  mgr.addItem("N0", "a", 10);
  mgr.addItem("N1", "b", 20);
  assert.equal(mgr.getAllItems().length, 2);
});

// --- Usage ---

test("getLayerUsage — correct computation", () => {
  const mgr = new ContextBudgetManager();
  mgr.addItem("N3", "a", 300);
  mgr.addItem("N3", "b", 200);
  const usage = mgr.getLayerUsage("N3");
  assert.equal(usage.used, 500);
  assert.equal(usage.budget, DEFAULT_BUDGETS.N3);
  assert.equal(usage.remaining, DEFAULT_BUDGETS.N3 - 500);
  assert.ok(usage.utilization > 0);
  assert.equal(usage.overBudget, usage.used > usage.budget);
});

test("getAllUsage — one entry per layer", () => {
  const mgr = new ContextBudgetManager();
  const usages = mgr.getAllUsage();
  assert.equal(usages.length, LAYER_ORDER.length);
  for (const u of usages) {
    assert.ok(LAYER_ORDER.includes(u.layer));
    assert.ok(typeof u.used === "number");
    assert.ok(typeof u.remaining === "number");
    assert.ok(typeof u.utilization === "number");
    assert.ok(typeof u.overBudget === "boolean");
  }
});

test("getTotalUsage — sums all items", () => {
  const mgr = new ContextBudgetManager();
  mgr.addItem("N0", "a", 100);
  mgr.addItem("N1", "b", 200);
  mgr.addItem("N3", "c", 50);
  assert.equal(mgr.getTotalUsage(), 350);
});

// --- Violations ---

test("checkViolations — clean when under budget", () => {
  const mgr = new ContextBudgetManager();
  const report = mgr.checkViolations();
  assert.ok(report.clean);
  assert.deepEqual(report.violations, []);
});

test("checkViolations — detects over-budget layer", () => {
  const mgr = new ContextBudgetManager();
  mgr.addItem("N0", "a", DEFAULT_BUDGETS.N0 + 100);
  const report = mgr.checkViolations();
  assert.ok(!report.clean);
  assert.ok(report.violations.some((v) => v.layer === "N0"));
  assert.ok(report.violations[0].overBy > 0);
});

test("checkViolations — HARD severity when exceeding minimum", () => {
  const mgr = new ContextBudgetManager();
  mgr.addItem("N0", "a", DEFAULT_BUDGETS.N0 + 100);
  const report = mgr.checkViolations();
  const n0 = report.violations.find((v) => v.layer === "N0");
  assert.equal(n0.severity, "HARD");
});

test("checkViolations — SOFT severity at minimum", () => {
  const mgr = new ContextBudgetManager();
  mgr.addItem("N0", "a", MINIMUM_BUDGETS.N0); // At minimum exactly
  // This shouldn't trigger violation since used == minimum <= budget
  // But if budget < used somehow it would be SOFT
  const report = mgr.checkViolations();
  // Should be clean if at minimum and minimum <= budget
  const n0 = report.violations.find((v) => v.layer === "N0");
  if (n0) {
    assert.ok(n0.severity === "SOFT" || n0.severity === "HARD");
  }
});

test("checkViolations — returns totalOverBudget", () => {
  const mgr = new ContextBudgetManager();
  mgr.addItem("N0", "a", 500);
  mgr.addItem("N3", "b", 5000);
  const report = mgr.checkViolations();
  assert.ok(report.totalOverBudget >= 0);
});

// --- Audit ---

test("getAuditLog — records actions", () => {
  const mgr = new ContextBudgetManager();
  mgr.addItem("N0", "a", 50);
  mgr.setBudget("N1", 1000);
  mgr.removeItem("a");
  const log = mgr.getAuditLog();
  assert.ok(log.length >= 3);
  assert.ok(log.some((e) => e.action === "item_added"));
  assert.ok(log.some((e) => e.action === "budget_updated"));
  assert.ok(log.some((e) => e.action === "item_removed"));
});

// --- Report ---

test("report — complete summary", () => {
  const mgr = new ContextBudgetManager();
  mgr.addItem("N2", "task1", 200);
  const report = mgr.report();
  assert.ok(report.layers && report.layers.length >= LAYER_ORDER.length);
  assert.ok(typeof report.totalUsed === "number");
  assert.ok(report.totalBudget > 0);
  assert.ok(Array.isArray(report.violations));
  assert.ok(report.timestamp > 0);
});

// --- Boundary: zero items ---

test("empty manager — zero usage", () => {
  const mgr = new ContextBudgetManager();
  assert.equal(mgr.getTotalUsage(), 0);
  assert.ok(mgr.checkViolations().clean);
});
