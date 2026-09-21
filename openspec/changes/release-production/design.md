# Design: Release Production

## 1. Release Gate
A release is the act of promoting a change-set from staging to production. The release gate MUST pass all of the following:

- **Assessment gate**: every task in the change-set has a valid, non-stale assessment.
- **Completion gate**: every task has a `VERIFIED` completion report.
- **Drift gate**: no unpredicted file changes; no out-of-scope mutations.
- **Context gate**: all canonical context artifacts used by the change are fresh and valid.
- **Hardening gate**: no unresolved hardening events (BLOCKED/ESCALATE) in `.wam/hardening.log`.
- **Consumer-test gate**: tests of consumers of changed modules pass.
- **Reversibility gate**: every irreversible step has explicit acknowledgment.

A single failure blocks the release.

## 2. Release Pipeline Stages
1. **Pre-flight**: run all validators in dry-run mode; emit report.
2. **Authoring**: agent/human authors release notes referencing change-set IDs.
3. **Verification**: run full end-to-end test suite against staging sandbox.
4. **Approval**: explicit human sign-off for non-trivial releases (configurable threshold).
5. **Rollout**: staged rollout (canary → 25% → 100%) with rollback recipe ready.
6. **Post-rollout monitoring**: watch `.wam/hardening.log` and completion rates; auto-rollback on regression.

## 3. Release Artifact
`.wam/releases/<release-id>/` contains:
- `manifest.json`: change-set, version, producer, gate results.
- `notes.md`: release notes.
- `rollback-recipe.json`: per-step rollback instructions.
- `signoff.json`: human approvals (multi-signer for strict mode).

## 4. Rollback
- Atomic: all steps or none.
- Driven by `rollback-recipe.json`.
- Re-emits durable state to pre-release snapshot.
- Emits a `release-rollback` event for audit.

## 5. Canary & Telemetry
- Canary subset receives the release first.
- Telemetry from runtime hardening + completion reports feeds a dashboard.
- Auto-rollback triggers on threshold breach (e.g., completion rate drop > X%).

## 6. Configuration
`.wam/release.yaml` per repo:
- Required signers.
- Canary percentage.
- Rollback thresholds.
- Required gates (default: all).