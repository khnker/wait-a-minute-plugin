/**
 * wam-state.js — Wait-a-Minute session state management.
 *
 * Provides CRUD for WAM (Wait-a-Minute) session state persisted to disk,
 * session resumption, and schema migration utilities.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

// ── Constants ────────────────────────────────────────────────
export const SCHEMA_VERSION = 1;
export const STATE_FILENAME = 'wam-state.json';

/**
 * Returns the current schema version number.
 * @param {object} [state] — optional state object to inspect for its version
 * @returns {number} schema version
 */
export function getSchemaVersion(state) {
  if (state && typeof state === 'object' && '_schemaVersion' in state) {
    return state._schemaVersion;
  }
  return SCHEMA_VERSION;
}

/**
 * Creates a new WAM state object.
 * @param {string} taskId
 * @param {object} [requirements={}]
 * @param {object} [context={}]
 * @param {object} [evidence={}]
 * @returns {object} the created state
 */
export function createWamState(taskId, requirements = {}, context = {}, evidence = {}) {
  const now = new Date().toISOString();
  return {
    _schemaVersion: SCHEMA_VERSION,
    taskId,
    createdAt: now,
    updatedAt: now,
    requirements,
    context,
    evidence,
    status: 'active',
  };
}

/**
 * Saves WAM state to disk.
 * @param {string} taskId
 * @param {object} state
 * @param {string} rootDir
 * @returns {Promise<string>} resolved file path
 */
export async function saveWamState(taskId, state, rootDir) {
  const dir = path.join(rootDir, taskId);
  await fs.mkdir(dir, { recursive: true });
  state.updatedAt = new Date().toISOString();
  const filePath = path.join(dir, STATE_FILENAME);
  await fs.writeFile(filePath, JSON.stringify(state, null, 2));
  return filePath;
}

/**
 * Loads WAM state from disk.
 * @param {string} taskId
 * @param {string} rootDir
 * @returns {Promise<object|null>} the loaded state or null if not found
 */
export async function loadWamState(taskId, rootDir) {
  const filePath = path.join(rootDir, taskId, STATE_FILENAME);
  try {
    await fs.access(filePath);
  } catch {
    return null;
  }
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Resumes a session from a loaded WAM state.
 * Returns a resume descriptor with metadata about the session to continue.
 * @param {object} wamState
 * @returns {object} resume descriptor
 */
export function resumeSession(wamState) {
  if (!wamState || typeof wamState !== 'object') {
    return {
      resumable: false,
      reason: 'No valid state provided',
      taskId: null,
    };
  }

  if (wamState.status === 'completed') {
    return {
      resumable: false,
      reason: 'Session already completed',
      taskId: wamState.taskId ?? null,
    };
  }

  return {
    resumable: true,
    taskId: wamState.taskId ?? null,
    status: wamState.status ?? 'unknown',
    createdAt: wamState.createdAt,
    updatedAt: wamState.updatedAt,
    schemaVersion: getSchemaVersion(wamState),
    hasRequirements: Boolean(wamState.requirements && Object.keys(wamState.requirements).length > 0),
    hasContext: Boolean(wamState.context && Object.keys(wamState.context).length > 0),
    hasEvidence: Boolean(wamState.evidence && Object.keys(wamState.evidence).length > 0),
  };
}

/**
 * Migrates an old-format WAM state to the current schema version.
 * Handles common migration scenarios: adding missing fields, renaming
 * deprecated keys, and setting default values.
 * @param {object} oldState
 * @returns {object} migrated state
 */
export function migrateWamState(oldState) {
  if (!oldState || typeof oldState !== 'object') {
    return createWamState('migrated-empty');
  }

  const migrated = { ...oldState };

  if (!('_schemaVersion' in migrated)) {
    migrated._schemaVersion = 0;
  }

  // Migration from v0 → v1
  if (migrated._schemaVersion < 1) {
    if (!migrated.createdAt) migrated.createdAt = new Date().toISOString();
    if (!migrated.updatedAt) migrated.updatedAt = migrated.createdAt;
    if (!migrated.requirements) migrated.requirements = {};
    if (!migrated.context) migrated.context = {};
    if (!migrated.evidence) migrated.evidence = {};
    if (!migrated.status) migrated.status = 'active';
    migrated._schemaVersion = SCHEMA_VERSION;
  }

  return migrated;
}
