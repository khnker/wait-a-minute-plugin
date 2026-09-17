import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ingestContextEvent,
  getContextEvents,
  getLastContextEvent,
  resetContextEventBus,
  emitToolStarted,
  emitToolFinished,
  emitObservation,
  CONTEXT_EVENT_TYPES,
} from "./context-event-ingress.js";

test("context-event: ingestToolStarted emits TOOL_STARTED event", () => {
  resetContextEventBus();
  const event = emitToolStarted({ taskId: "T1", callID: "c1", tool: "bash", args: { command: "ls" } });
  assert.equal(event.type, CONTEXT_EVENT_TYPES.TOOL_STARTED);
  assert.equal(event.taskId, "T1");
  assert.equal(event.executionId, "c1");
  assert.equal(event.payload.tool, "bash");
  assert.ok(event.id, "event has ID");
  assert.ok(event.timestamp > 0);
});

test("context-event: emitToolFinished and emitObservation record events", () => {
  resetContextEventBus();
  emitToolStarted({ taskId: "T1", callID: "c1", tool: "bash" });
  const finished = emitToolFinished({ taskId: "T1", callID: "c1", tool: "bash", result: "ok" });
  const obs = emitObservation({ taskId: "T1", experimentId: "e1", assessment: "SUPPORTED", executionId: "c1" });
  assert.equal(finished.type, CONTEXT_EVENT_TYPES.TOOL_FINISHED);
  assert.equal(obs.type, CONTEXT_EVENT_TYPES.OBSERVATION_RECORDED);
  const events = getContextEvents({ taskId: "T1" });
  assert.equal(events.length, 3);
});

test("context-event: getLastContextEvent returns most recent of type", () => {
  resetContextEventBus();
  emitToolStarted({ taskId: "T1", callID: "c1", tool: "bash" });
  emitToolFinished({ taskId: "T1", callID: "c1", tool: "bash", result: "ok" });
  emitToolStarted({ taskId: "T1", callID: "c2", tool: "read" });
  emitToolFinished({ taskId: "T1", callID: "c2", tool: "read", result: "data" });

  const lastStart = getLastContextEvent("T1", CONTEXT_EVENT_TYPES.TOOL_STARTED);
  assert.equal(lastStart.executionId, "c2", "last TOOL_STARTED is c2");
  const lastFinish = getLastContextEvent("T1", CONTEXT_EVENT_TYPES.TOOL_FINISHED);
  assert.equal(lastFinish.executionId, "c2", "last TOOL_FINISHED is c2");
});

test("context-event: invalid type throws", () => {
  resetContextEventBus();
  assert.throws(() => ingestContextEvent({ type: "INVALID", taskId: "T1" }), /Invalid event type/);
});

test("context-event: missing taskId throws", () => {
  resetContextEventBus();
  assert.throws(() => ingestContextEvent({ type: CONTEXT_EVENT_TYPES.TASK_CREATED }), /taskId/);
});

test("context-event: filter by taskId and type works", () => {
  resetContextEventBus();
  emitToolStarted({ taskId: "T1", callID: "c1", tool: "bash" });
  emitToolStarted({ taskId: "T2", callID: "c2", tool: "read" });
  emitObservation({ taskId: "T1", experimentId: "e1", assessment: "SUPPORTED" });
  
  const t1events = getContextEvents({ taskId: "T1" });
  assert.equal(t1events.length, 2);
  
  const t1Starts = getContextEvents({ taskId: "T1", type: CONTEXT_EVENT_TYPES.TOOL_STARTED });
  assert.equal(t1Starts.length, 1);
});
