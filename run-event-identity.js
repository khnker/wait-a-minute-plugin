/**
 * Run Event Identity — scoped, stable event IDs.
 *
 * Events use composite IDs: <runId>:<type>:<sequence>
 *
 * Format:
 *   run-003:act:001
 *   run-003:obs:004
 *   run-003:dec:002
 *   run-003:ev:003
 *
 * Benefits:
 *   - Unique within task (different runs have different prefixes)
 *   - Readable and debuggable
 *   - Legacy IDs still supported for backward compatibility
 */

import fs from "node:fs";
import path from "node:path";

/**
 * @typedef {"act" | "obs" | "dec" | "ev"} EventType
 */

/**
 * Generate a scoped event ID.
 *
 * @param {string} runId - Run ID (e.g., "run-003")
 * @param {EventType} type - Event type
 * @param {number} sequence - Sequence number
 * @returns {string} Scoped event ID (e.g., "run-003:act:001")
 */
export function generateEventId(runId, type, sequence) {
  const seq = String(sequence).padStart(3, "0");
  return `${runId}:${type}:${seq}`;
}

/**
 * Parse a scoped event ID into components.
 *
 * @param {string} eventId - Scoped event ID
 * @returns {{ runId: string, type: EventType, sequence: number } | null}
 */
export function parseEventId(eventId) {
  if (!eventId || typeof eventId !== "string") return null;

  const parts = eventId.split(":");
  if (parts.length !== 3) return null;

  const [runId, type, seqStr] = parts;
  const sequence = parseInt(seqStr, 10);

  if (isNaN(sequence)) return null;
  if (!["act", "obs", "dec", "ev"].includes(type)) return null;

  return { runId, type: /** @type {EventType} */ (type), sequence };
}

/**
 * Check if an ID is a scoped event ID (vs legacy).
 *
 * @param {string} id
 * @returns {boolean}
 */
export function isScopedEventId(id) {
  return parseEventId(id) !== null;
}

/**
 * Get the next sequence number for an event type in a run.
 *
 * @param {Object} run - Run object
 * @param {EventType} type - Event type
 * @returns {number} Next sequence number
 */
export function getNextSequence(run, type) {
  const fieldMap = {
    act: "actions",
    obs: "observations",
    dec: "decisions",
    ev: "evidence",
  };

  const field = fieldMap[type];
  if (!field || !run[field]) return 1;

  // Count existing scoped IDs for this type
  let maxSeq = 0;
  for (const event of run[field]) {
    if (event.id && isScopedEventId(event.id)) {
      const parsed = parseEventId(event.id);
      if (parsed && parsed.type === type && parsed.sequence > maxSeq) {
        maxSeq = parsed.sequence;
      }
    }
  }

  return maxSeq + 1;
}

/**
 * Create a scoped event within a run.
 *
 * @param {Object} run - Run object
 * @param {EventType} type - Event type
 * @param {Object} data - Event data
 * @returns {Object} Created event with scoped ID
 */
export function createScopedEvent(run, type, data) {
  const sequence = getNextSequence(run, type);
  const id = generateEventId(run.id, type, sequence);

  return {
    id,
    ...data,
    timestamp: Date.now(),
  };
}

/**
 * Migrate legacy event IDs to scoped format.
 *
 * @param {Object} run - Run object
 * @returns {Object} Run with migrated IDs
 */
export function migrateRunEventIds(run) {
  if (!run) return run;

  const fieldMap = {
    actions: "act",
    observations: "obs",
    decisions: "dec",
    evidence: "ev",
  };

  for (const [field, type] of Object.entries(fieldMap)) {
    if (!run[field]) continue;

    for (let i = 0; i < run[field].length; i++) {
      const event = run[field][i];
      // Only migrate legacy IDs (not already scoped)
      if (event.id && !isScopedEventId(event.id)) {
        const sequence = i + 1;
        event.id = generateEventId(run.id, type, sequence);
      }
    }
  }

  return run;
}

/**
 * Get event type from scoped ID.
 *
 * @param {string} eventId
 * @returns {EventType | null}
 */
export function getEventType(eventId) {
  const parsed = parseEventId(eventId);
  return parsed ? parsed.type : null;
}

/**
 * Get run ID from scoped event ID.
 *
 * @param {string} eventId
 * @returns {string | null}
 */
export function getRunIdFromEvent(eventId) {
  const parsed = parseEventId(eventId);
  return parsed ? parsed.runId : null;
}
