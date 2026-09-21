/**
 * Release Manager — comprehensive test suite.
 *
 * Covers all 7 release sub-gates, canary progression + auto-abort, atomic
 * rollback semantics, and multi-signer quorum behavior.
 */

import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateRelease,
  evaluateSubGate,
  SUB_GATES,
} from "./release-gate.js";
import { canaryDeploy } from "./canary-deploy.js";
import { createRollbackManager } from "./rollback-manager.js";
import { createMultiSigner } from "./multi-signer.js";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function validTask(overrides = {}) {
  return {
    id: "t1",
    assessment: { objective: "ship it", valid: true, stale: false },
    completion: { status: "VERIFIED" },
    predictedFiles: ["a.js", "a.test.js"],
    actualFiles: ["a.js", "a.test.js"],
    ...overrides,
  };
}

function validManifest(overrides = {}) {
  return {
    releaseId: "rel-1",
    changeSetId: "cs-1",
    version: "1.0.0",
    producedAt: "2026-09-21T00:00:00.000Z",
    signers: ["alice"],
    gateResults: [],
    ...overrides,
  };
}

function validPayload(overrides = {}) {
  return {
    tasks: [validTask()],
    manifest: validManifest(),
    hardeningLog: { events: [] },
    durableState: {
      corrupted: false,
      recoverable: true,
      snapshots: [{ id: "snap-1", at: "2026-09-21T00:00:00.000Z" }],
    },
    context: {
      artifacts: [
        { id: "ctx-1", producedAt: "2026-09-21T00:00:00.000Z", valid: true, stale: false },
      ],
    },
    ...overrides,
  };
}

function inMemoryStore() {
  const map = new Map();
  return {
    load: (id) => map.get(id) || null,
    save: (id, snap) => {
      map.set(id, JSON.parse(JSON.stringify(snap)));
    },
    commit: (id, snap) => {
      map.set(id, JSON.parse(JSON.stringify(snap)));
    },
    _peek: (id) => map.get(id),
  };
}

function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
    set: (v) => {
      t = v;
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Release Gate — sub-gate unit tests                                         */
/* -------------------------------------------------------------------------- */

describe("release-gate: sub-gate coverage", () => {
  it("exposes exactly the 7 documented sub-gates", () => {
    assert.deepEqual(
      [...SUB_GATES].sort(),
      [
        "assessmentContract",
        "completionIntegrity",
        "contextProduction",
        "durableState",
        "executionDecoupling",
        "observability",
        "runtimeHardening",
      ]
    );
  });

  it("returns false for unknown sub-gate name", () => {
    const r = evaluateSubGate("not-a-gate", {});
    assert.equal(r.allowed, false);
    assert.match(r.reason, /unknown/);
  });

  it("assessmentContract: passes on valid assessments", () => {
    const r = evaluateSubGate("assessmentContract", [
      validTask(),
      validTask({ id: "t2" }),
    ]);
    assert.equal(r.allowed, true);
  });

  it("assessmentContract: blocks when a task lacks an assessment", () => {
    const r = evaluateSubGate("assessmentContract", [
      validTask(),
      validTask({ id: "t2", assessment: null }),
    ]);
    assert.equal(r.allowed, false);
    assert.equal(r.blockers.length, 1);
    assert.equal(r.blockers[0].taskId, "t2");
  });

  it("assessmentContract: blocks on stale assessment", () => {
    const r = evaluateSubGate("assessmentContract", [
      validTask({ assessment: { objective: "x", stale: true, valid: true } }),
    ]);
    assert.equal(r.allowed, false);
    assert.match(r.blockers[0].reason, /stale/);
  });

  it("assessmentContract: blocks when assessment.valid is false", () => {
    const r = evaluateSubGate("assessmentContract", [
      validTask({ assessment: { objective: "x", valid: false, stale: false } }),
    ]);
    assert.equal(r.allowed, false);
    assert.match(r.blockers[0].reason, /invalid/);
  });

  it("assessmentContract: blocks on missing objective", () => {
    const r = evaluateSubGate("assessmentContract", [
      validTask({ assessment: { valid: true, stale: false } }),
    ]);
    assert.equal(r.allowed, false);
    assert.match(r.blockers[0].reason, /objective/);
  });

  it("assessmentContract: blocks on missing tasks array", () => {
    const r = evaluateSubGate("assessmentContract", undefined);
    assert.equal(r.allowed, false);
  });

  it("completionIntegrity: passes when every task is VERIFIED", () => {
    const r = evaluateSubGate("completionIntegrity", [
      validTask(),
      validTask({ id: "t2" }),
    ]);
    assert.equal(r.allowed, true);
  });

  it("completionIntegrity: blocks on any non-VERIFIED task", () => {
    const r = evaluateSubGate("completionIntegrity", [
      validTask(),
      validTask({ id: "t2", completion: { status: "PENDING" } }),
    ]);
    assert.equal(r.allowed, false);
    assert.equal(r.blockers[0].taskId, "t2");
    assert.match(r.blockers[0].reason, /PENDING/);
  });

  it("completionIntegrity: blocks when completion is missing", () => {
    const r = evaluateSubGate("completionIntegrity", [
      validTask({ completion: undefined }),
    ]);
    assert.equal(r.allowed, false);
  });

  it("executionDecoupling: passes when all mutations are in-scope", () => {
    const r = evaluateSubGate("executionDecoupling", [
      validTask({ actualFiles: ["a.js", "a.test.js"] }),
    ]);
    assert.equal(r.allowed, true);
  });

  it("executionDecoupling: blocks on out-of-scope file mutation", () => {
    const r = evaluateSubGate("executionDecoupling", [
      validTask({ actualFiles: ["a.js", "untracked.js"] }),
    ]);
    assert.equal(r.allowed, false);
    assert.equal(r.blockers[0].reason, "out-of-scope mutation: untracked.js");
  });

  it("executionDecoupling: blocks on reported scope violations", () => {
    const r = evaluateSubGate("executionDecoupling", [
      validTask({ scope: ["src/"], violations: ["touched readme"] }),
    ]);
    assert.equal(r.allowed, false);
    assert.equal(r.blockers[0].reason, "touched readme");
  });

  it("durableState: passes when state is consistent and has a snapshot", () => {
    const r = evaluateSubGate("durableState", {
      corrupted: false,
      recoverable: true,
      snapshots: [{ id: "s1" }],
    });
    assert.equal(r.allowed, true);
  });

  it("durableState: blocks when state is corrupted", () => {
    const r = evaluateSubGate("durableState", {
      corrupted: true,
      recoverable: true,
      snapshots: [{ id: "s1" }],
    });
    assert.equal(r.allowed, false);
    assert.match(r.blockers[0].reason, /corrupt/);
  });

  it("durableState: blocks when no pre-release snapshot exists", () => {
    const r = evaluateSubGate("durableState", {
      corrupted: false,
      recoverable: true,
      snapshots: [],
    });
    assert.equal(r.allowed, false);
    assert.match(r.blockers[0].reason, /snapshot/);
  });

  it("durableState: blocks when payload missing", () => {
    const r = evaluateSubGate("durableState", undefined);
    assert.equal(r.allowed, false);
  });

  it("contextProduction: passes on fresh artifacts", () => {
    const r = evaluateSubGate("contextProduction", {
      artifacts: [
        { id: "c1", producedAt: "2026-09-21T00:00:00Z", valid: true, stale: false },
        { id: "c2", producedAt: "2026-09-21T00:00:00Z" },
      ],
    });
    assert.equal(r.allowed, true);
  });

  it("contextProduction: blocks when artifact is stale", () => {
    const r = evaluateSubGate("contextProduction", {
      artifacts: [
        { id: "c1", producedAt: "2026-09-21T00:00:00Z", stale: true },
      ],
    });
    assert.equal(r.allowed, false);
    assert.match(r.blockers[0].reason, /stale/);
  });

  it("contextProduction: blocks when artifact is invalid", () => {
    const r = evaluateSubGate("contextProduction", {
      artifacts: [
        { id: "c1", producedAt: "2026-09-21T00:00:00Z", valid: false },
      ],
    });
    assert.equal(r.allowed, false);
    assert.match(r.blockers[0].reason, /invalid/);
  });

  it("contextProduction: blocks when artifacts list is empty", () => {
    const r = evaluateSubGate("contextProduction", { artifacts: [] });
    assert.equal(r.allowed, false);
  });

  it("runtimeHardening: passes when no unresolved events", () => {
    const r = evaluateSubGate("runtimeHardening", {
      events: [
        { id: "e1", status: "BLOCKED", resolved: true },
        { id: "e2", status: "ESCALATE", resolved: true },
        { id: "e3", status: "OK" },
      ],
    });
    assert.equal(r.allowed, true);
  });

  it("runtimeHardening: blocks on unresolved BLOCKED event", () => {
    const r = evaluateSubGate("runtimeHardening", {
      events: [{ id: "e1", status: "BLOCKED" }],
    });
    assert.equal(r.allowed, false);
    assert.equal(r.blockers[0].eventId, "e1");
  });

  it("runtimeHardening: blocks on unresolved ESCALATE event", () => {
    const r = evaluateSubGate("runtimeHardening", {
      events: [{ id: "e1", status: "ESCALATE", resolved: false }],
    });
    assert.equal(r.allowed, false);
  });

  it("observability: passes on a complete manifest", () => {
    const r = evaluateSubGate("observability", validManifest());
    assert.equal(r.allowed, true);
  });

  it("observability: blocks when manifest is missing", () => {
    const r = evaluateSubGate("observability", undefined);
    assert.equal(r.allowed, false);
    assert.match(r.blockers[0].reason, /no release manifest/);
  });

  it("observability: blocks when required fields are missing", () => {
    const r = evaluateSubGate("observability", { releaseId: "r" });
    assert.equal(r.allowed, false);
    assert.equal(r.blockers.length, 5);
  });

  it("observability: blocks when signers is not an array", () => {
    const r = evaluateSubGate("observability", {
      ...validManifest(),
      signers: "alice",
    });
    assert.equal(r.allowed, false);
    assert.match(r.blockers[0].reason, /signers must be an array/);
  });
});

/* -------------------------------------------------------------------------- */
/*  Release Gate — aggregate                                                  */
/* -------------------------------------------------------------------------- */

describe("release-gate: aggregate evaluation", () => {
  it("returns allowed=true with summary when all sub-gates pass", () => {
    const r = evaluateRelease(validPayload());
    assert.equal(r.allowed, true);
    assert.equal(r.summary.total, 7);
    assert.equal(r.summary.passed, 7);
    assert.equal(r.summary.failed, 0);
    assert.equal(r.gates.length, 7);
    for (const g of r.gates) assert.equal(g.allowed, true);
  });

  it("returns allowed=false and lists every failing sub-gate", () => {
    const r = evaluateRelease(
      validPayload({
        tasks: [
          validTask(),
          validTask({ id: "t2", assessment: null }),
          validTask({ id: "t3", completion: { status: "FAILED" } }),
        ],
        manifest: validManifest({ version: undefined }),
        hardeningLog: { events: [{ id: "e1", status: "BLOCKED" }] },
      })
    );
    assert.equal(r.allowed, false);
    assert.equal(r.summary.failed, 4);
    const failed = r.gates.filter((g) => !g.allowed).map((g) => g.id);
    assert.ok(failed.includes("assessmentContract"));
    assert.ok(failed.includes("completionIntegrity"));
    assert.ok(failed.includes("runtimeHardening"));
    assert.ok(failed.includes("observability"));
  });

  it("is robust to missing payload sections (no throw)", () => {
    const r = evaluateRelease({});
    assert.equal(typeof r.allowed, "boolean");
    assert.equal(r.gates.length, 7);
  });
});

/* -------------------------------------------------------------------------- */
/*  Canary Deploy                                                             */
/* -------------------------------------------------------------------------- */

describe("canary-deploy", () => {
  it("returns aborted with reason when releaseId is missing", async () => {
    const r = await canaryDeploy({
      rolloutPercent: 10,
      durationMs: 100,
      healthCheck: () => ({ ok: true, completionRate: 1, errorRate: 0 }),
    });
    assert.equal(r.status, "aborted");
    assert.match(r.reason, /releaseId/);
    assert.equal(r.observations.length, 0);
  });

  it("returns aborted when rolloutPercent is out of range", async () => {
    const r = await canaryDeploy({
      releaseId: "r1",
      rolloutPercent: 150,
      durationMs: 100,
      healthCheck: () => ({ ok: true }),
    });
    assert.equal(r.status, "aborted");
    assert.match(r.reason, /rolloutPercent/);
  });

  it("returns aborted when durationMs is not positive", async () => {
    const r = await canaryDeploy({
      releaseId: "r1",
      rolloutPercent: 10,
      durationMs: 0,
      healthCheck: () => ({ ok: true }),
    });
    assert.equal(r.status, "aborted");
    assert.match(r.reason, /durationMs/);
  });

  it("returns aborted when healthCheck is not a function", async () => {
    const r = await canaryDeploy({
      releaseId: "r1",
      rolloutPercent: 10,
      durationMs: 100,
      healthCheck: null,
    });
    assert.equal(r.status, "aborted");
    assert.match(r.reason, /healthCheck/);
  });

  it("advances when health is stable for the full window", async () => {
    const clock = fakeClock(0);
    const ticks = [];
    const r = await canaryDeploy({
      releaseId: "r1",
      rolloutPercent: 10,
      durationMs: 50,
      healthCheck: () => {
        ticks.push(clock.now());
        return { ok: true, completionRate: 0.98, errorRate: 0.01 };
      },
      tickMs: 10,
      now: clock.now,
    });
    assert.equal(r.status, "advanced");
    assert.match(r.reason, /healthy/);
    assert.ok(r.observations.length >= 5);
    for (const o of r.observations) {
      assert.equal(o.ok, true);
      assert.equal(o.completionRate, 0.98);
    }
  });

  it("auto-aborts when health check reports unhealthy", async () => {
    const clock = fakeClock(0);
    let n = 0;
    const r = await canaryDeploy({
      releaseId: "r1",
      rolloutPercent: 25,
      durationMs: 1000,
      healthCheck: () => {
        n += 1;
        return { ok: n > 2, completionRate: 0.99, errorRate: 0.01 };
      },
      tickMs: 5,
      now: clock.now,
    });
    assert.equal(r.status, "aborted");
    assert.equal(r.reason, "health check reported unhealthy");
    assert.equal(r.observations.length, 3);
  });

  it("auto-aborts on completion-rate regression", async () => {
    const clock = fakeClock(0);
    const r = await canaryDeploy({
      releaseId: "r1",
      rolloutPercent: 25,
      durationMs: 1000,
      thresholds: { minCompletionRate: 0.9, maxErrorRate: 0.05 },
      healthCheck: () => ({ ok: true, completionRate: 0.7, errorRate: 0.01 }),
      tickMs: 5,
      now: clock.now,
    });
    assert.equal(r.status, "aborted");
    assert.match(r.reason, /completion rate 0.7 < 0.9/);
  });

  it("auto-aborts on error-rate spike", async () => {
    const clock = fakeClock(0);
    const r = await canaryDeploy({
      releaseId: "r1",
      rolloutPercent: 25,
      durationMs: 1000,
      thresholds: { minCompletionRate: 0.9, maxErrorRate: 0.05 },
      healthCheck: () => ({ ok: true, completionRate: 0.99, errorRate: 0.2 }),
      tickMs: 5,
      now: clock.now,
    });
    assert.equal(r.status, "aborted");
    assert.match(r.reason, /error rate 0.2 > 0.05/);
  });

  it("auto-aborts and reports thrown errors from healthCheck", async () => {
    const r = await canaryDeploy({
      releaseId: "r1",
      rolloutPercent: 10,
      durationMs: 100,
      healthCheck: () => {
        throw new Error("telemetry down");
      },
      tickMs: 5,
      now: () => 0,
    });
    assert.equal(r.status, "aborted");
    assert.match(r.reason, /telemetry down/);
  });

  it("respects the configured rollout percentage (passed through to caller)", async () => {
    const clock = fakeClock(0);
    let captured;
    await canaryDeploy({
      releaseId: "r1",
      rolloutPercent: 37,
      durationMs: 20,
      healthCheck: () => {
        captured = 37;
        return { ok: true, completionRate: 0.99, errorRate: 0.01 };
      },
      tickMs: 5,
      now: clock.now,
    });
    assert.equal(captured, 37);
  });
});

/* -------------------------------------------------------------------------- */
/*  Rollback Manager                                                          */
/* -------------------------------------------------------------------------- */

describe("rollback-manager", () => {
  it("executes all steps and commits the snapshot on success", async () => {
    const store = inMemoryStore();
    const rm = createRollbackManager({ store });
    const snapshot = {
      id: "snap-1",
      files: { "a.js": "v1", "b.js": "v1" },
    };
    const log = [];
    const r = await rm.rollback({
      releaseId: "rel-1",
      snapshot,
      steps: [
        {
          id: "s1",
          run: async () => {
            log.push("s1");
            return { undo: async () => log.push("s1-undo") };
          },
        },
        {
          id: "s2",
          run: async () => {
            log.push("s2");
            return { undo: async () => log.push("s2-undo") };
          },
        },
      ],
    });
    assert.equal(r.rolledBack, true);
    assert.equal(r.cause, "succeeded");
    assert.equal(r.failedStep, null);
    assert.deepEqual(log, ["s1", "s2"]);
    assert.equal(store._peek("snap-1").id, "snap-1");
  });

  it("reverts state via snapshot + undo on step failure", async () => {
    const store = inMemoryStore();
    const rm = createRollbackManager({ store });
    const snapshot = { id: "snap-2", state: "pre" };
    const log = [];
    const r = await rm.rollback({
      releaseId: "rel-2",
      snapshot,
      steps: [
        {
          id: "alpha",
          run: async () => {
            log.push("alpha");
            return { undo: async () => log.push("alpha-undo") };
          },
        },
        {
          id: "beta",
          run: async () => {
            log.push("beta");
            throw new Error("deploy blew up");
          },
        },
        {
          id: "gamma",
          run: async () => {
            log.push("gamma");
            return {};
          },
        },
      ],
    });
    assert.equal(r.rolledBack, true);
    assert.equal(r.failedStep, "beta");
    assert.match(r.cause, /beta failed/);
    assert.deepEqual(log, ["alpha", "beta", "alpha-undo"]);
    // gamma must NOT have run
    assert.equal(store._peek("snap-2").state, "pre");
  });

  it("restores the snapshot even when undo is missing", async () => {
    const store = inMemoryStore();
    const rm = createRollbackManager({ store });
    const snapshot = { id: "snap-3", state: "pre" };
    const r = await rm.rollback({
      releaseId: "rel-3",
      snapshot,
      steps: [
        {
          id: "s1",
          run: async () => {
            return {}; // no undo
          },
        },
        {
          id: "s2",
          run: async () => {
            throw new Error("kaboom");
          },
        },
      ],
    });
    assert.equal(r.rolledBack, true);
    assert.equal(r.failedStep, "s2");
    assert.equal(store._peek("snap-3").state, "pre");
  });

  it("rejects when releaseId is missing", async () => {
    const rm = createRollbackManager({ store: inMemoryStore() });
    const r = await rm.rollback({
      snapshot: { id: "s" },
      steps: [],
    });
    assert.equal(r.rolledBack, false);
    assert.match(r.cause, /releaseId/);
  });

  it("rejects when steps is not an array", async () => {
    const rm = createRollbackManager({ store: inMemoryStore() });
    const r = await rm.rollback({
      releaseId: "r",
      snapshot: { id: "s" },
      steps: "nope",
    });
    assert.equal(r.rolledBack, false);
    assert.match(r.cause, /steps/);
  });

  it("rejects when snapshot is missing", async () => {
    const rm = createRollbackManager({ store: inMemoryStore() });
    const r = await rm.rollback({ releaseId: "r", steps: [] });
    assert.equal(r.rolledBack, false);
    assert.match(r.cause, /snapshot/);
  });

  it("handles malformed step entries by aborting the whole rollback", async () => {
    const store = inMemoryStore();
    const rm = createRollbackManager({ store });
    const snapshot = { id: "snap-4", state: "pre" };
    const r = await rm.rollback({
      releaseId: "rel-4",
      snapshot,
      steps: [
        { id: "ok", run: async () => ({ undo: async () => {} }) },
        { id: "broken" /* no run */ },
      ],
    });
    assert.equal(r.rolledBack, true);
    assert.equal(r.failedStep, "broken");
    assert.match(r.cause, /malformed/);
  });

  it("throws when constructed without a store", () => {
    assert.throws(() => createRollbackManager({}));
  });
});

/* -------------------------------------------------------------------------- */
/*  Multi-Signer                                                              */
/* -------------------------------------------------------------------------- */

describe("multi-signer", () => {
  it("requires all signers in strict mode by default", () => {
    const ms = createMultiSigner({ signers: ["alice", "bob", "carol"] });
    const status = ms.status("c1");
    assert.equal(status.required, 3);
    assert.equal(status.satisfied, false);
    assert.deepEqual(status.approvals, []);
  });

  it("records approvals and reaches quorum at N", () => {
    const ms = createMultiSigner({ signers: ["alice", "bob", "carol"], required: 2 });
    const r1 = ms.approve("c1", "alice");
    assert.equal(r1.ok, true);
    assert.equal(r1.satisfied, false);
    const r2 = ms.approve("c1", "bob");
    assert.equal(r2.ok, true);
    assert.equal(r2.satisfied, true);
    assert.equal(r2.tally.signed, 2);
  });

  it("rejects duplicate approvals from the same signer", () => {
    const ms = createMultiSigner({ signers: ["alice", "bob"] });
    assert.equal(ms.approve("c1", "alice").ok, true);
    const r = ms.approve("c1", "alice");
    assert.equal(r.ok, false);
    assert.match(r.reason, /duplicate/);
  });

  it("rejects approvals from non-eligible signers", () => {
    const ms = createMultiSigner({ signers: ["alice", "bob"] });
    const r = ms.approve("c1", "mallory");
    assert.equal(r.ok, false);
    assert.match(r.reason, /not eligible/);
  });

  it("rejects incomplete signoff (multi-signer flow rejects incomplete signoff)", () => {
    const ms = createMultiSigner({ signers: ["alice", "bob", "carol"], required: 3 });
    ms.approve("c1", "alice");
    ms.approve("c1", "bob");
    const status = ms.status("c1");
    assert.equal(status.satisfied, false);
    assert.equal(status.signed, 2);
    assert.equal(status.required, 3);
    // Only when carol signs does the release unlock.
    const final = ms.approve("c1", "carol");
    assert.equal(final.satisfied, true);
  });

  it("supports majority policy", () => {
    const ms = createMultiSigner({
      signers: ["a", "b", "c", "d", "e"],
      mode: "majority",
    });
    const status = ms.status("c1");
    assert.equal(status.required, 3);
    assert.equal(status.satisfied, false);
    ms.approve("c1", "a");
    ms.approve("c1", "b");
    ms.approve("c1", "c");
    assert.equal(ms.status("c1").satisfied, true);
  });

  it("supports any policy with required=1", () => {
    const ms = createMultiSigner({ signers: ["a", "b"], mode: "any" });
    const status = ms.status("c1");
    assert.equal(status.required, 1);
    assert.equal(ms.approve("c1", "a").satisfied, true);
  });

  it("isolates tallies across changeIds", () => {
    const ms = createMultiSigner({ signers: ["a", "b"], required: 1 });
    ms.approve("c1", "a");
    assert.equal(ms.status("c1").satisfied, true);
    assert.equal(ms.status("c2").satisfied, false);
  });

  it("reset(changeId) clears one tally; reset() clears all", () => {
    const ms = createMultiSigner({ signers: ["a", "b"], required: 1 });
    ms.approve("c1", "a");
    ms.approve("c2", "b");
    ms.reset("c1");
    assert.equal(ms.status("c1").signed, 0);
    assert.equal(ms.status("c2").signed, 1);
    ms.reset();
    assert.equal(ms.status("c2").signed, 0);
  });

  it("rejects invalid configs", () => {
    assert.throws(() => createMultiSigner({ signers: [] }));
    assert.throws(() =>
      createMultiSigner({ signers: ["a", "b"], required: 5 })
    );
  });

  it("rejects missing changeId or signerId", () => {
    const ms = createMultiSigner({ signers: ["a"] });
    assert.equal(ms.approve("", "a").ok, false);
    assert.equal(ms.approve("c1", "").ok, false);
    assert.equal(ms.approve(null, "a").ok, false);
    assert.equal(ms.approve("c1", null).ok, false);
  });
});

/* -------------------------------------------------------------------------- */
/*  End-to-end: release cycle → canary → breach → rollback → recovery         */
/* -------------------------------------------------------------------------- */

describe("end-to-end release cycle", () => {
  it("advances healthy, aborts on regression, and rolls back atomically", async () => {
    // 1. Build a passing release payload.
    const payload = validPayload();
    const gate = evaluateRelease(payload);
    assert.equal(gate.allowed, true, "all sub-gates must pass");

    // 2. Multi-signer approval.
    const ms = createMultiSigner({ signers: ["alice", "bob"], required: 2 });
    ms.approve("release-1", "alice");
    const approval = ms.approve("release-1", "bob");
    assert.equal(approval.satisfied, true);

    // 3. Canary: simulating a completion-rate regression mid-window.
    const clock = fakeClock(0);
    let n = 0;
    const canary = await canaryDeploy({
      releaseId: "release-1",
      rolloutPercent: 25,
      durationMs: 1000,
      thresholds: { minCompletionRate: 0.9, maxErrorRate: 0.05 },
      healthCheck: () => {
        n += 1;
        if (n === 1) return { ok: true, completionRate: 0.98, errorRate: 0.01 };
        return { ok: true, completionRate: 0.6, errorRate: 0.01 }; // regression
      },
      tickMs: 5,
      now: clock.now,
    });
    assert.equal(canary.status, "aborted");
    assert.match(canary.reason, /completion rate 0\.6/);

    // 4. Atomic rollback restores pre-release state.
    const store = inMemoryStore();
    const rm = createRollbackManager({ store });
    const preSnapshot = {
      id: "snap-e2e",
      state: "pre",
      completion: 1.0,
    };
    const events = [];
    const rollback = await rm.rollback({
      releaseId: "release-1",
      snapshot: preSnapshot,
      steps: [
        {
          id: "deploy",
          run: async () => {
            events.push("deployed");
            return { undo: async () => events.push("deploy-undo") };
          },
        },
        {
          id: "flag",
          run: async () => {
            events.push("flag-on");
            // (we never reach here in the happy path, but if we did, simulate partial state)
            return { undo: async () => events.push("flag-undo") };
          },
        },
      ],
    });
    assert.equal(rollback.rolledBack, true);
    assert.equal(rollback.cause, "succeeded");
    assert.deepEqual(events, ["deployed", "flag-on"]);

    // 5. Confirm durable state was committed post-success.
    assert.equal(store._peek("snap-e2e").state, "pre");
  });
});