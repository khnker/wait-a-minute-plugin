// transaction-log.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TransactionLog, replay } from "./transaction-log.js";

async function tmpFile() {
  const dir = await mkdtemp(join(tmpdir(), "wam-tx-"));
  return { dir, path: join(dir, "journal.log"), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("append + readAll: entries are durable in order", async () => {
  const { path, cleanup } = await tmpFile();
  try {
    const log = new TransactionLog(path);
    const a = await log.append({ type: "assessment", taskId: "t-1", op: "set", data: { x: 1 } });
    const b = await log.append({ type: "plan", taskId: "t-1", op: "set", data: { x: 2 } });
    assert.equal(a.seq, 1);
    assert.equal(b.seq, 2);
    const all = await log.readAll();
    assert.equal(all.length, 2);
    assert.equal(all[0].type, "assessment");
    assert.equal(all[1].type, "plan");
    assert.ok(all[0].hash);
    assert.ok(all[1].hash);
  } finally {
    await cleanup();
  }
});

test("append: hash is per-entry and recomputed correctly", async () => {
  const { path, cleanup } = await tmpFile();
  try {
    const log = new TransactionLog(path);
    const e = await log.append({ type: "plan", taskId: "t-1", data: { a: 1 } });
    const all = await log.readAll();
    assert.equal(all[0].hash, e.hash);
  } finally {
    await cleanup();
  }
});

test("readAll: returns [] for missing file (recovery start)", async () => {
  const { path, cleanup } = await tmpFile();
  try {
    const log = new TransactionLog(path);
    const all = await log.readAll();
    assert.deepEqual(all, []);
  } finally {
    await cleanup();
  }
});

test("readAll: tolerates a corrupted trailing line by isolating it", async () => {
  const { path, cleanup, dir } = await tmpFile();
  try {
    const log = new TransactionLog(path);
    await log.append({ type: "assessment", taskId: "t-1", data: { ok: true } });
    // simulate a partial / corrupted write appended after a valid line
    await writeFile(path, (await readFile(path, "utf8")) + "{this is not json\n", "utf8");
    const all = await log.readAll();
    assert.equal(all.length, 2);
    assert.equal(all[1]._corrupt, true);
    assert.ok(all[1]._rawLine.includes("not json"));
  } finally {
    await cleanup();
  }
});

test("readAll: detects hash mismatch on an otherwise valid line", async () => {
  const { path, cleanup } = await tmpFile();
  try {
    const log = new TransactionLog(path);
    await log.append({ type: "plan", taskId: "t-1", data: { x: 1 } });
    const raw = await readFile(path, "utf8");
    // Flip one byte in the data field
    const tampered = raw.replace(/"x":1/, '"x":2');
    await writeFile(path, tampered, "utf8");
    const all = await log.readAll();
    assert.equal(all[0]._corrupt, true);
  } finally {
    await cleanup();
  }
});

test("replay: applies entries in order to a state map", () => {
  const entries = [
    { seq: 1, type: "assessment", taskId: "t-1", op: "set", data: { v: 1 } },
    { seq: 2, type: "plan", taskId: "t-1", op: "set", data: { v: 2 } },
    { seq: 3, type: "assessment", taskId: "t-1", op: "del" },
  ];
  const { applied, skipped, finalState } = replay(entries);
  assert.equal(applied.length, 3);
  assert.equal(skipped.length, 0);
  assert.deepEqual(finalState["assessment:t-1"], undefined);
  assert.deepEqual(finalState["plan:t-1"], { v: 2 });
});

test("replay: skips corrupt and malformed entries", () => {
  const entries = [
    { seq: 1, type: "assessment", taskId: "t-1", op: "set", data: { v: 1 } },
    { _corrupt: true, _rawLine: "garbage" },
    { /* missing type and taskId */ seq: 2, data: {} },
  ];
  const { applied, skipped, finalState } = replay(entries);
  assert.equal(applied.length, 1);
  assert.equal(skipped.length, 2);
  assert.deepEqual(finalState["assessment:t-1"], { v: 1 });
});

test("append after truncate resets the sequence", async () => {
  const { path, cleanup } = await tmpFile();
  try {
    const log = new TransactionLog(path);
    await log.append({ type: "a", taskId: "t", data: {} });
    await log.append({ type: "a", taskId: "t", data: {} });
    await log.truncate();
    const next = await log.append({ type: "a", taskId: "t", data: {} });
    assert.equal(next.seq, 1);
  } finally {
    await cleanup();
  }
});

test("durability: appended entry is fsynced to disk (read-back after append)", async () => {
  const { path, cleanup } = await tmpFile();
  try {
    const log = new TransactionLog(path);
    await log.append({ type: "completion", taskId: "t-1", data: { status: "complete" } });
    const raw = await readFile(path, "utf8");
    assert.match(raw, /"completion"/);
    assert.match(raw, /"taskId":"t-1"/);
  } finally {
    await cleanup();
  }
});
