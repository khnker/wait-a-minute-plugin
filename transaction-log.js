// transaction-log.js
// Append-only journal of state mutations with durability guarantees.
// Each entry is one line of canonical JSON, fsynced before returning.

import { appendFile, open, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// Canonical JSON (shared semantic with state-schema.js but kept local so this
// file is usable independently — no cross-file coupling for the journal).
// ---------------------------------------------------------------------------

function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}

function entryHash(entry) {
  const { hash, _corrupt, _rawLine, ...rest } = entry;
  return createHash("sha256").update(canonical(rest)).digest("hex");
}

// ---------------------------------------------------------------------------
// AppendLog
// ---------------------------------------------------------------------------

/**
 * Append-only journal. Each append() is atomic (single write + fsync of the
 * file descriptor). Reads return all entries from disk in append order.
 *
 * Recovery: caller replays entries from disk after a crash. The journal never
 * overwrites prior entries; partial writes are detectable via per-entry hash.
 */
export class TransactionLog {
  /**
   * @param {string} path  absolute path to the journal file
   * @param {object} [opts]
   * @param {string} [opts.dir]  directory to ensure exists
   */
  constructor(path, opts = {}) {
    this.path = path;
    this.dir = opts.dir ?? dirname(path);
    this._seq = 0;
    this._ready = this._init();
  }

  async _init() {
    await mkdir(this.dir, { recursive: true });
  }

  async append(op) {
    await this._ready;
    const entry = {
      seq: ++this._seq,
      ts: new Date().toISOString(),
      ...op,
    };
    entry.hash = entryHash(entry);
    const line = canonical(entry) + "\n";
    // appendFile is atomic for small writes < PIPE_BUF; we also explicitly
    // fsync via a handle so the kernel commits to disk before we return.
    const fh = await open(this.path, "a");
    try {
      await fh.appendFile(line);
      await fh.sync();
    } finally {
      await fh.close();
    }
    return entry;
  }

  /** Read all entries. Skips lines that fail to parse (corruption isolation). */
  async readAll() {
    await this._ready;
    let raw = "";
    try {
      const fh = await open(this.path, "r");
      try {
        raw = await fh.readFile("utf8");
      } finally {
        await fh.close();
      }
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
    const out = [];
    const lines = raw.split("\n");
    for (const line of lines) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        // Per-entry hash check; treat mismatch as corruption but include line
        // so caller can quarantine it explicitly if needed.
        if (entry && entry.hash && entry.hash !== entryHash(entry)) {
          out.push({ ...entry, _corrupt: true });
        } else {
          out.push(entry);
        }
      } catch {
        out.push({ _corrupt: true, _rawLine: line });
      }
    }
    return out;
  }

  /** Number of valid entries currently on disk. */
  async size() {
    const all = await this.readAll();
    return all.filter((e) => !e._corrupt).length;
  }

  /** Truncate the journal. Used by GC after compaction. */
  async truncate() {
    await this._ready;
    await rename(this.path, this.path + ".truncated-" + Date.now()).catch(() => {});
    this._seq = 0;
  }
}

/**
 * Replay a list of journal entries, applying each to a state map.
 * - Skips entries with _corrupt: true
 * - Returns { applied, skipped, finalState }
 *
 * Each entry's payload is expected to be { type, taskId, data, op? } where
 * op is "set" (default) or "del". Replay is idempotent by (seq).
 */
export function replay(entries, initialState = {}) {
  const applied = [];
  const skipped = [];
  const state = { ...initialState };

  for (const entry of entries) {
    if (!entry || entry._corrupt) {
      skipped.push(entry);
      continue;
    }
    const { seq, type, taskId, data, op = "set" } = entry;
    if (!type || !taskId) {
      skipped.push(entry);
      continue;
    }
    const key = `${type}:${taskId}`;
    if (op === "del") {
      delete state[key];
    } else {
      state[key] = data;
    }
    applied.push({ seq, key, op });
  }

  return { applied, skipped, finalState: state };
}
