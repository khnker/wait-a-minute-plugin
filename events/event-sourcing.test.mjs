/**
 * Tests for Event Sourcing.
 * Run: node --test events/event-sourcing.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createEventStore } from "./event-sourcing.js";

test("eventStore: append returns event with seq and timestamp", () => {
  const store = createEventStore();
  const ev = store.append("s1", "Created", { id: 1 });
  assert.equal(ev.seq, 1);
  assert.equal(ev.streamId, "s1");
  assert.equal(ev.type, "Created");
  assert.deepEqual(ev.payload, { id: 1 });
  assert.ok(ev.timestamp > 0);
});

test("eventStore: append increments seq globally", () => {
  const store = createEventStore();
  const a = store.append("s1", "A");
  const b = store.append("s2", "B");
  assert.equal(a.seq, 1);
  assert.equal(b.seq, 2);
});

test("eventStore: query returns events for stream only", () => {
  const store = createEventStore();
  store.append("s1", "A");
  store.append("s2", "B");
  store.append("s1", "C");
  assert.equal(store.query("s1").length, 2);
  assert.equal(store.query("s2").length, 1);
  assert.equal(store.query("s3").length, 0);
});

test("eventStore: reduce folds events via reducer", () => {
  const store = createEventStore();
  store.append("counter", "inc", 1);
  store.append("counter", "inc", 2);
  store.append("counter", "inc", 3);
  const total = store.reduce("counter", (s, e) => s + e.payload, 0);
  assert.equal(total, 6);
});

test("eventStore: reduce with empty stream returns initial", () => {
  const store = createEventStore();
  const r = store.reduce("nope", (s, e) => s, "default");
  assert.equal(r, "default");
});

test("eventStore: totalEvents counts across all streams", () => {
  const store = createEventStore();
  store.append("a", "x");
  store.append("a", "y");
  store.append("b", "z");
  assert.equal(store.totalEvents(), 3);
});

test("eventStore: streams lists unique stream ids", () => {
  const store = createEventStore();
  store.append("a", "x");
  store.append("b", "y");
  store.append("a", "z");
  assert.deepEqual(store.streams().sort(), ["a", "b"]);
});

test("eventStore: append throws on missing args", () => {
  const store = createEventStore();
  assert.throws(() => store.append("", "x"), /streamId/);
  assert.throws(() => store.append("s", ""), /type/);
});
