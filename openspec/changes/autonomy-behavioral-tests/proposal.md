# Change: Autonomy Behavioral Tests

## Objective
Prove that WAM enables autonomous problem solving without becoming unsafe or prescriptive.

## Decisive criterion
> Agent rejects failed hypothesis, creates another, performs another experiment, fixes, and verifies — without WAM prescribing H2.

If this test suite does not pass, WAM is NOT considered autonomous.

## Coverage (15 tests)
- T-A: Autonomous investigation without asking user
- T-B: Failed hypothesis → new hypothesis without user
- T-C: Safe experiment with observation recording
- T-D: Replanning preserves prior discoveries
- T-E: Repeated experiment is detected
- T-F: Destructive action is BLOCKED
- T-G: Path traversal blocked by canonicalization
- T-H: `task` tool is GUARDED, not SAFE
- T-I: WamPolicyBlock is structured error
- T-J: DONE integrity: implementation != verified
- T-K: nextAction is advisory, ignored without block
- T-L: Failed mutation does not auto-retry
- T-M: Memory compaction preserves critical state
- T-N: RISK_LEVELS export integrity
- T-O: Cognitive state restoration after compaction
