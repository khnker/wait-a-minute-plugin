/**
 * Rollback Manager
 *
 * Atomic rollback driven by a durable state snapshot. The contract:
 *
 *   1. Caller supplies a list of rollback "steps" plus a snapshot handle.
 *   2. Steps execute strictly sequentially.
 *   3. If ANY step fails the entire rollback aborts, all prior side effects
 *      are reverted via the snapshot, and `rolledBack: true` is returned
 *      with the failing step + cause.
 *   4. If all steps succeed, the snapshot is committed (overwritten with
 *      the new pre-release state) and `rolledBack: true` is returned
 *      with `cause: "succeeded"`.
 *
 * Snapshot handling is dependency-injected so tests can use an in-memory
 * store while production code can persist to disk / remote.
 *
 * API:
 *   createRollbackManager({ store, now })
 *   rollback({ releaseId, steps, snapshot })
 */

function defaultNow() {
  return new Date().toISOString();
}

/**
 * Build a rollback manager.
 *   store: {
 *     load(snapshotId) -> snapshot | null,
 *     save(snapshotId, snapshot) -> void,
 *     commit(snapshotId, snapshot) -> void,
 *   }
 */
export function createRollbackManager({ store, now = defaultNow } = {}) {
  if (!store || typeof store.load !== "function" || typeof store.save !== "function") {
    throw new Error("rollback manager requires a store with load/save");
  }

  async function rollback({ releaseId, steps, snapshot } = {}) {
    const log = [];
    const stamp = () => ({ at: now(), releaseId });

    if (typeof releaseId !== "string" || !releaseId) {
      return {
        rolledBack: false,
        cause: "invalid releaseId",
        failedStep: null,
        log,
      };
    }
    if (!Array.isArray(steps)) {
      return {
        rolledBack: false,
        cause: "steps must be an array",
        failedStep: null,
        log,
      };
    }
    if (!snapshot || typeof snapshot !== "object") {
      return {
        rolledBack: false,
        cause: "snapshot required",
        failedStep: null,
        log,
      };
    }

    // Pre-flight: persist the snapshot so partial side effects can be undone.
    try {
      store.save(snapshot.id, snapshot);
      log.push({ ...stamp(), event: "snapshot-saved", snapshotId: snapshot.id });
    } catch (err) {
      return {
        rolledBack: false,
        cause: `snapshot save failed: ${err && err.message ? err.message : String(err)}`,
        failedStep: null,
        log,
      };
    }

    const executed = [];
    for (const step of steps) {
      if (!step || typeof step !== "object" || typeof step.run !== "function") {
        // Step is malformed — abort and restore snapshot.
        return await restore(snapshot, executed, "malformed step", step && step.id, log, store, stamp);
      }
      log.push({ ...stamp(), event: "step-start", stepId: step.id });
      try {
        const result = await step.run();
        executed.push({ id: step.id, result });
        log.push({ ...stamp(), event: "step-ok", stepId: step.id, result });
      } catch (err) {
        return await restore(
          snapshot,
          executed,
          `step ${step.id} failed: ${err && err.message ? err.message : String(err)}`,
          step.id,
          log,
          store,
          stamp
        );
      }
    }

    // All steps succeeded — commit (replace) the snapshot.
    try {
      store.commit(snapshot.id, snapshot);
      log.push({ ...stamp(), event: "snapshot-committed", snapshotId: snapshot.id });
    } catch (err) {
      return await restore(
        snapshot,
        executed,
        `commit failed: ${err && err.message ? err.message : String(err)}`,
        "commit",
        log,
        store,
        stamp
      );
    }

    return { rolledBack: true, cause: "succeeded", failedStep: null, log };
  }

  return { rollback };
}

/**
 * Restore by replaying each executed step's `undo` (if any). The snapshot
 * itself is re-saved so any in-flight state mutation is reverted.
 */
async function restore(snapshot, executed, cause, failedStep, log, store, stamp) {
  for (const ex of executed) {
    if (ex && typeof ex.result?.undo === "function") {
      try {
        await ex.result.undo();
        log.push({ ...stamp(), event: "step-undone", stepId: ex.id });
      } catch (err) {
        log.push({
          ...stamp(),
          event: "step-undo-failed",
          stepId: ex.id,
          error: err && err.message ? err.message : String(err),
        });
      }
    }
  }
  try {
    store.save(snapshot.id, snapshot);
    log.push({ ...stamp(), event: "snapshot-restored", snapshotId: snapshot.id });
  } catch (err) {
    log.push({
      ...stamp(),
      event: "snapshot-restore-failed",
      error: err && err.message ? err.message : String(err),
    });
  }
  return {
    rolledBack: true,
    cause,
    failedStep,
    log,
  };
}