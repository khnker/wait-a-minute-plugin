# Proposal: production-integrity-hardening

## Goal
Harden WAM for production by fixing P0 integrity gaps: task identity hijack, session isolation, evidence structural validity, evidence ordering, completion gate supersession, context router evidence inclusion, verification check mapping, and repository hygiene.

## Motivation
Current state: task identity can be stolen by duplicate detection; active-task is global per repo; evidence can be marked valid without full causal lineage; evidence ordering uses ISO string subtraction (NaN); completion gate blocks on stale invalidated evidence; router evidence inclusion skips supporting evidence; evaluation checks lack 1:1 mapping validation.

## Capabilities
1. Task identity locked — explicit taskId wins, duplicate detection only candidate
2. Session isolation — active-task includes sessionId + projectRoot + ownership validation
3. Evidence integrity — verifyEvidence requires full lineage before valid; getAllEvidence ordered by Date.parse
4. Verification integrity — evaluateRequirement enforces 1:1 check_id mapping, no duplicates, unknown/missing fails
5. Completion gate supersession — prefers latest valid evidence, ignores stale invalidated
6. Context router evidence inclusion — requires_completion/requires_output edges in requiredClosure; evidence supports requirement included
7. Repository hygiene — remove node_modules from git tracking, remove hardcoded debug path, fix duplicate "type":"module"

## Invariants
- Explicit taskId never overwritten by findDuplicateTask
- Session A never sees session B's task via active-task
- Evidence without full lineage cannot be marked valid
- No duplicate check_id passes verification
- Completion gate uses only authoritative (latest valid) evidence
- Context router includes supporting evidence for requirements
- node_modules never committed
