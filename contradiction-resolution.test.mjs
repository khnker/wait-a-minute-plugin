/**
 * Contradiction Resolution tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getAuthorityType,
  compareAuthority,
  createConflict,
  resolveConflict,
  shouldBlock,
  generateConflictReport,
  AUTHORITY_PRECEDENCE,
  BLOCKING_TYPES,
} from "./contradiction-resolution.js";

describe("AUTHORITY_PRECEDENCE", () => {
  it("defines precedence order", () => {
    assert.ok(AUTHORITY_PRECEDENCE.user_decided < AUTHORITY_PRECEDENCE.constraint);
    assert.ok(AUTHORITY_PRECEDENCE.constraint < AUTHORITY_PRECEDENCE.evidence);
    assert.ok(AUTHORITY_PRECEDENCE.evidence < AUTHORITY_PRECEDENCE.decision);
    assert.ok(AUTHORITY_PRECEDENCE.decision < AUTHORITY_PRECEDENCE.inferred);
    assert.ok(AUTHORITY_PRECEDENCE.inferred < AUTHORITY_PRECEDENCE.unknown);
  });
});

describe("getAuthorityType", () => {
  it("detects user_decided", () => {
    const node = { content: "User decided to use PostgreSQL" };
    assert.equal(getAuthorityType(node), "user_decided");
  });

  it("detects constraint", () => {
    const node = { content: "Must use TLS 1.3" };
    assert.equal(getAuthorityType(node), "constraint");
  });

  it("detects evidence", () => {
    const node = { type: "evidence", content: "Test passed" };
    assert.equal(getAuthorityType(node), "evidence");
  });

  it("detects decision", () => {
    const node = { type: "decision", content: "Decision: use Playwright" };
    assert.equal(getAuthorityType(node), "decision");
  });

  it("detects inferred", () => {
    const node = { type: "inferred", content: "Inferred from logs" };
    assert.equal(getAuthorityType(node), "inferred");
  });

  it("returns unknown for null node", () => {
    assert.equal(getAuthorityType(null), "unknown");
  });

  it("returns unknown for empty content", () => {
    assert.equal(getAuthorityType({ content: "" }), "unknown");
  });
});

describe("compareAuthority", () => {
  it("user_decided wins over decision", () => {
    const result = compareAuthority("user_decided", "decision");
    assert.equal(result.winner, "user_decided");
  });

  it("constraint wins over evidence", () => {
    const result = compareAuthority("constraint", "evidence");
    assert.equal(result.winner, "constraint");
  });

  it("evidence wins over inferred", () => {
    const result = compareAuthority("evidence", "inferred");
    assert.equal(result.winner, "evidence");
  });

  it("same precedence returns first", () => {
    const result = compareAuthority("decision", "decision");
    assert.equal(result.winner, "decision");
  });
});

describe("createConflict", () => {
  it("creates conflict from two nodes", () => {
    const nodeA = { id: "node-1", content: "Use Playwright", type: "decision" };
    const nodeB = { id: "node-2", content: "Use Puppeteer", type: "decision" };
    const conflict = createConflict(nodeA, nodeB);

    assert.equal(conflict.nodeA, "node-1");
    assert.equal(conflict.nodeB, "node-2");
    assert.equal(conflict.type, "contradiction");
    assert.equal(conflict.status, "UNRESOLVED");
  });

  it("detects authority types", () => {
    const nodeA = { id: "node-1", content: "User decided Playwright" };
    const nodeB = { id: "node-2", content: "Decision: Puppeteer" };
    const conflict = createConflict(nodeA, nodeB);

    assert.equal(conflict.authorityA, "user_decided");
    assert.equal(conflict.authorityB, "decision");
  });
});

describe("resolveConflict", () => {
  it("resolves conflict based on authority", () => {
    const graph = {
      getNode: (id) => {
        if (id === "node-1") return { id: "node-1", content: "User decided Playwright" };
        if (id === "node-2") return { id: "node-2", content: "Decision: Puppeteer" };
        return null;
      },
    };

    const conflict = {
      id: "conflict-node-1-node-2",
      nodeA: "node-1",
      nodeB: "node-2",
      status: "UNRESOLVED",
    };

    const resolved = resolveConflict(conflict, graph);
    assert.equal(resolved.status, "RESOLVED");
    assert.equal(resolved.winner, "node-1");
    assert.ok(resolved.reason.includes("user_decided"));
  });

  it("marks UNRESOLVED when node not found", () => {
    const graph = { getNode: () => null };
    const conflict = {
      id: "conflict-missing",
      nodeA: "missing-a",
      nodeB: "missing-b",
      status: "UNRESOLVED",
    };

    const resolved = resolveConflict(conflict, graph);
    assert.equal(resolved.status, "UNRESOLVED");
  });
});

describe("shouldBlock", () => {
  it("blocks unresolved conflicts", () => {
    const conflict = { status: "UNRESOLVED" };
    assert.equal(shouldBlock(conflict), true);
  });

  it("blocks security-related conflicts", () => {
    const conflict = { status: "RESOLVED" };
    const taskContext = { content: "Fix security vulnerability" };
    assert.equal(shouldBlock(conflict, taskContext), true);
  });

  it("does not block resolved non-critical conflicts", () => {
    const conflict = { status: "RESOLVED" };
    const taskContext = { content: "Add new feature" };
    assert.equal(shouldBlock(conflict, taskContext), false);
  });
});

describe("generateConflictReport", () => {
  it("returns empty for no conflicts", () => {
    assert.equal(generateConflictReport([]), "");
  });

  it("generates report for conflicts", () => {
    const conflicts = [
      {
        id: "conflict-1",
        nodeA: "node-1",
        nodeB: "node-2",
        status: "RESOLVED",
        winner: "node-1",
        reason: "user_decided has higher precedence",
      },
    ];

    const report = generateConflictReport(conflicts);
    assert.ok(report.includes("[wam conflicts]"));
    assert.ok(report.includes("node-1 vs node-2"));
    assert.ok(report.includes("RESOLVED"));
  });

  it("warns about unresolved conflicts", () => {
    const conflicts = [
      {
        id: "conflict-1",
        nodeA: "node-1",
        nodeB: "node-2",
        status: "UNRESOLVED",
        winner: null,
        reason: "",
      },
    ];

    const report = generateConflictReport(conflicts);
    assert.ok(report.includes("unresolved"));
    assert.ok(report.includes("do not choose silently"));
  });
});
