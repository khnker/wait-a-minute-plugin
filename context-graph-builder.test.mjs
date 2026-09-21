/**
 * Context Graph Builder tests.
 *
 * Validates that buildContextGraph correctly reconstructs a ContextGraph
 * from runtime state (TaskState, RunState, EvidenceLineage).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildContextGraph } from "./context-graph-builder.js";

function assertHasGraphMethods(g) {
  for (const m of ["addNode", "addEdge", "getNode", "getNodes", "getEdgesFrom"]) {
    assert.equal(typeof g[m], "function", `missing method: ${m}`);
  }
}

describe("buildContextGraph", () => {
  describe("basic construction", () => {
    it("returns a ContextGraph instance", () => {
      const g = buildContextGraph({}, {}, []);
      assert.ok(g);
      assertHasGraphMethods(g);
    });

    it("accepts null arguments without throwing", () => {
      assert.doesNotThrow(() => buildContextGraph(null, null, null));
      assert.doesNotThrow(() => buildContextGraph(undefined, undefined, undefined));
    });

    it("accepts partial arguments (missing runState/evidenceLineage)", () => {
      assert.doesNotThrow(() => buildContextGraph({ taskId: "t1" }));
      assert.doesNotThrow(() => buildContextGraph({ taskId: "t1" }, {}));
    });
  });

  describe("task node", () => {
    it("adds a task node from taskState", () => {
      const taskState = { taskId: "task-1", contract: { objective: "Build auth" } };
      const g = buildContextGraph(taskState, {}, []);
      const node = g.getNode("task-1");
      assert.ok(node);
      assert.equal(node.type, "task");
      assert.equal(node.content, "Build auth");
    });

    it("defaults task content when objective is missing", () => {
      const taskState = { taskId: "task-1" };
      const g = buildContextGraph(taskState, {}, []);
      const node = g.getNode("task-1");
      assert.ok(node);
      assert.equal(node.content, "Active task");
    });

    it("does not add a task node when taskId is missing", () => {
      const g = buildContextGraph({ contract: { objective: "No ID" } }, {}, []);
      assert.equal(g.getNode("undefined"), undefined);
      assert.equal(g.getNodes().length, 0);
    });

    it("sets provenance metadata on task node", () => {
      const g = buildContextGraph({ taskId: "t1" }, {}, []);
      const node = g.getNode("t1");
      assert.equal(node.metadata?.provenance, "user_decided");
    });
  });

  describe("requirement nodes", () => {
    it("adds requirement nodes from taskState.requirements", () => {
      const taskState = { taskId: "t1", requirements: [{ id: "r1", title: "Auth" }] };
      const g = buildContextGraph(taskState, {}, []);
      const req = g.getNode("r1");
      assert.ok(req);
      assert.equal(req.type, "requirement");
      assert.equal(req.content, "Auth");
    });

    it("maps requirement from description when title missing", () => {
      const taskState = { taskId: "t1", requirements: [{ id: "r1", description: "Login" }] };
      const g = buildContextGraph(taskState, {}, []);
      assert.equal(g.getNode("r1").content, "Login");
    });

    it("creates requires_completion edge from task to requirement", () => {
      const taskState = { taskId: "t1", requirements: [{ id: "r1" }] };
      const g = buildContextGraph(taskState, {}, []);
      const edges = g.getEdgesFrom("t1");
      const reqEdge = edges.find((e) => e.type === "requires_completion");
      assert.ok(reqEdge);
      assert.equal(reqEdge.from, "t1");
      assert.equal(reqEdge.to, "r1");
      assert.equal(reqEdge.type, "requires_completion");
    });

    it("handles multiple requirements", () => {
      const taskState = {
        taskId: "t1",
        requirements: [{ id: "r1" }, { id: "r2" }, { id: "r3" }],
      };
      const g = buildContextGraph(taskState, {}, []);
      assert.equal(g.getNodes().filter((n) => n.type === "requirement").length, 3);
      assert.equal(g.stats().edgeCount, 3);
      const reqEdges = g.getEdgesFrom("t1").filter((e) => e.type === "requires_completion");
      assert.equal(reqEdges.length, 3);
      assert.ok(reqEdges.some((e) => e.to === "r1"));
      assert.ok(reqEdges.some((e) => e.to === "r2"));
      assert.ok(reqEdges.some((e) => e.to === "r3"));
    });

    it("handles requirements array empty", () => {
      const g = buildContextGraph({ taskId: "t1" }, {}, []);
      assert.equal(g.getNodes().filter((n) => n.type === "requirement").length, 0);
    });

    it("does not create edges when taskId is missing", () => {
      const g = buildContextGraph({ requirements: [{ id: "r1" }] }, {}, []);
      assert.equal(g.stats().edgeCount, 0);
    });
  });

  describe("evidence nodes", () => {
    it("adds evidence nodes from evidenceLineage", () => {
      const evidence = [{ id: "ev-1", content: "Proof data", status: "valid" }];
      const g = buildContextGraph({}, {}, evidence);
      const node = g.getNode("ev-1");
      assert.ok(node);
      assert.equal(node.type, "evidence");
      assert.equal(node.content, "Proof data");
    });

    it("marks verified as true when status is valid", () => {
      const g = buildContextGraph({}, {}, [{ id: "ev-1", status: "valid" }]);
      assert.equal(g.getNode("ev-1").verified, true);
    });

    it("marks verified as false when status is not valid", () => {
      const g = buildContextGraph({}, {}, [{ id: "ev-1", status: "invalid" }]);
      assert.equal(g.getNode("ev-1").verified, false);
    });

    it("marks verified as false when status is missing", () => {
      const g = buildContextGraph({}, {}, [{ id: "ev-1" }]);
      assert.equal(g.getNode("ev-1").verified, false);
    });

    it("defaults content to empty string", () => {
      const g = buildContextGraph({}, {}, [{ id: "ev-1" }]);
      assert.equal(g.getNode("ev-1").content, "");
    });

    it("creates supports edge when requirementId is present and node exists", () => {
      const g = buildContextGraph(
        { taskId: "t1", requirements: [{ id: "r1" }] },
        {},
        [{ id: "ev-1", requirementId: "r1", content: "proof" }]
      );
      const edges = g.getEdgesFrom("ev-1");
      const supEdge = edges.find((e) => e.type === "supports");
      assert.ok(supEdge);
      assert.equal(supEdge.from, "ev-1");
      assert.equal(supEdge.to, "r1");
      assert.equal(supEdge.type, "supports");
    });

    it("does not create supports edge when requirementId is missing", () => {
      const g = buildContextGraph({}, {}, [{ id: "ev-1", content: "proof" }]);
      assert.equal(g.stats().edgeCount, 0);
    });

    it("handles empty evidenceLineage", () => {
      const g = buildContextGraph({}, {}, []);
      assert.equal(g.getNodes().length, 0);
    });

    it("handles null evidenceLineage", () => {
      assert.doesNotThrow(() => buildContextGraph({}, {}, null));
    });
  });

  describe("integration scenarios", () => {
    it("builds complete graph with task, requirements, and evidence", () => {
      const taskState = {
        taskId: "t1",
        contract: { objective: "Implement auth" },
        requirements: [
          { id: "r1", title: "Login" },
          { id: "r2", title: "Logout" },
        ],
      };
      const evidenceLineage = [
        { id: "ev-1", content: "User table", status: "valid", requirementId: "r1" },
        { id: "ev-2", content: "Session store", status: "invalid", requirementId: "r1" },
      ];

      const g = buildContextGraph(taskState, {}, evidenceLineage);

      // Nodes: 1 task + 2 requirements + 2 evidence = 5
      assert.equal(g.getNodes().length, 5);
      assert.ok(g.getNode("t1"));
      assert.ok(g.getNode("r1"));
      assert.ok(g.getNode("r2"));
      assert.ok(g.getNode("ev-1"));
      assert.ok(g.getNode("ev-2"));

      // Edges: 2 requires_completion + 2 supports = 4
      assert.equal(g.stats().edgeCount, 4);

      const reqEdges = g.getEdgesFrom("t1").filter((e) => e.type === "requires_completion");
      assert.equal(reqEdges.length, 2);
      assert.ok(reqEdges.some((e) => e.to === "r1"));
      assert.ok(reqEdges.some((e) => e.to === "r2"));

      const supEv1 = g.getEdgesFrom("ev-1").filter((e) => e.type === "supports");
      assert.equal(supEv1.length, 1);
      assert.equal(supEv1[0].from, "ev-1");
      assert.equal(supEv1[0].to, "r1");

      const supEv2 = g.getEdgesFrom("ev-2").filter((e) => e.type === "supports");
      assert.equal(supEv2.length, 1);
      assert.equal(supEv2[0].from, "ev-2");
      assert.equal(supEv2[0].to, "r1");

      // Verified flags
      assert.equal(g.getNode("ev-1").verified, true);
      assert.equal(g.getNode("ev-2").verified, false);

      // Provenance
      assert.equal(g.getNode("t1").metadata.provenance, "user_decided");
      assert.equal(g.getNode("ev-1").metadata.provenance, "run_execution");
    });

    it("produces empty graph for completely empty state", () => {
      const g = buildContextGraph({}, {}, []);
      assert.equal(g.getNodes().length, 0);
      assert.equal(g.stats().edgeCount, 0);
    });

    it("produces graph with only evidence when no task state", () => {
      const g = buildContextGraph({}, {}, [{ id: "ev-1", content: "x" }]);
      assert.equal(g.getNodes().length, 1);
      assert.equal(g.getNodes()[0].type, "evidence");
    });
  });

  describe("runState parameter", () => {
    it("accepts runState without error (future use)", () => {
      assert.doesNotThrow(() => buildContextGraph({}, { decisions: [] }, []));
    });

    it("does not crash with complex runState", () => {
      const runState = {
        decisions: [{ id: "d1", action: "proceed" }],
        observations: [{ id: "o1", text: "ok" }],
      };
      assert.doesNotThrow(() => buildContextGraph({ taskId: "t1" }, runState, []));
    });
  });

  describe("error handling", () => {
    it("does not throw on malformed requirements", () => {
      assert.doesNotThrow(() =>
        buildContextGraph({ taskId: "t1", requirements: [{}] }, {}, [])
      );
    });

    it("does not throw on malformed evidence", () => {
      assert.doesNotThrow(() => buildContextGraph({}, {}, [{}]));
    });
  });
});
