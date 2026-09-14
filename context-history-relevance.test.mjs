import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  getHistoricalCandidates,
  selectHistoricalContext,
  getRelevanceRankingExplanation,
} from "./context-history-relevance.js";
import { startRun, closeRun, addObservation, addDecision, addEvidence } from "./task-runs.js";
import { persistTaskState } from "./engine.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wam-history-rel-test-"));
let taskCounter = 0;

function makeTaskId() {
  return `hist-task-${++taskCounter}`;
}

function makeTaskState(overrides = {}) {
  return {
    phase: "IMPLEMENTING",
    lastAction: "Test historical relevance",
    contract: { objective: "Build authentication system" },
    requirements: [
      { id: "req-1", title: "Add JWT support", status: "pending", evidence: [] },
      { id: "req-2", title: "Add OAuth", status: "done", evidence: [] },
    ],
    runs: [],
    ...overrides,
  };
}

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("getHistoricalCandidates", () => {
  it("returns empty for task with no runs", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const candidates = getHistoricalCandidates(taskId, TMP);
    assert.equal(candidates.length, 0);
  });

  it("includes observations from runs", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addObservation(taskId, run.id, "Found bug in JWT validation", TMP);

    const candidates = getHistoricalCandidates(taskId, TMP);
    assert.ok(candidates.some((c) => c.type === "observation"));
  });

  it("includes decisions from runs", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addDecision(taskId, run.id, "Use RS256 for JWT", TMP);

    const candidates = getHistoricalCandidates(taskId, TMP);
    assert.ok(candidates.some((c) => c.type === "decision"));
  });

  it("includes evidence from runs", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addEvidence(taskId, run.id, "All tests pass", TMP);

    const candidates = getHistoricalCandidates(taskId, TMP);
    assert.ok(candidates.some((c) => c.type === "evidence"));
  });

  it("includes previous failures", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    closeRun(taskId, r1.id, "failed", "Auth timeout", TMP);

    const candidates = getHistoricalCandidates(taskId, TMP);
    assert.ok(candidates.some((c) => c.type === "failure"));
  });

  it("includes unresolved requirements", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState({ contract: { objective: "Implement JWT auth" } }), TMP);

    const candidates = getHistoricalCandidates(taskId, TMP);
    assert.ok(candidates.some((c) => c.type === "requirement" && c.status === "unresolved"));
  });

  it("ranks by relevance score", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addObservation(taskId, run.id, "JWT authentication working perfectly", TMP);
    addObservation(taskId, run.id, "Random unrelated observation", TMP);

    const candidates = getHistoricalCandidates(taskId, TMP);
    const obsCandidates = candidates.filter((c) => c.type === "observation");
    assert.ok(obsCandidates[0].relevanceScore >= obsCandidates[1].relevanceScore);
  });

  it("preserves status from run outcome", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    addObservation(taskId, r1.id, "Obs from active run", TMP);
    closeRun(taskId, r1.id, "completed", "Done", TMP);

    const candidates = getHistoricalCandidates(taskId, TMP);
    const obs = candidates.find((c) => c.content.includes("Obs from active run"));
    assert.equal(obs.status, "historical");
  });

  it("marks active run status as current", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addObservation(taskId, run.id, "Active observation", TMP);

    const candidates = getHistoricalCandidates(taskId, TMP);
    const obs = candidates.find((c) => c.content.includes("Active observation"));
    assert.equal(obs.status, "current");
  });
});

describe("selectHistoricalContext", () => {
  it("respects token budget", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addObservation(taskId, run.id, "Short obs", TMP);
    addObservation(taskId, run.id, "Another short observation", TMP);
    addObservation(taskId, run.id, "Yet another observation that is quite long and detailed", TMP);

    const result = selectHistoricalContext(taskId, TMP, null, 50);
    assert.ok(result.totalTokens <= 50);
  });

  it("returns empty when no candidates", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const result = selectHistoricalContext(taskId, TMP, null, 1000);
    assert.equal(result.candidates.length, 0);
    assert.equal(result.totalTokens, 0);
  });

  it("tracks status of selected candidates", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const r1 = startRun(taskId, TMP);
    addObservation(taskId, r1.id, "Historical obs", TMP);
    closeRun(taskId, r1.id, "completed", null, TMP);
    const r2 = startRun(taskId, TMP);
    addObservation(taskId, r2.id, "Current obs", TMP);

    const result = selectHistoricalContext(taskId, TMP, null, 1000);
    assert.equal(result.includesCurrent, true);
    assert.equal(result.includesHistorical, true);
  });
});

describe("getRelevanceRankingExplanation", () => {
  it("returns ranked explanations", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addObservation(taskId, run.id, "JWT auth implemented", TMP);
    addObservation(taskId, run.id, "Random observation", TMP);

    const candidates = getHistoricalCandidates(taskId, TMP);
    const explanation = getRelevanceRankingExplanation(candidates, 2);

    assert.equal(explanation.length, 2);
    assert.ok(explanation[0].relevanceScore >= explanation[1].relevanceScore);
    assert.ok(explanation[0].reason);
  });
});

describe("keyword overlap scoring", () => {
  it("scores higher when keywords match task content", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState({ contract: { objective: "Build JWT authentication" } }), TMP);
    const run = startRun(taskId, TMP);
    addObservation(taskId, run.id, "JWT token validation complete", TMP);
    addObservation(taskId, run.id, "The weather is nice today", TMP);

    const candidates = getHistoricalCandidates(taskId, TMP);
    const jwtObs = candidates.find((c) => c.content.includes("JWT"));
    const weatherObs = candidates.find((c) => c.content.includes("weather"));

    assert.ok(jwtObs.relevanceScore > weatherObs.relevanceScore);
  });
});

describe("relevance reasons", () => {
  it("explains why candidate was selected", () => {
    const taskId = makeTaskId();
    persistTaskState(taskId, makeTaskState(), TMP);
    const run = startRun(taskId, TMP);
    addObservation(taskId, run.id, "Fixed auth bug", TMP);

    const candidates = getHistoricalCandidates(taskId, TMP);
    const obs = candidates[0];

    assert.ok(obs.relevanceReason.length > 0);
    assert.ok(["same task", "keyword overlap (1)", "recent"].includes(obs.relevanceReason));
  });
});
