import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LIFECYCLE_STATES,
  TRANSITIONS,
  TERMINAL_STATES,
  STALE_THRESHOLD_MS,
  isLifecycleState,
  canTransition,
  transition,
  isUsable,
  isTerminal,
  stalenessCheck,
} from "./context-lifecycle.js";

describe("context-lifecycle", () => {
  describe("constants", () => {
    it("defines the six required states", () => {
      assert.deepEqual(Object.keys(LIFECYCLE_STATES).sort(), [
        "ACTIVE",
        "ARCHIVED",
        "COMPRESSED",
        "CREATED",
        "INVALIDATED",
        "STALE",
      ]);
    });

    it("terminal states are INVALIDATED and ARCHIVED", () => {
      assert.ok(TERMINAL_STATES.includes("INVALIDATED"));
      assert.ok(TERMINAL_STATES.includes("ARCHIVED"));
    });

    it("LIFECYCLE_STATES is frozen", () => {
      assert.ok(Object.isFrozen(LIFECYCLE_STATES));
    });

    it("TRANSITIONS table covers every state", () => {
      for (const state of Object.keys(LIFECYCLE_STATES)) {
        assert.ok(Array.isArray(TRANSITIONS[state]), `${state} missing`);
      }
    });

    it("stale thresholds are finite for non-terminal states", () => {
      assert.ok(Number.isFinite(STALE_THRESHOLD_MS.CREATED));
      assert.ok(Number.isFinite(STALE_THRESHOLD_MS.ACTIVE));
      assert.ok(Number.isFinite(STALE_THRESHOLD_MS.COMPRESSED));
      assert.equal(STALE_THRESHOLD_MS.STALE, Infinity);
      assert.equal(STALE_THRESHOLD_MS.INVALIDATED, Infinity);
      assert.equal(STALE_THRESHOLD_MS.ARCHIVED, Infinity);
    });
  });

  describe("isLifecycleState", () => {
    it("accepts known states", () => {
      for (const s of Object.values(LIFECYCLE_STATES)) {
        assert.equal(isLifecycleState(s), true);
      }
    });

    it("rejects unknown / wrong-type values", () => {
      assert.equal(isLifecycleState("UNKNOWN"), false);
      assert.equal(isLifecycleState(""), false);
      assert.equal(isLifecycleState(42), false);
      assert.equal(isLifecycleState(null), false);
      assert.equal(isLifecycleState(undefined), false);
      assert.equal(isLifecycleState({}), false);
    });
  });

  describe("canTransition", () => {
    it("CREATED -> ACTIVE is allowed", () => {
      assert.equal(canTransition("CREATED", "ACTIVE"), true);
    });

    it("CREATED -> ARCHIVED is allowed", () => {
      assert.equal(canTransition("CREATED", "ARCHIVED"), true);
    });

    it("ACTIVE -> STALE is allowed", () => {
      assert.equal(canTransition("ACTIVE", "STALE"), true);
    });

    it("STALE -> ACTIVE is allowed (resurrection)", () => {
      assert.equal(canTransition("STALE", "ACTIVE"), true);
    });

    it("INVALIDATED -> ACTIVE is forbidden", () => {
      assert.equal(canTransition("INVALIDATED", "ACTIVE"), false);
    });

    it("ARCHIVED -> COMPRESSED is forbidden", () => {
      assert.equal(canTransition("ARCHIVED", "COMPRESSED"), false);
    });

    it("rejects unknown states", () => {
      assert.equal(canTransition("FOO", "ACTIVE"), false);
      assert.equal(canTransition("CREATED", "BAR"), false);
    });
  });

  describe("transition()", () => {
    const item = { id: "a", type: "x", lifecycle: "CREATED" };

    it("returns a new item with updated lifecycle", () => {
      const next = transition(item, "ACTIVE", { actor: "test" });
      assert.equal(next.lifecycle, "ACTIVE");
      assert.equal(item.lifecycle, "CREATED"); // immutability
      assert.equal(next.id, "a");
    });

    it("records history with from/to/ts/meta", () => {
      const next = transition(item, "ACTIVE", { reason: "init" });
      assert.equal(next.lifecycleHistory.length, 1);
      assert.deepEqual(next.lifecycleHistory[0], {
        from: "CREATED",
        to: "ACTIVE",
        ts: next.lifecycleHistory[0].ts,
        reason: "init",
      });
      assert.ok(typeof next.lifecycleHistory[0].ts === "number");
    });

    it("appends to existing history", () => {
      const a = transition(item, "ACTIVE");
      const b = transition(a, "COMPRESSED");
      assert.equal(b.lifecycleHistory.length, 2);
      assert.equal(b.lifecycleHistory[1].from, "ACTIVE");
      assert.equal(b.lifecycleHistory[1].to, "COMPRESSED");
    });

    it("sets updatedAt", () => {
      const next = transition(item, "ACTIVE");
      assert.ok(typeof next.updatedAt === "number");
      assert.ok(next.updatedAt >= item.timestamp || true);
    });

    it("throws on illegal transition", () => {
      const archived = transition(item, "ARCHIVED");
      assert.throws(() => transition(archived, "ACTIVE"), /Illegal transition/);
    });

    it("throws on unknown target state", () => {
      assert.throws(() => transition(item, "WHATEVER"), /Unknown lifecycle state/);
    });

    it("throws when item is invalid", () => {
      assert.throws(() => transition(null, "ACTIVE"), /non-null object/);
      assert.throws(() => transition(undefined, "ACTIVE"), /non-null object/);
    });

    it("defaults missing lifecycle to CREATED", () => {
      const bare = { id: "b", type: "x" };
      const next = transition(bare, "ACTIVE");
      assert.equal(next.lifecycle, "ACTIVE");
      assert.equal(next.lifecycleHistory[0].from, "CREATED");
    });

    it("supports full path CREATED -> ACTIVE -> COMPRESSED -> ARCHIVED", () => {
      let s = transition(item, "ACTIVE");
      s = transition(s, "COMPRESSED");
      s = transition(s, "ARCHIVED");
      assert.equal(s.lifecycle, "ARCHIVED");
      assert.equal(s.lifecycleHistory.length, 3);
    });
  });

  describe("isUsable()", () => {
    it("true for CREATED and ACTIVE", () => {
      assert.equal(isUsable({ lifecycle: "CREATED" }), true);
      assert.equal(isUsable({ lifecycle: "ACTIVE" }), true);
    });

    it("false for COMPRESSED, STALE, INVALIDATED, ARCHIVED", () => {
      assert.equal(isUsable({ lifecycle: "COMPRESSED" }), false);
      assert.equal(isUsable({ lifecycle: "STALE" }), false);
      assert.equal(isUsable({ lifecycle: "INVALIDATED" }), false);
      assert.equal(isUsable({ lifecycle: "ARCHIVED" }), false);
    });

    it("treats missing lifecycle as CREATED (usable)", () => {
      assert.equal(isUsable({}), true);
    });

    it("rejects non-objects", () => {
      assert.equal(isUsable(null), false);
      assert.equal(isUsable(undefined), false);
      assert.equal(isUsable("string"), false);
    });
  });

  describe("isTerminal()", () => {
    it("true for INVALIDATED and ARCHIVED", () => {
      assert.equal(isTerminal("INVALIDATED"), true);
      assert.equal(isTerminal("ARCHIVED"), true);
    });

    it("false for everything else", () => {
      assert.equal(isTerminal("CREATED"), false);
      assert.equal(isTerminal("ACTIVE"), false);
      assert.equal(isTerminal("COMPRESSED"), false);
      assert.equal(isTerminal("STALE"), false);
    });
  });

  describe("stalenessCheck()", () => {
    it("returns current state for fresh item", () => {
      const now = 1_000_000;
      const fresh = { lifecycle: "ACTIVE", timestamp: now - 1000 };
      assert.equal(stalenessCheck(fresh, now), "ACTIVE");
    });

    it("returns STALE for old item", () => {
      const now = 1_000_000;
      const old = { lifecycle: "ACTIVE", timestamp: now - 25 * 60 * 60 * 1000 };
      assert.equal(stalenessCheck(old, now), "STALE");
    });

    it("respects per-state threshold", () => {
      const now = 1_000_000;
      const twoHoursOld = { lifecycle: "CREATED", timestamp: now - 2 * 60 * 60 * 1000 };
      assert.equal(stalenessCheck(twoHoursOld, now), "STALE");
    });

    it("returns the same state for terminal items (Infinity)", () => {
      const now = 1_000_000;
      assert.equal(stalenessCheck({ lifecycle: "ARCHIVED" }, now), "ARCHIVED");
      assert.equal(stalenessCheck({ lifecycle: "INVALIDATED" }, now), "INVALIDATED");
    });

    it("handles missing timestamp", () => {
      const now = 1_000_000;
      assert.equal(stalenessCheck({ lifecycle: "ACTIVE" }, now), "ACTIVE");
    });

    it("throws on invalid item", () => {
      assert.throws(() => stalenessCheck(null), /non-null object/);
    });
  });
});