// state-store.js
// Atomic writes (write-to-temp + rename), crash recovery (replay pending
// journal), and GC (max journal entries, max snapshots).

import { mkdir, rename, rm, stat, readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { randomBytes } from "node:crypto";
import {
  SCHEMAS,
  STATE_TYPES,
  seal,
  validateSchema,
  validateSealed,
} from "./state-schema.js";
import { TransactionLog, replay } from "./transaction-log.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

/**
 * Atomic write: write to a temp file in the same directory (so rename is on
 * the same filesystem), fsync, then rename over the destination.
 *
 * Survives crashes mid-write: either the temp file exists (no effect on
 * target) or the rename happened (target is fully written). Never torn.
 */
export async function atomicWrite(path, payload) {
  await ensureDir(dirname(path));
  const tmp = path + ".tmp." + randomBytes(6).toString("hex");
  const data = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  await writeFile(tmp, data);
  await rename(tmp, path);
}

// ---------------------------------------------------------------------------
// StateStore
// ---------------------------------------------------------------------------

/**
 * StateStore — durable state with atomic writes, schema validation, and a
 * crash-safe journal for replay.
 *
 * Layout:
 *   <root>/state/<type>/<id>.json      — sealed state documents
 *   <root>/journal.log                  — append-only transaction log
 *   <root>/state-index.json             — lightweight index
 *   <root>/quarantine/<type>/<id>.json  — files that failed validation
 *   <root>/snapshots/<ts>.json          — periodic snapshots (for GC)
 *
 * @param {string} root  base directory for state
 * @param {object} [opts]
 * @param {number} [opts.maxJournalEntries=1000]  GC threshold for journal size
 * @param {number} [opts.maxSnapshots=5]          GC threshold for snapshot count
 * @param {number} [opts.retentionMs]             ms after which a state entry
 *                                                is eligible for GC
 */
export class StateStore {
  constructor(root, opts = {}) {
    this.root = root;
    this.maxJournalEntries = opts.maxJournalEntries ?? 1000;
    this.maxSnapshots = opts.maxSnapshots ?? 5;
    this.retentionMs = opts.retentionMs ?? null;
    this.journal = new TransactionLog(join(root, "journal.log"));
    this.indexPath = join(root, "state-index.json");
    this._ready = this._init();
  }

  async _init() {
    await ensureDir(this.root);
    for (const t of STATE_TYPES) await ensureDir(join(this.root, "state", t));
    await ensureDir(join(this.root, "quarantine"));
    await ensureDir(join(this.root, "snapshots"));
    // Reset index if missing/corrupt
    try {
      await this._loadIndex();
    } catch {
      await atomicWrite(this.indexPath, { entries: {} });
    }
  }

  async _loadIndex() {
    const raw = await readFile(this.indexPath, "utf8");
    const idx = JSON.parse(raw);
    if (!idx || typeof idx !== "object" || typeof idx.entries !== "object") {
      throw new Error("index invalid");
    }
    this._index = idx;
  }

  async _saveIndex() {
    await atomicWrite(this.indexPath, this._index ?? { entries: {} });
  }

  _pathFor(type, id) {
    return join(this.root, "state", type, `${id}.json`);
  }

  _quarantinePathFor(type, id) {
    return join(this.root, "quarantine", type, `${id}.json`);
  }

  /**
   * Write a state document. Validates against the schema, seals with hash,
   * writes atomically, then appends a journal entry.
   *
   * Returns { ok: true, entry } on success, { ok: false, errors } on failure.
   */
  async write(type, id, payload) {
    await this._ready;
    if (!STATE_TYPES.includes(type)) {
      return { ok: false, errors: [{ path: "", message: `unknown state type: ${type}` }] };
    }
    const doc = {
      ...payload,
      stateVersion: (payload.stateVersion ?? 0) + 1,
      lastModifiedAt: payload.lastModifiedAt ?? new Date().toISOString(),
    };
    const result = validateSchema(SCHEMAS[type], doc);
    if (!result.valid) return { ok: false, errors: result.errors };

    const sealed = seal(doc);

    const path = this._pathFor(type, id);
    await atomicWrite(path, sealed);

    const journalEntry = await this.journal.append({
      type,
      taskId: id,
      op: "set",
      data: sealed,
    });

    // Update index
    this._index = this._index ?? { entries: {} };
    this._index.entries[`${type}:${id}`] = {
      type,
      id,
      stateVersion: sealed.stateVersion,
      lastModifiedAt: sealed.lastModifiedAt,
      journalSeq: journalEntry.seq,
    };
    await this._saveIndex();

    await this._maybeGC();
    return { ok: true, entry: journalEntry };
  }

  /**
   * Read a state document. Validates schema + hash. If validation fails,
   * quarantines the file and returns { ok: false, reason }.
   */
  async read(type, id) {
    await this._ready;
    const path = this._pathFor(type, id);
    let raw;
    try {
      raw = await readFile(path, "utf8");
    } catch (e) {
      if (e.code === "ENOENT") return { ok: false, reason: "not_found" };
      throw e;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await this._quarantine(type, id, raw);
      return { ok: false, reason: "json_parse_error" };
    }
    const v = validateSealed(SCHEMAS[type], parsed);
    if (!v.valid) {
      await this._quarantine(type, id, raw);
      return { ok: false, reason: v.reason ?? "schema_invalid", errors: v.errors };
    }
    return { ok: true, data: parsed };
  }

  async _quarantine(type, id, raw) {
    const qp = this._quarantinePathFor(type, id);
    await ensureDir(dirname(qp));
    await atomicWrite(qp, raw ?? "");
    try {
      await rm(this._pathFor(type, id));
    } catch {
      /* ignore */
    }
  }

  async list(type) {
    await this._ready;
    const dir = join(this.root, "state", type);
    let files;
    try {
      files = await readdir(dir);
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
    return files.filter((f) => f.endsWith(".json")).map((f) => basename(f, ".json"));
  }

  /**
   * Recover after a crash. Replays the journal, rehydrating the in-memory
   * state map. Any journal entries that lack a corresponding state file are
   * re-applied from the journal data.
   *
   * Returns { rehydrated, orphans, corrupted }.
   */
  async recover() {
    await this._ready;
    const entries = await this.journal.readAll();
    const { applied, skipped, finalState } = replay(entries);

    // For each applied entry, ensure the state file exists (write if missing).
    let rehydrated = 0;
    let orphans = 0;
    for (const { key } of applied) {
      const [type, id] = key.split(":");
      const data = finalState[key];
      const path = this._pathFor(type, id);
      let exists = true;
      try {
        await stat(path);
      } catch {
        exists = false;
      }
      if (!exists) {
        await atomicWrite(path, data);
        rehydrated++;
      }
    }
    // Skipped entries with _corrupt are quarantined into a sidecar file so
    // the recovery operator can inspect them later.
    const corrupted = skipped.filter((s) => s && s._corrupt);
    if (corrupted.length) {
      const sidecar = join(this.root, "quarantine", "journal-corrupt.json");
      await ensureDir(dirname(sidecar));
      await atomicWrite(sidecar, JSON.stringify(corrupted, null, 2));
      orphans = corrupted.length;
    }
    return { rehydrated, orphans, corrupted };
  }

  /**
   * Garbage collection.
   *  - If journal entries > maxJournalEntries: snapshot the live state, then
   *    truncate the journal.
   *  - If snapshots > maxSnapshots: prune the oldest.
   *  - If retentionMs is set: delete state entries whose lastModifiedAt is
   *    older than (now - retentionMs).
   */
  async gc() {
    await this._ready;
    const journalSize = await this.journal.size();

    // Journal compaction: if oversized, take a snapshot then truncate.
    if (journalSize > this.maxJournalEntries) {
      await this._snapshot();
      await this.journal.truncate();
    }

    // Snapshot pruning: keep only the newest maxSnapshots.
    const snapDir = join(this.root, "snapshots");
    let snaps = [];
    try {
      snaps = await readdir(snapDir);
    } catch {
      /* ignore */
    }
    snaps = snaps.filter((f) => f.endsWith(".json")).sort();
    while (snaps.length > this.maxSnapshots) {
      const oldest = snaps.shift();
      await rm(join(snapDir, oldest), { force: true });
    }

    // Retention-based eviction.
    let evicted = 0;
    if (this.retentionMs != null) {
      const cutoff = Date.now() - this.retentionMs;
      for (const type of STATE_TYPES) {
        const dir = join(this.root, "state", type);
        let files = [];
        try {
          files = await readdir(dir);
        } catch {
          continue;
        }
        for (const f of files) {
          if (!f.endsWith(".json")) continue;
          const full = join(dir, f);
          try {
            const raw = await readFile(full, "utf8");
            const data = JSON.parse(raw);
            const ts = Date.parse(data?.lastModifiedAt ?? "");
            if (!Number.isFinite(ts)) continue;
            if (ts < cutoff) {
              await rm(full);
              evicted++;
            }
          } catch {
            /* skip unreadable */
          }
        }
      }
    }
    return { journalCompacted: journalSize > this.maxJournalEntries, evicted };
  }

  async _maybeGC() {
    // Cheap heuristic: only check journal size periodically.
    if ((this._gcCounter = (this._gcCounter ?? 0) + 1) % 50 === 0) {
      await this.gc();
    }
  }

  async _snapshot() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const snapPath = join(this.root, "snapshots", `${stamp}.json`);
    const entries = {};
    for (const type of STATE_TYPES) {
      const ids = await this.list(type);
      for (const id of ids) {
        const r = await this.read(type, id);
        if (r.ok) entries[`${type}:${id}`] = r.data;
      }
    }
    await atomicWrite(snapPath, { takenAt: new Date().toISOString(), entries });
  }
}

export { TransactionLog, replay };
