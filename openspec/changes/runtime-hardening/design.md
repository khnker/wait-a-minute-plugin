# Design: Runtime Hardening

## 1. Hardening Layers
The runtime applies defenses at four layers:

### L1: Input Sanitization
- Sanitize file paths (no traversal, no absolute paths outside repo).
- Sanitize shell arguments (no injection, no command chaining).
- Sanitize JSON/YAML payloads (no prototype pollution, no oversized blobs).
- Truncate inputs to budget caps before processing.

### L2: Resource Guards
- Wall-clock timeouts per tool call and per task.
- Memory caps with backoff when exceeded.
- Loop detection: same tool + same arguments N times → escalate.
- Concurrency caps: max parallel tool calls; max in-flight plans.

### L3: Invariant Monitors
- Scope invariant: no mutation outside assessment scope.
- Risk invariant: no BLOCKED action executed without authorization.
- Evidence invariant: completion claims pass verifier.
- Reversibility invariant: irreversible actions require explicit acknowledgment.

### L4: Failure Containment
- Per-task sandboxing (working dir, env vars).
- Rollback recipes per plan step.
- Crash-safe state writes (see Durable State).
- Graceful shutdown: save in-flight state before exit.

## 2. Enforcement Model
- Guards run before each tool call (L1, L3).
- Monitors run continuously, not only on tool boundaries (L3).
- Failure containment is automatic and irreversible for irreversible steps only with confirmation.

## 3. Configuration
Hardening levels: `permissive`, `standard`, `strict`. Default `standard`. Configuration per-repo via `.wam/hardening.yaml`.

## 4. Telemetry
- Emit `hardening-event` for each block, retry, escalation.
- Aggregate into `.wam/hardening.log` for audit.
- Surface in the dev dashboard (see Release Production for thresholds).

## 5. Failure Modes
- Sanitization blocks payload → INSUFFICIENT, return sanitization report.
- Resource cap hit → retry with backoff, then escalate.
- Invariant violated → BLOCKED, require re-assessment.
- Crash mid-execution → durable state recovery on restart.