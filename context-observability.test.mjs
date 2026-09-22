/**
 * Unit tests for context-telemetry.js (C03 — context-observability-v1).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  setWriter,
  recordDecision,
  computeBudgetBreakdown,
  parseLog,
  SCHEMA,
  _resetTelemetry,
} from "./context-telemetry.js";
import { ADMISSION } from "./context-router.js";
import { SUFFICIENCY_LEVEL, SUFFICIENCY_DECISIONS } from "./context-sufficiency-gate.js";

test.beforeEach(() => _resetTelemetry());

test("telemetry: write triggers writer with a serialized JSONL record", () => {
  const captured = [];
  setWriter((line) => captured.push(line));

  const record = recordDecision({
    taskId: "task-1",
    selected: [
      { id: "a", admission: ADMISSION.MANDATORY, tokenEstimate: 100 },
      { id: "b", admission: ADMISSION.CONDITIONAL, tokenEstimate: 50 },
    ],
    omitted: [{ id: "c", admission: ADMISSION.OPTIONAL, reason: "BUDGET" }],
    admitted: [
      { id: "a" }, { id: "b" }, { id: "c" },
    ],
    budget: { tokenBudget: 4000, tokensUsed: 150, tokensAvailable: 3850 },
    sufficiency: { level: SUFFICIENCY_LEVEL.SUFFICIENT, decision: SUFFICIENCY_DECISIONS.PROCEED },
  });

  assert.equal(captured.length, 1);
  assert.ok(captured[0].endsWith("\n"));
  const parsed = JSON.parse(captured[0]);
  assert.equal(parsed.schema, SCHEMA);
  assert.equal(parsed.taskId, "task-1");
  assert.equal(parsed.counts.selected, 2);
  assert.equal(parsed.counts.omitted, 1);
  assert.equal(parsed.counts.considered, 3);
  assert.equal(parsed.perNodeAdmission[0].tier, "MANDATORY");
  assert.equal(parsed.sufficiency.sufficient, true);
  assert.equal(parsed.sufficiency.decision, "PROCEED");
  assert.equal(parsed.budget.breakdown.MANDATORY.tokens, 100);
  assert.equal(parsed.budget.breakdown.MANDATORY.count, 1);
  assert.equal(parsed.budget.breakdown.CONDITIONAL.tokens, 50);
  assert.equal(parsed.budget.breakdown.OPTIONAL.count, 1);
  assert.equal(record.decisionId, parsed.decisionId);
});

test("telemetry: computeBudgetBreakdown tallies tokens by tier", () => {
  const breakdown = computeBudgetBreakdown(
    [
      { id: "a", admission: "MANDATORY", tokenEstimate: 200 },
      { id: "b", admission: "OPTIONAL", tokenEstimate: 80 },
    ],
    [{ id: "c", admission: "OPTIONAL", reason: "BUDGET" }],
    [{ id: "a" }, { id: "b" }, { id: "c" }],
  );
  assert.equal(breakdown.MANDATORY.tokens, 200);
  assert.equal(breakdown.MANDATORY.count, 1);
  assert.equal(breakdown.OPTIONAL.tokens, 80);
  assert.equal(breakdown.OPTIONAL.count, 2); // 1 selected + 1 omitted
  assert.equal(breakdown.CONDITIONAL.count, 0);
  assert.equal(breakdown.considered.total, 3);
});

test("telemetry: missing writer is a silent no-op (never throws)", () => {
  // No setWriter() -> internal _writer is null
  assert.doesNotThrow(() => recordDecision({
    taskId: "task-x",
    selected: [],
    omitted: [],
    admitted: [],
    budget: { tokenBudget: 100, tokensUsed: 0, tokensAvailable: 100 },
    sufficiency: { level: "INSUFFICIENT" },
  }));
});

test("telemetry: writer throwing does not crash selection", () => {
  setWriter(() => { throw new Error("disk full"); });
  assert.doesNotThrow(() => recordDecision({
    taskId: "task-y",
    selected: [{ id: "n", admission: "MANDATORY", tokenEstimate: 10 }],
    admitted: [{ id: "n" }],
    omitted: [],
    budget: { tokenBudget: 100, tokensUsed: 10, tokensAvailable: 90 },
    sufficiency: { level: "SUFFICIENT" },
  }));
});

test("telemetry: decisionId increments monotonically across calls", () => {
  let counter = 0;
  setWriter((line) => { counter += 1; });
  const r1 = recordDecision({ taskId: "t1", selected: [], admitted: [], omitted: [], budget: { tokenBudget: 0, tokensUsed: 0, tokensAvailable: 0 }, sufficiency: { level: "INSUFFICIENT" } });
  const r2 = recordDecision({ taskId: "t2", selected: [], admitted: [], omitted: [], budget: { tokenBudget: 0, tokensUsed: 0, tokensAvailable: 0 }, sufficiency: { level: "INSUFFICIENT" } });
  assert.notEqual(r1.decisionId, r2.decisionId);
  assert.equal(counter, 2);
});

test("telemetry: parseLog decodes JSONL into records", () => {
  const records = [
    recordDecision({ taskId: "p1", selected: [{ id: "x", admission: "MANDATORY", tokenEstimate: 1 }], admitted: [{ id: "x" }], omitted: [], budget: { tokenBudget: 1, tokensUsed: 1, tokensAvailable: 0 }, sufficiency: { level: "SUFFICIENT" } }),
    recordDecision({ taskId: "p2", selected: [], admitted: [{ id: "y" }], omitted: [{ id: "y", admission: "OPTIONAL", reason: "BUDGET" }], budget: { tokenBudget: 0, tokensUsed: 0, tokensAvailable: 0 }, sufficiency: { level: "INSUFFICIENT" } }),
  ];
  const text = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const parsed = parseLog(text);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].taskId, "p1");
  assert.equal(parsed[1].sufficiency.sufficient, false);
});

test("telemetry: parseLog skips malformed lines", () => {
  const parsed = parseLog("{not valid}\n" + JSON.stringify({ ok: true }) + "\n");
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].ok, true);
});
