/**
 * Evidence Identity Integrity tests — ID generation and namespace.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createEvidence, getEvidence, getAllEvidence } from "./evidence-lineage.js";

const TEST_ROOT = path.join(process.cwd(), ".wam-test-evidence-identity");

function cleanup() {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

function createTestTask(taskId) {
  const stateDir = path.join(TEST_ROOT, ".wam", "tasks", taskId);
  fs.mkdirSync(stateDir, { recursive: true });

  const state = {
    phase: "IMPLEMENTING",
    lastAction: "test task",
    requirements: [{ id: "req-1", title: "Test req", status: "pending" }],
  };
  fs.writeFileSync(path.join(stateDir, "state.yaml"), JSON.stringify(state));
  return state;
}

describe("Evidence Identity Integrity", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("generates ID using root, not process.cwd()", () => {
    createTestTask("task-1");
    const evidence = createEvidence("task-1", {
      requirementId: "req-1",
      content: "test evidence",
    }, TEST_ROOT);

    assert.ok(evidence.id.startsWith("ev-"));
    assert.ok(evidence.id.includes("-"));

    // Verify the file exists in the correct root
    const lineageDir = path.join(TEST_ROOT, ".wam", "tasks", "task-1", "lineage");
    assert.ok(fs.existsSync(lineageDir));
    const files = fs.readdirSync(lineageDir).filter((f) => f.endsWith(".json"));
    assert.ok(files.length > 0);
  });

  it("generates unique IDs for multiple evidence", () => {
    createTestTask("task-2");
    const ids = new Set();

    for (let i = 0; i < 10; i++) {
      const evidence = createEvidence("task-2", {
        requirementId: "req-1",
        content: `evidence ${i}`,
      }, TEST_ROOT);
      ids.add(evidence.id);
    }

    // All IDs should be unique
    assert.equal(ids.size, 10);
  });

  it("IDs are not based on file count", () => {
    createTestTask("task-3");

    // Create evidence
    const ev1 = createEvidence("task-3", {
      requirementId: "req-1",
      content: "first",
    }, TEST_ROOT);

    // Delete the file
    const lineageDir = path.join(TEST_ROOT, ".wam", "tasks", "task-3", "lineage");
    const file1 = path.join(lineageDir, `${ev1.id}.json`);
    fs.unlinkSync(file1);

    // Create another evidence - should NOT reuse the same ID
    const ev2 = createEvidence("task-3", {
      requirementId: "req-1",
      content: "second",
    }, TEST_ROOT);

    assert.notEqual(ev1.id, ev2.id);
  });

  it("works with different roots", () => {
    const root1 = path.join(TEST_ROOT, "project1");
    const root2 = path.join(TEST_ROOT, "project2");

    createTestTask.call({ root: root1 }, "task-multi-1");
    createTestTask.call({ root: root2 }, "task-multi-1");

    // Actually create tasks in each root
    for (const root of [root1, root2]) {
      const stateDir = path.join(root, ".wam", "tasks", "task-multi-1");
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(path.join(stateDir, "state.yaml"), JSON.stringify({
        phase: "IMPLEMENTING",
        requirements: [],
      }));
    }

    const ev1 = createEvidence("task-multi-1", {
      requirementId: "req-1",
      content: "evidence in project1",
    }, root1);

    const ev2 = createEvidence("task-multi-1", {
      requirementId: "req-1",
      content: "evidence in project2",
    }, root2);

    // IDs should be unique even for same task in different roots
    assert.notEqual(ev1.id, ev2.id);

    // Each should be in its own lineage directory
    assert.ok(fs.existsSync(path.join(root1, ".wam", "tasks", "task-multi-1", "lineage", `${ev1.id}.json`)));
    assert.ok(fs.existsSync(path.join(root2, ".wam", "tasks", "task-multi-1", "lineage", `${ev2.id}.json`)));
  });

  it("evidence contains required fields", () => {
    createTestTask("task-4");
    const evidence = createEvidence("task-4", {
      requirementId: "req-1",
      content: "test evidence",
      type: "test",
      source: "tool",
    }, TEST_ROOT);

    assert.ok(evidence.id);
    assert.equal(evidence.requirementId, "req-1");
    assert.equal(evidence.content, "test evidence");
    assert.equal(evidence.type, "test");
    assert.equal(evidence.source, "tool");
    assert.ok(evidence.createdAt);
    assert.equal(evidence.status, "unverified");
  });

  it("can retrieve evidence by ID", () => {
    createTestTask("task-5");
    const created = createEvidence("task-5", {
      requirementId: "req-1",
      content: "retrievable evidence",
    }, TEST_ROOT);

    const retrieved = getEvidence("task-5", created.id, TEST_ROOT);
    assert.ok(retrieved);
    assert.equal(retrieved.id, created.id);
    assert.equal(retrieved.content, "retrievable evidence");
  });

  it("can list all evidence for a task", () => {
    createTestTask("task-6");
    createEvidence("task-6", { requirementId: "req-1", content: "ev1" }, TEST_ROOT);
    createEvidence("task-6", { requirementId: "req-1", content: "ev2" }, TEST_ROOT);
    createEvidence("task-6", { requirementId: "req-1", content: "ev3" }, TEST_ROOT);

    const all = getAllEvidence("task-6", TEST_ROOT);
    assert.equal(all.length, 3);
  });
});
