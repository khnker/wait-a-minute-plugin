import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import {
  getSchemaVersion,
  createWamState,
  saveWamState,
  loadWamState,
  resumeSession,
  migrateWamState,
  SCHEMA_VERSION,
} from './wam-state.js';

let tmpRoot;

beforeEach(async () => {
  tmpRoot = path.join(os.tmpdir(), `wam-state-test-${process.pid}-${Date.now()}`);
  await fs.mkdir(tmpRoot, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
});

// ── getSchemaVersion ──────────────────────────────────────────────

describe('getSchemaVersion()', () => {
  it('returns SCHEMA_VERSION when called without arguments', () => {
    assert.equal(getSchemaVersion(), SCHEMA_VERSION);
  });

  it('returns SCHEMA_VERSION for non-object input', () => {
    assert.equal(getSchemaVersion(null), SCHEMA_VERSION);
    assert.equal(getSchemaVersion(42), SCHEMA_VERSION);
    assert.equal(getSchemaVersion('hello'), SCHEMA_VERSION);
  });

  it('returns _schemaVersion from state when present', () => {
    assert.equal(getSchemaVersion({ _schemaVersion: 3 }), 3);
  });
});

// ── createWamState ────────────────────────────────────────────────

describe('createWamState()', () => {
  it('creates a state object with all required fields', () => {
    const state = createWamState('task-1', { req: 1 }, { ctx: 1 }, { ev: 1 });
    assert.equal(state.taskId, 'task-1');
    assert.equal(state._schemaVersion, SCHEMA_VERSION);
    assert.equal(state.status, 'active');
    assert.ok(state.createdAt);
    assert.ok(state.updatedAt);
    assert.deepEqual(state.requirements, { req: 1 });
    assert.deepEqual(state.context, { ctx: 1 });
    assert.deepEqual(state.evidence, { ev: 1 });
  });

  it('uses default empty objects for omitted args', () => {
    const state = createWamState('task-2');
    assert.deepEqual(state.requirements, {});
    assert.deepEqual(state.context, {});
    assert.deepEqual(state.evidence, {});
  });

  it('sets createdAt and updatedAt to the same timestamp', () => {
    const before = Date.now();
    const state = createWamState('task-3');
    const after = Date.now();
    const created = new Date(state.createdAt).getTime();
    const updated = new Date(state.updatedAt).getTime();
    assert.ok(created >= before && created <= after);
    assert.equal(created, updated);
  });

  it('does not mutate the input objects', () => {
    const req = { a: 1 };
    const ctx = { b: 2 };
    const ev = { c: 3 };
    createWamState('task-4', req, ctx, ev);
    assert.deepEqual(req, { a: 1 });
    assert.deepEqual(ctx, { b: 2 });
    assert.deepEqual(ev, { c: 3 });
  });
});

// ── saveWamState / loadWamState ───────────────────────────────────

describe('saveWamState()', () => {
  it('saves state to disk and returns the file path', async () => {
    const state = createWamState('task-save');
    const filePath = await saveWamState('task-save', state, tmpRoot);
    assert.ok(filePath.endsWith('wam-state.json'));
    assert.ok(filePath.startsWith(tmpRoot));
  });

  it('creates the task directory recursively', async () => {
    const state = createWamState('task-nested');
    const targetRoot = path.join(tmpRoot, 'deep', 'nested');
    await saveWamState('task-nested', state, targetRoot);
    const file = path.join(targetRoot, 'task-nested', 'wam-state.json');
    const exists = await fs.access(file).then(() => true).catch(() => false);
    assert.ok(exists);
  });

  it('updates updatedAt when saving', async () => {
    const state = createWamState('task-ts');
    state.updatedAt = '2026-01-01T00:00:00.000Z';
    await saveWamState('task-ts', state, tmpRoot);
    const loaded = await loadWamState('task-ts', tmpRoot);
    // saveWamState stamps updatedAt to current time
    assert.ok(loaded.updatedAt);
    assert.equal(typeof loaded.updatedAt, 'string');
    assert.ok(Date.parse(loaded.updatedAt) > 0);
  });
});

describe('loadWamState()', () => {
  it('loads a previously saved state', async () => {
    const original = createWamState('task-load');
    await saveWamState('task-load', original, tmpRoot);
    const loaded = await loadWamState('task-load', tmpRoot);
    assert.equal(loaded.taskId, 'task-load');
    assert.equal(loaded._schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(loaded.requirements, original.requirements);
  });

  it('returns null when the task directory does not exist', async () => {
    const loaded = await loadWamState('nonexistent', tmpRoot);
    assert.equal(loaded, null);
  });

  it('returns null when the state file is missing', async () => {
    await fs.mkdir(path.join(tmpRoot, 'empty-task'), { recursive: true });
    const loaded = await loadWamState('empty-task', tmpRoot);
    assert.equal(loaded, null);
  });
});

// ── resumeSession ─────────────────────────────────────────────────

describe('resumeSession()', () => {
  it('returns resumable=true for active session', () => {
    const state = createWamState('task-resume');
    const result = resumeSession(state);
    assert.equal(result.resumable, true);
    assert.equal(result.taskId, 'task-resume');
    assert.equal(result.status, 'active');
  });

  it('returns resumable=false for completed session', () => {
    const state = createWamState('task-done');
    state.status = 'completed';
    const result = resumeSession(state);
    assert.equal(result.resumable, false);
    assert.ok(result.reason.includes('completed'));
  });

  it('returns resumable=false for null input', () => {
    const result = resumeSession(null);
    assert.equal(result.resumable, false);
    assert.ok(result.reason);
    assert.equal(result.taskId, null);
  });

  it('returns resumable=false for undefined input', () => {
    const result = resumeSession(undefined);
    assert.equal(result.resumable, false);
  });

  it('returns resumable=false for non-object input', () => {
    const result = resumeSession('invalid');
    assert.equal(result.resumable, false);
  });

  it('includes feature flags in result for active session', () => {
    const state = createWamState('task-flags', { r1: 1 }, { c1: 1 }, { e1: 1 });
    const result = resumeSession(state);
    assert.equal(result.hasRequirements, true);
    assert.equal(result.hasContext, true);
    assert.equal(result.hasEvidence, true);
    assert.ok('schemaVersion' in result);
  });

  it('flags false when sections are empty', () => {
    const state = createWamState('task-empty');
    const result = resumeSession(state);
    assert.equal(result.hasRequirements, false);
    assert.equal(result.hasContext, false);
    assert.equal(result.hasEvidence, false);
  });
});

// ── migrateWamState ───────────────────────────────────────────────

describe('migrateWamState()', () => {
  it('creates a default state for null input', () => {
    const result = migrateWamState(null);
    assert.equal(result.taskId, 'migrated-empty');
    assert.equal(result._schemaVersion, SCHEMA_VERSION);
  });

  it('creates a default state for undefined input', () => {
    const result = migrateWamState(undefined);
    assert.equal(result.taskId, 'migrated-empty');
  });

  it('creates a default state for non-object input', () => {
    const result = migrateWamState('bad');
    assert.equal(result.taskId, 'migrated-empty');
  });

  it('migrates v0 state to v1 by adding defaults', () => {
    const oldState = { _schemaVersion: 0, taskId: 'old-task' };
    const result = migrateWamState(oldState);
    assert.equal(result._schemaVersion, 1);
    assert.ok(result.createdAt);
    assert.ok(result.updatedAt);
    assert.deepEqual(result.requirements, {});
    assert.deepEqual(result.context, {});
    assert.deepEqual(result.evidence, {});
    assert.equal(result.status, 'active');
  });

  it('preserves existing data when migrating', () => {
    const oldState = {
      _schemaVersion: 0,
      taskId: 'old-task',
      customField: 'value',
      requirements: { important: true },
    };
    const result = migrateWamState(oldState);
    assert.equal(result.customField, 'value');
    assert.deepEqual(result.requirements, { important: true });
    assert.equal(result._schemaVersion, 1);
  });

  it('leaves v1+ state unchanged (except ensuring version)', () => {
    const state = createWamState('v1-task');
    const result = migrateWamState(state);
    assert.equal(result.taskId, 'v1-task');
    assert.equal(result._schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(result.requirements, state.requirements);
  });

  it('handles state without _schemaVersion (assumes v0)', () => {
    const oldState = { taskId: 'no-version-task', status: 'active' };
    const result = migrateWamState(oldState);
    assert.equal(result._schemaVersion, 1);
    assert.ok(result.createdAt);
    assert.deepEqual(result.requirements, {});
  });
});
