/**
 * Tests for context-feedback-loop.js (Change 77)
 * Ejecutar: node --test context-feedback-loop.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  createFeedbackLoop,
  FeedbackLoop,
} from "./context-feedback-loop.js";

// -- createFeedbackLoop ------------------------------------------------------

test("createFeedbackLoop: returns FeedbackLoop instance", () => {
  const loop = createFeedbackLoop();
  assert.ok(loop instanceof FeedbackLoop);
});

// -- FeedbackLoop: record ----------------------------------------------------

test("FeedbackLoop: record basic event", () => {
  const loop = new FeedbackLoop();
  loop.record({ queryId: "q1", itemId: "i1", source: "src1", type: "observation", useful: true });
  const stats = loop.getItemStats("i1");
  assert.ok(stats, "Item stats exist");
  assert.equal(stats.total, 1);
  assert.equal(stats.useful, 1);
  assert.equal(stats.useless, 0);
  assert.equal(stats.score, 1);
});

test("FeedbackLoop: record useless event", () => {
  const loop = new FeedbackLoop();
  loop.record({ queryId: "q1", itemId: "i1", source: "src1", type: "observation", useful: false });
  const stats = loop.getItemStats("i1");
  assert.equal(stats.total, 1);
  assert.equal(stats.useful, 0);
  assert.equal(stats.useless, 1);
  assert.equal(stats.score, 0);
});

test("FeedbackLoop: record multiple events for same item", () => {
  const loop = new FeedbackLoop();
  loop.record({ queryId: "q1", itemId: "i1", source: "src1", type: "observation", useful: true });
  loop.record({ queryId: "q2", itemId: "i1", source: "src1", type: "observation", useful: false });
  const stats = loop.getItemStats("i1");
  assert.equal(stats.total, 2);
  assert.equal(stats.useful, 1);
  assert.equal(stats.useless, 1);
  assert.equal(stats.score, 0.5);
});

test("FeedbackLoop: record throws on missing fields", () => {
  const loop = new FeedbackLoop();
  assert.throws(() => loop.record({}), TypeError);
  assert.throws(() => loop.record({ queryId: "q1" }), TypeError);
  assert.throws(() => loop.record({ itemId: "i1" }), TypeError);
  assert.throws(() => loop.record({ queryId: "q1", itemId: "i1", useful: "yes" }), TypeError);
});

test("FeedbackLoop: getEvents returns copy", () => {
  const loop = new FeedbackLoop();
  loop.record({ queryId: "q1", itemId: "i1", source: "s1", type: "t1", useful: true });
  const events = loop.getEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].queryId, "q1");
  // Should be a copy
  events.pop();
  assert.equal(loop.getEvents().length, 1);
});

test("FeedbackLoop: record updates source stats", () => {
  const loop = new FeedbackLoop();
  loop.record({ queryId: "q1", itemId: "i1", source: "src1", type: "t1", useful: true });
  loop.record({ queryId: "q2", itemId: "i2", source: "src1", type: "t1", useful: false });
  const srcStats = loop.getSourceStats("src1");
  assert.equal(srcStats.total, 2);
  assert.equal(srcStats.score, 0.5);
});

test("FeedbackLoop: getSourceStats returns undefined for unknown source", () => {
  const loop = new FeedbackLoop();
  assert.equal(loop.getSourceStats("nonexistent"), undefined);
});

// -- FeedbackLoop: analysis --------------------------------------------------

test("FeedbackLoop: overallScore returns 0 for empty", () => {
  const loop = new FeedbackLoop();
  assert.equal(loop.overallScore(), 0);
});

test("FeedbackLoop: overallScore computes correct ratio", () => {
  const loop = new FeedbackLoop();
  loop.record({ queryId: "q1", itemId: "i1", source: "s1", type: "t1", useful: true });
  loop.record({ queryId: "q2", itemId: "i2", source: "s1", type: "t1", useful: true });
  loop.record({ queryId: "q3", itemId: "i3", source: "s1", type: "t1", useful: false });
  assert.equal(loop.overallScore(), 2 / 3);
});

test("FeedbackLoop: getUselessItems with default threshold", () => {
  const loop = new FeedbackLoop();
  for (let i = 0; i < 3; i++) {
    loop.record({ queryId: `q${i}`, itemId: "bad_item", source: "s1", type: "t1", useful: false });
  }
  assert.deepEqual(loop.getUselessItems(), ["bad_item"]);
});

test("FeedbackLoop: getUselessItems below threshold", () => {
  const loop = new FeedbackLoop();
  loop.record({ queryId: "q1", itemId: "item", source: "s1", type: "t1", useful: false });
  assert.equal(loop.getUselessItems().length, 0);
});

test("FeedbackLoop: getUselessItems with custom threshold", () => {
  const loop = new FeedbackLoop();
  loop.record({ queryId: "q1", itemId: "a", source: "s1", type: "t1", useful: false });
  loop.record({ queryId: "q2", itemId: "a", source: "s1", type: "t1", useful: false });
  assert.deepEqual(loop.getUselessItems(2), ["a"]);
  assert.deepEqual(loop.getUselessItems(3), []);
});

test("FeedbackLoop: getLowPerformSources", () => {
  const loop = new FeedbackLoop();
  loop.record({ queryId: "q1", itemId: "i1", source: "bad_src", type: "t1", useful: false });
  loop.record({ queryId: "q2", itemId: "i2", source: "bad_src", type: "t1", useful: false });
  loop.record({ queryId: "q3", itemId: "i3", source: "good_src", type: "t1", useful: true });
  loop.record({ queryId: "q4", itemId: "i4", source: "good_src", type: "t1", useful: true });
  const low = loop.getLowPerformSources(0.2);
  assert.ok(low.includes("bad_src"));
  assert.ok(!low.includes("good_src"));
});

test("FeedbackLoop: getTopItems", () => {
  const loop = new FeedbackLoop();
  loop.record({ queryId: "q1", itemId: "i1", source: "s1", type: "t1", useful: true });
  loop.record({ queryId: "q2", itemId: "i2", source: "s1", type: "t1", useful: true });
  loop.record({ queryId: "q3", itemId: "i3", source: "s1", type: "t1", useful: false });
  const top = loop.getTopItems();
  assert.ok(top.includes("i1"));
  assert.ok(top.includes("i2"));
  assert.ok(!top.includes("i3"));
});

test("FeedbackLoop: summary", () => {
  const loop = new FeedbackLoop();
  loop.record({ queryId: "q1", itemId: "i1", source: "s1", type: "t1", useful: true });
  const summary = loop.summary();
  assert.equal(summary.totalEvents, 1);
  assert.equal(summary.overallScore, 1);
  assert.equal(summary.uniqueItems, 1);
  assert.ok(Array.isArray(summary.topSources));
});

test("FeedbackLoop: reset clears all data", () => {
  const loop = new FeedbackLoop();
  loop.record({ queryId: "q1", itemId: "i1", source: "s1", type: "t1", useful: true });
  loop.reset();
  assert.equal(loop.getEvents().length, 0);
  assert.equal(loop.overallScore(), 0);
  assert.equal(loop.summary().totalEvents, 0);
});

// -- Multiple items/sources --------------------------------------------------

test("FeedbackLoop: handles multiple items independently", () => {
  const loop = new FeedbackLoop();
  loop.record({ queryId: "q1", itemId: "a", source: "s1", type: "t1", useful: true });
  loop.record({ queryId: "q2", itemId: "b", source: "s1", type: "t1", useful: false });
  loop.record({ queryId: "q3", itemId: "a", source: "s1", type: "t1", useful: true });

  const aStats = loop.getItemStats("a");
  const bStats = loop.getItemStats("b");

  assert.equal(aStats.score, 1);
  assert.equal(bStats.score, 0);
});
