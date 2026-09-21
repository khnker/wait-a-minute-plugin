// state-store.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore, atomicWrite } from "./state-store.js";
import { TransactionLog } from "./transaction-log.js";
import { verify } from "./state-schema.js";

async function tmpRoot() {
  const dir = await mkdtemp(join(tmpdir(), "wam-store-"));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

const baseAssessment = (overrides = {}) => ({
  taskId: "t-1",
  result: "PASS",
  summary: "ok",
  findings: [],
  ...overrides,
});

const basePlan = (overrides = {}) => ({
  planId: "p-1",
  taskId: "t-1",
  steps: [
    { id: "s-1", status: "pending" },
    { id: "s-2", status: "pending" },
  ],
  ...overrides,
});

const baseCompletion = (overrides = {}) => ({
  taskId: "t-1",
  status: "complete",
  ...overrides,
});

test("atomicWrite: produces a complete file even if rename happens", async () => {
  const { dir, cleanup } = await tmpRoot();
  try {
    const target = join(dir, "sub", "a.json");
    await atomicWrite(target, { hello: "world" });
    const raw = await readFile(target, "utf8");
    assert.match(raw, /"hello"/);
  } finally {
    await cleanup();
  }
});

test("atomicWrite: no torn file — temp files do not remain on success", async () => {
  const { dir, cleanup } = await tmpRoot();
  try {
    const target = join(dir, "a.json");
    await atomicWrite(target, { x: 1 });
    const files = await readdir(dir);
    const temps = files.filter((f) => f.includes(".tmp."));
    assert.equal(temps.length, 0);
  } finally {
    await cleanup();
  }
});

test("write + read: round-trips a sealed assessment", async () => {
  const { dir, cleanup } = await tmpRoot();
  try {
    const store = new StateStore(dir);
    const w = await store.write("assessment", "t-1", baseAssessment());
    assert.equal(w.ok, true);
    const r = await store.read("assessment", "t-1");
    assert.equal(r.ok, true);
    assert.equal(r.data.result, "PASS");
    assert.ok(r.data._hash);
  } finally {
    await cleanup();
  }
});

test("write: rejects schema-invalid payload before commit", async () => {
  const { dir, cleanup } = await tmpRoot();
  try {
    const store = new StateStore(dir);
    // missing taskId and result
    const w = await store.write("assessment", "t-bad", { summary: "nope" });
    assert.equal(w.ok, false);
    assert.ok(w.errors.length > 0);
    // No file should have been created
    const ids = await store.list("assessment");
    assert.deepEqual(ids, []);
  } finally {
    await cleanup();
  }
});

test("read: quarantines a corrupted (hash-mismatched) state file", async () => {
  const { dir, cleanup } = await tmpRoot();
  try {
    const store = new StateStore(dir);
    await store.write("assessment", "t-1", baseAssessment());
    const path = join(dir, "state", "assessment", "t-1.json");
    // Tamper with the file
    const raw = await readFile(path, "utf8");
    const tampered = raw.replace(/"result"\s*:\s*"PASS"/, '"result": "FAIL"');
    await writeFile(path, tampered, "utf8");
    const r = await store.read("assessment", "t-1");
    assert.equal(r.ok, false);
    assert.match(r.reason, /corruption|hash/);
    // Quarantine directory contains the moved file
    const qfiles = await readdir(join(dir, "quarantine", "assessment"));
    assert.equal(qfiles.length, 1);
    // Original location is empty
    const sfiles = await readdir(join(dir, "state", "assessment"));
    assert.equal(sfiles.length, 0);
  } finally {
    await cleanup();
  }
});

test("read: quarantines a JSON-parse error", async () => {
  const { dir, cleanup } = await tmpRoot();
  try {
    const store = new StateStore(dir);
    await store.write("plan", "p-1", basePlan());
    const path = join(dir, "state", "plan", "p-1.json");
    await writeFile(path, "{not valid json", "utf8");
    const r = await store.read("plan", "p-1");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "json_parse_error");
    const qfiles = await readdir(join(dir, "quarantine", "plan"));
    assert.equal(qfiles.length, 1);
  } finally {
    await cleanup();
  }
});

test("read: returns not_found for missing entries", async () => {
  const { dir, cleanup } = await tmpRoot();
  try {
    const store = new StateStore(dir);
    const r = await store.read("assessment", "nope");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "not_found");
  } finally {
    await cleanup();
  }
});

test("crash recovery: state file missing but journal entry exists → rehydrated", async () => {
  const { dir, cleanup } = await tmpRoot();
  try {
    const store1 = new StateStore(dir);
    await store1.write("assessment", "t-1", baseAssessment());
    // Simulate crash: delete the state file but keep the journal
    await rm(join(dir, "state", "assessment", "t-1.json"));
    // New store instance simulates a restart
    const store2 = new StateStore(dir);
    const res = await store2.recover();
    assert.equal(res.rehydrated, 1);
    const r = await store2.read("assessment", "t-1");
    assert.equal(r.ok, true);
    assert.equal(r.data.result, "PASS");
  } finally {
    await cleanup();
  }
});

test("crash recovery: corrupt journal entries are quarantined, not silently dropped", async () => {
  const { dir, cleanup } = await tmpRoot();
  try {
    // Pre-populate a journal with one good and one corrupt entry
    const journal = new TransactionLog(join(dir, "journal.log"));
    await journal.append({ type: "plan", taskId: "p-1", data: { ok: true } });
    await writeFile(join(dir, "journal.log"), (await readFile(join(dir, "journal.log"), "utf8")) + "GARBAGE_LINE\n", "utf8");

    const store = new StateStore(dir);
    const res = await store.recover();
    assert.ok(res.corrupted.length >= 1);
    const sidecarExists = await stat(join(dir, "quarantine", "journal-corrupt.json")).then(() => true).catch(() => false);
    assert.equal(sidecarExists, true);
  } finally {
    await cleanup();
  }
});

test("GC: journal is compacted when entries exceed maxJournalEntries", async () => {
  const { dir, cleanup } = await tmpRoot();
  try {
    const store = new StateStore(dir, { maxJournalEntries: 3 });
    for (let i = 0; i < 5; i++) {
      await store.write("assessment", `t-${i}`, baseAssessment({ taskId: `t-${i}` }));
    }
    const result = await store.gc();
    assert.equal(result.journalCompacted, true);
    // Snapshot directory should have at least one snapshot
    const snaps = await readdir(join(dir, "snapshots"));
    assert.ok(snaps.length >= 1);
  } finally {
    await cleanup();
  }
});

test("GC: snapshots beyond maxSnapshots are pruned (oldest first)", async () => {
  const { dir, cleanup } = await tmpRoot();
  try {
    const store = new StateStore(dir, { maxSnapshots: 2, maxJournalEntries: 2 });
    for (let i = 0; i < 6; i++) {
      await store.write("assessment", `t-${i}`, baseAssessment({ taskId: `t-${i}` }));
    }
    await store.gc();
    const snaps = await readdir(join(dir, "snapshots"));
    assert.ok(snaps.length <= 2);
  } finally {
    await cleanup();
  }
});

test("GC: retention-based eviction removes only expired entries", async () => {
  const { dir, cleanup } = await tmpRoot();
  try {
    const store = new StateStore(dir, { retentionMs: 50 });
    await store.write("assessment", "fresh", baseAssessment({ taskId: "fresh" }));
    // Force an old timestamp on another entry
    await store.write("assessment", "stale", baseAssessment({ taskId: "stale" }));
    const stalePath = join(dir, "state", "assessment", "stale.json");
    const raw = JSON.parse(await readFile(stalePath, "utf8"));
    raw.lastModifiedAt = new Date(Date.now() - 10_000).toISOString();
    await writeFile(stalePath, JSON.stringify(raw), "utf8");
    const result = await store.gc();
    assert.equal(result.evicted, 1);
    const remaining = await readdir(join(dir, "state", "assessment"));
    assert.ok(remaining.includes("fresh.json"));
    assert.ok(!remaining.includes("stale.json"));
  } finally {
    await cleanup();
  }
});

test("list: returns ids of stored documents for a type", async () => {
  const { dir, cleanup } = await tmpRoot();
  try {
    const store = new StateStore(dir);
    await store.write("plan", "p-1", basePlan());
    await store.write("plan", "p-2", basePlan({ planId: "p-2", taskId: "t-2" }));
    const ids = await store.list("plan");
    assert.deepEqual(ids.sort(), ["p-1", "p-2"]);
  } finally {
    await cleanup();
  }
});

test("concurrent writes to the same task are serialized (state file is consistent)", async () => {
  const { dir, cleanup } = await tmpRoot();
  try {
    const store = new StateStore(dir);
    const writes = Array.from({ length: 10 }, (_, i) =>
      store.write("assessment", "t-1", baseAssessment({ summary: `v${i}` }))
    );
    const results = await Promise.all(writes);
    assert.ok(results.every((r) => r.ok));
    const r = await store.read("assessment", "t-1");
    assert.equal(r.ok, true);
    // Final state must be a valid sealed payload
    assert.ok(r.data._hash);
    assert.equal(verify(r.data).valid, true);
  } finally {
    await cleanup();
  }
});
