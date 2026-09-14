/**
 * Run Event Identity tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateEventId,
  parseEventId,
  isScopedEventId,
  getNextSequence,
  createScopedEvent,
  migrateRunEventIds,
  getEventType,
  getRunIdFromEvent,
} from "./run-event-identity.js";

describe("generateEventId", () => {
  it("generates scoped event ID", () => {
    const id = generateEventId("run-003", "act", 1);
    assert.equal(id, "run-003:act:001");
  });

  it("pads sequence to 3 digits", () => {
    const id = generateEventId("run-001", "obs", 42);
    assert.equal(id, "run-001:obs:042");
  });
});

describe("parseEventId", () => {
  it("parses valid scoped ID", () => {
    const parsed = parseEventId("run-003:act:001");
    assert.ok(parsed);
    assert.equal(parsed.runId, "run-003");
    assert.equal(parsed.type, "act");
    assert.equal(parsed.sequence, 1);
  });

  it("returns null for legacy ID", () => {
    assert.equal(parseEventId("act-1"), null);
  });

  it("returns null for invalid type", () => {
    assert.equal(parseEventId("run-003:xxx:001"), null);
  });

  it("returns null for non-numeric sequence", () => {
    assert.equal(parseEventId("run-003:act:abc"), null);
  });

  it("returns null for null input", () => {
    assert.equal(parseEventId(null), null);
  });
});

describe("isScopedEventId", () => {
  it("returns true for scoped ID", () => {
    assert.equal(isScopedEventId("run-003:act:001"), true);
  });

  it("returns false for legacy ID", () => {
    assert.equal(isScopedEventId("act-1"), false);
  });
});

describe("getNextSequence", () => {
  it("returns 1 for empty run", () => {
    const run = { id: "run-001", actions: [] };
    assert.equal(getNextSequence(run, "act"), 1);
  });

  it("returns next sequence after existing events", () => {
    const run = {
      id: "run-001",
      actions: [
        { id: "run-001:act:001" },
        { id: "run-001:act:002" },
      ],
    };
    assert.equal(getNextSequence(run, "act"), 3);
  });

  it("handles mixed legacy and scoped IDs", () => {
    const run = {
      id: "run-001",
      observations: [
        { id: "obs-1" }, // legacy
        { id: "run-001:obs:001" }, // scoped
      ],
    };
    assert.equal(getNextSequence(run, "obs"), 2);
  });
});

describe("createScopedEvent", () => {
  it("creates event with scoped ID", () => {
    const run = { id: "run-001", actions: [] };
    const event = createScopedEvent(run, "act", { text: "test action" });
    assert.equal(event.id, "run-001:act:001");
    assert.equal(event.text, "test action");
    assert.ok(event.timestamp);
  });

  it("increments sequence", () => {
    const run = {
      id: "run-001",
      decisions: [{ id: "run-001:dec:001" }],
    };
    const event = createScopedEvent(run, "dec", { text: "test decision" });
    assert.equal(event.id, "run-001:dec:002");
  });
});

describe("migrateRunEventIds", () => {
  it("migrates legacy IDs to scoped format", () => {
    const run = {
      id: "run-001",
      actions: [{ id: "act-1", text: "action 1" }],
      observations: [{ id: "obs-1", text: "obs 1" }],
    };

    const migrated = migrateRunEventIds(run);
    assert.equal(migrated.actions[0].id, "run-001:act:001");
    assert.equal(migrated.observations[0].id, "run-001:obs:001");
  });

  it("does not re-migrate scoped IDs", () => {
    const run = {
      id: "run-001",
      actions: [{ id: "run-001:act:001", text: "action 1" }],
    };

    const migrated = migrateRunEventIds(run);
    assert.equal(migrated.actions[0].id, "run-001:act:001");
  });

  it("handles null run", () => {
    assert.equal(migrateRunEventIds(null), null);
  });
});

describe("getEventType", () => {
  it("extracts type from scoped ID", () => {
    assert.equal(getEventType("run-003:act:001"), "act");
    assert.equal(getEventType("run-003:obs:001"), "obs");
    assert.equal(getEventType("run-003:dec:001"), "dec");
    assert.equal(getEventType("run-003:ev:001"), "ev");
  });

  it("returns null for legacy ID", () => {
    assert.equal(getEventType("act-1"), null);
  });
});

describe("getRunIdFromEvent", () => {
  it("extracts run ID from scoped event", () => {
    assert.equal(getRunIdFromEvent("run-003:act:001"), "run-003");
  });

  it("returns null for legacy ID", () => {
    assert.equal(getRunIdFromEvent("act-1"), null);
  });
});
